"""Local services for screen capture, bounded file access, monitoring and apps."""

from __future__ import annotations

import base64
import io
import os
import shutil
import time
from pathlib import Path
from urllib.parse import quote

import mss
from PIL import Image
import psutil


MAX_UPLOAD_BYTES = 16 * 1024 * 1024
MAX_LIST_ENTRIES = 500
_net_previous = None
_net_previous_at = None


def allowed_roots() -> list[Path]:
    home = Path.home().resolve()
    candidates = [home / name for name in ("Desktop", "Documents", "Downloads", "Pictures", "Videos")]
    return [path for path in candidates if path.exists() and path.is_dir()]


def _within(path: Path, root: Path) -> bool:
    try:
        return os.path.commonpath((str(path), str(root))) == str(root)
    except (ValueError, OSError):
        return False


def safe_path(raw: str | None, *, must_exist: bool = True) -> Path:
    if not isinstance(raw, str) or not raw or len(raw) > 4096:
        raise ValueError("invalid_path")
    candidate = Path(raw).expanduser().resolve(strict=must_exist)
    roots = allowed_roots()
    for root in roots:
        if candidate == root or _within(candidate, root):
            return candidate
    raise PermissionError("path_not_allowed")


def file_roots() -> list[dict]:
    return [{"name": path.name or str(path), "path": str(path)} for path in allowed_roots()]


def list_files(raw_path: str | None) -> dict:
    if raw_path:
        folder = safe_path(raw_path)
    else:
        roots = allowed_roots()
        if not roots:
            return {"path": "", "parent": None, "roots": [], "items": []}
        folder = roots[0]
    if not folder.is_dir():
        raise ValueError("not_a_folder")
    roots = allowed_roots()
    items = []
    for entry in sorted(folder.iterdir(), key=lambda item: (not item.is_dir(), item.name.casefold()))[:MAX_LIST_ENTRIES]:
        try:
            stat = entry.stat(follow_symlinks=False)
        except OSError:
            continue
        items.append({
            "name": entry.name, "path": str(entry), "is_dir": entry.is_dir(),
            "size": stat.st_size if entry.is_file() else None,
            "modified": int(stat.st_mtime),
            "extension": entry.suffix.lower(),
        })
    parent = str(folder.parent) if any(_within(folder.parent, root) for root in roots) else None
    return {"path": str(folder), "parent": parent, "roots": file_roots(), "items": items, "truncated": len(items) == MAX_LIST_ENTRIES}


def _safe_child(folder_raw: str, name: str) -> Path:
    folder = safe_path(folder_raw)
    if not folder.is_dir() or not isinstance(name, str) or not name or name in (".", ".."):
        raise ValueError("invalid_name")
    if any(char in name for char in '<>:"/\\|?*') or name.endswith((".", " ")):
        raise ValueError("invalid_name")
    target = (folder / name).resolve(strict=False)
    safe_path(str(target), must_exist=False)
    return target


def create_folder(folder: str, name: str) -> dict:
    target = _safe_child(folder, name)
    target.mkdir(exist_ok=False)
    return {"status": "ok", "name": target.name}


def rename_path(raw_path: str, new_name: str) -> dict:
    source = safe_path(raw_path)
    if source == next((root for root in allowed_roots() if source == root), None):
        raise PermissionError("root_operation_not_allowed")
    target = _safe_child(str(source.parent), new_name)
    if target.exists():
        raise FileExistsError("target_exists")
    source.rename(target)
    return {"status": "ok", "name": target.name}


def delete_path(raw_path: str, confirmed: bool) -> dict:
    target = safe_path(raw_path)
    if target in allowed_roots() or confirmed is not True:
        raise PermissionError("confirmation_or_child_path_required")
    if target.is_dir():
        target.rmdir()  # Deliberately refuses recursive directory deletion.
    else:
        target.unlink()
    return {"status": "ok"}


def transfer_path(source_raw: str, destination_folder_raw: str, operation: str, confirmed: bool = False) -> dict:
    source = safe_path(source_raw)
    destination_folder = safe_path(destination_folder_raw)
    if not destination_folder.is_dir() or source.is_dir():
        raise ValueError("file_and_folder_required")
    destination = _safe_child(str(destination_folder), source.name)
    if destination.exists() and confirmed is not True:
        raise FileExistsError("confirmation_required_for_overwrite")
    if operation == "copy":
        shutil.copy2(source, destination)
    elif operation == "move":
        shutil.move(str(source), str(destination))
    else:
        raise ValueError("invalid_transfer")
    return {"status": "ok", "name": destination.name}


def save_upload(folder_raw: str, name: str, encoded: str, confirmed: bool = False) -> dict:
    destination = _safe_child(folder_raw, name)
    try:
        data = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError):
        raise ValueError("invalid_upload") from None
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError("upload_size_out_of_range")
    if destination.exists() and confirmed is not True:
        raise FileExistsError("confirmation_required_for_overwrite")
    with destination.open("wb") as output:
        output.write(data)
    return {"status": "ok", "name": destination.name, "size": len(data)}


def download_file(raw_path: str) -> tuple[Path, bytes]:
    path = safe_path(raw_path)
    if not path.is_file():
        raise ValueError("not_a_file")
    if path.stat().st_size > MAX_UPLOAD_BYTES:
        raise ValueError("download_size_limit_exceeded")
    return path, path.read_bytes()


def monitors() -> list[dict]:
    with mss.MSS() as capture:
        return [{"index": index, "name": f"Display {index}", "width": item["width"], "height": item["height"], "primary": index == 1}
                for index, item in enumerate(capture.monitors[1:], start=1)]


def capture_screen(index: int = 1) -> bytes:
    if type(index) is not int or index < 1:
        raise ValueError("invalid_monitor")
    with mss.MSS() as capture:
        if index >= len(capture.monitors):
            raise ValueError("monitor_not_available")
        shot = capture.grab(capture.monitors[index])
        image = Image.frombytes("RGB", shot.size, shot.rgb)
        image.thumbnail((1920, 1200))
        out = io.BytesIO()
        image.save(out, format="JPEG", quality=72, optimize=True)
        return out.getvalue()


def save_screenshot(index: int = 1) -> dict:
    folder = Path.home() / "Pictures" / "PC Control Screenshots"
    folder.mkdir(parents=True, exist_ok=True)
    filename = time.strftime("Screenshot-%Y%m%d-%H%M%S.jpg")
    destination = folder / filename
    destination.write_bytes(capture_screen(index))
    return {"status": "ok", "path": str(destination)}


def system_monitor() -> dict:
    memory = psutil.virtual_memory()
    disk_roots = []
    for partition in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(partition.mountpoint)
        except (OSError, PermissionError):
            continue
        disk_roots.append({"name": partition.device or partition.mountpoint, "total": usage.total, "used": usage.used, "free": usage.free, "percent": usage.percent})
    processes = []
    for process in psutil.process_iter(["pid", "name", "memory_info"]):
        try:
            info = process.info
            memory_bytes = info.get("memory_info").rss if info.get("memory_info") else 0
            processes.append({"pid": info["pid"], "name": info.get("name") or "Unknown", "memory": memory_bytes})
        except (psutil.Error, OSError):
            continue
    processes.sort(key=lambda item: item["memory"], reverse=True)
    return {"cpu_percent": psutil.cpu_percent(interval=0.1), "memory": {"total": memory.total, "used": memory.used, "available": memory.available, "percent": memory.percent},
            "disks": disk_roots, "processes": processes[:8], "uptime_seconds": max(0, int(time.time() - psutil.boot_time())), "gpu": None, "temperature": None}


def network_status() -> dict:
    global _net_previous, _net_previous_at
    current = psutil.net_io_counters()
    now = time.monotonic()
    received_rate = sent_rate = 0
    if _net_previous is not None and _net_previous_at is not None:
        elapsed = max(0.001, now - _net_previous_at)
        received_rate = max(0, current.bytes_recv - _net_previous.bytes_recv) / elapsed
        sent_rate = max(0, current.bytes_sent - _net_previous.bytes_sent) / elapsed
    _net_previous, _net_previous_at = current, now
    adapters = []
    addresses = psutil.net_if_addrs()
    statuses = psutil.net_if_stats()
    for name, entries in addresses.items():
        status = statuses.get(name)
        ipv4 = next((entry.address for entry in entries if entry.family.name == "AF_INET"), None)
        if ipv4:
            adapters.append({"name": name, "ipv4": ipv4, "is_up": bool(status and status.isup), "speed_mbps": status.speed if status else None})
    return {"adapters": adapters, "bytes_sent": current.bytes_sent, "bytes_received": current.bytes_recv,
              "send_bytes_per_second": round(sent_rate), "receive_bytes_per_second": round(received_rate), "local_only": True}


def applications() -> list[dict]:
    if os.name != "nt":
        return []
    try:
        import pythoncom
        import win32com.client
    except ImportError:
        return []
    roots = [Path(os.environ.get("APPDATA", "")) / "Microsoft/Windows/Start Menu/Programs",
             Path(os.environ.get("PROGRAMDATA", "C:/ProgramData")) / "Microsoft/Windows/Start Menu/Programs"]
    found = []
    pythoncom.CoInitialize()
    try:
        shell = win32com.client.Dispatch("WScript.Shell")
        for root in roots:
            if not root.is_dir():
                continue
            for shortcut in root.rglob("*.lnk"):
                try:
                    link = shell.CreateShortcut(str(shortcut))
                    target = Path(link.TargetPath)
                    if target.suffix.lower() != ".exe" or not target.is_file():
                        continue
                    found.append({"id": str(shortcut), "name": shortcut.stem, "target": str(shortcut)})
                    if len(found) >= 200:
                        break
                except Exception:
                    continue
    finally:
        pythoncom.CoUninitialize()
    unique = {item["id"].casefold(): item for item in found}
    return sorted(unique.values(), key=lambda item: item["name"].casefold())


def launch_application(app_id: str) -> dict:
    if not isinstance(app_id, str):
        raise ValueError("invalid_application")
    selected = next((app for app in applications() if app["id"].casefold() == app_id.casefold()), None)
    if not selected:
        raise PermissionError("application_not_in_trusted_list")
    os.startfile(selected["target"])
    return {"status": "ok", "name": selected["name"]}
