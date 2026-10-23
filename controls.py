"""Allowlisted Windows input and system controls. No shell commands are accepted."""

from __future__ import annotations

import ctypes
import ctypes.wintypes
import platform
import subprocess
import threading
from typing import Any


KEYS = {
    "enter": 0x0D, "tab": 0x09, "esc": 0x1B, "backspace": 0x08,
    "delete": 0x2E, "space": 0x20, "left": 0x25, "up": 0x26,
    "right": 0x27, "down": 0x28,
}
SHORTCUTS = {
    "alt_tab": (0x12, 0x09), "win_d": (0x5B, 0x44),
    "ctrl_c": (0x11, 0x43), "ctrl_v": (0x11, 0x56),
    "ctrl_x": (0x11, 0x58), "ctrl_z": (0x11, 0x5A),
    "ctrl_a": (0x11, 0x41), "ctrl_shift_esc": (0x11, 0x10, 0x1B),
}
VOLUME_KEYS = {"up": 0xAF, "down": 0xAE, "mute": 0xAD}
MAX_TEXT_LENGTH = 1000


def _require_windows() -> None:
    if platform.system() != "Windows":
        raise RuntimeError("Windows controls are only available on Windows")


def _key_event(vk: int, key_up: bool = False) -> None:
    flags = 0x0002 if key_up else 0
    ctypes.windll.user32.keybd_event(vk, 0, flags, 0)


def _click(button: str) -> None:
    flags = {"left": (0x0002, 0x0004), "right": (0x0008, 0x0010), "middle": (0x0020, 0x0040)}
    down, up = flags[button]
    ctypes.windll.user32.mouse_event(down, 0, 0, 0, 0)
    ctypes.windll.user32.mouse_event(up, 0, 0, 0, 0)


def _scroll(direction: str, amount: int) -> None:
    flag = 0x0800 if direction == "vertical" else 0x1000
    ctypes.windll.user32.mouse_event(flag, 0, 0, amount * 120, 0)


def _schedule_power(action: str) -> None:
    def run() -> None:
        if action == "lock":
            ctypes.windll.user32.LockWorkStation()
        elif action == "sleep":
            ctypes.windll.powrprof.SetSuspendState(False, False, False)
        elif action == "shutdown":
            subprocess.Popen(["shutdown.exe", "/s", "/t", "0"], close_fds=True)
        elif action == "restart":
            subprocess.Popen(["shutdown.exe", "/r", "/t", "0"], close_fds=True)

    timer = threading.Timer(0.8, run)
    timer.daemon = True
    timer.start()


def execute(action: Any, data: Any) -> dict[str, str]:
    """Execute one strictly allowlisted action after validating its arguments."""
    if not isinstance(action, str) or not isinstance(data, dict):
        raise ValueError("invalid_request")
    _require_windows()

    if action == "move":
        dx, dy = data.get("dx"), data.get("dy")
        if type(dx) is not int or type(dy) is not int or abs(dx) > 200 or abs(dy) > 200:
            raise ValueError("invalid_movement")
        point = ctypes.wintypes.POINT()
        if not ctypes.windll.user32.GetCursorPos(ctypes.byref(point)):
            raise RuntimeError("cursor_unavailable")
        width, height = ctypes.windll.user32.GetSystemMetrics(0), ctypes.windll.user32.GetSystemMetrics(1)
        x, y = max(0, min(width - 1, point.x + dx)), max(0, min(height - 1, point.y + dy))
        ctypes.windll.user32.SetCursorPos(x, y)
        return {"status": "ok", "action": action}

    if action == "click":
        button = data.get("button")
        if button not in ("left", "right", "middle", "double"):
            raise ValueError("invalid_button")
        _click("left" if button == "double" else button)
        if button == "double":
            _click("left")
        return {"status": "ok", "action": action}

    if action == "scroll":
        direction, amount = data.get("direction"), data.get("amount")
        if direction not in ("vertical", "horizontal") or type(amount) is not int or amount == 0 or abs(amount) > 10:
            raise ValueError("invalid_scroll")
        _scroll(direction, amount)
        return {"status": "ok", "action": action}

    if action == "type_text":
        text = data.get("text")
        if not isinstance(text, str) or not text or len(text) > MAX_TEXT_LENGTH or any(ord(ch) < 32 and ch not in "\t\n\r" for ch in text):
            raise ValueError("invalid_text")
        # Unicode key events support Arabic and do not read or modify the clipboard.
        for char in text:
            encoded = char.encode("utf-16-le")
            for offset in range(0, len(encoded), 2):
                unit = int.from_bytes(encoded[offset:offset + 2], "little")
                ctypes.windll.user32.keybd_event(0, unit, 0x0004, 0)
                ctypes.windll.user32.keybd_event(0, unit, 0x0006, 0)
        return {"status": "ok", "action": action}

    if action == "key":
        key = data.get("key")
        if key not in KEYS:
            raise ValueError("invalid_key")
        vk = KEYS[key]
        _key_event(vk)
        _key_event(vk, True)
        return {"status": "ok", "action": action}

    if action == "shortcut":
        shortcut = data.get("shortcut")
        if shortcut not in SHORTCUTS:
            raise ValueError("invalid_shortcut")
        keys = SHORTCUTS[shortcut]
        for vk in keys:
            _key_event(vk)
        for vk in reversed(keys):
            _key_event(vk, True)
        return {"status": "ok", "action": action}

    if action == "volume":
        operation = data.get("operation")
        if operation not in VOLUME_KEYS:
            raise ValueError("invalid_volume_action")
        vk = VOLUME_KEYS[operation]
        _key_event(vk)
        _key_event(vk, True)
        return {"status": "ok", "action": action}

    if action == "task_manager":
        subprocess.Popen(["taskmgr.exe"], close_fds=True)
        return {"status": "ok", "action": action}

    if action == "power":
        operation = data.get("operation")
        if operation not in ("lock", "sleep", "shutdown", "restart") or data.get("confirmed") is not True:
            raise ValueError("confirmation_required")
        _schedule_power(operation)
        return {"status": "accepted", "action": action}

    raise ValueError("unknown_action")
