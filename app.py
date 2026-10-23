"""Local-only starter service for the PC Control project."""

from __future__ import annotations

import json
import os
import mimetypes
import threading
import webbrowser
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

import controls
import services
import signalrgb_service
import openrgb_service

ROOT = Path(__file__).resolve().parent
WEB_ROOT = ROOT / "web"
HOST = "127.0.0.1"
PORT_WAS_CONFIGURED = "PC_CONTROL_PORT" in os.environ
PORT = int(os.environ.get("PC_CONTROL_PORT", "8765"))
STARTED_AT = time.time()


class LocalServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class Handler(SimpleHTTPRequestHandler):
    server_version = "3ynk-local/0.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def _valid_host(self) -> bool:
        return self.headers.get("Host", "").lower() in {
            f"localhost:{PORT}", f"127.0.0.1:{PORT}", f"[::1]:{PORT}"
        }

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _bytes(self, status: int, content_type: str, body: bytes, extra_headers: dict | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _request_json(self, max_bytes: int = 24 * 1024 * 1024) -> dict:
        if self.headers.get_content_type() != "application/json":
            raise ValueError("json_required")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("invalid_request_size") from None
        if length <= 0 or length > max_bytes:
            raise OverflowError("invalid_request_size")
        body = json.loads(self.rfile.read(length))
        if not isinstance(body, dict):
            raise ValueError("invalid_request")
        return body

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'")
        super().end_headers()

    def do_GET(self) -> None:
        if not self._valid_host():
            self._json(403, {"error": "host_not_allowed"})
            return
        path = urlparse(self.path).path
        if path == "/api/health":
            self._json(200, {
                "status": "ok",
                "service": "3ynk Local",
                "host": HOST,
                "port": PORT,
                "uptime_seconds": max(0, int(time.time() - STARTED_AT)),
            })
            return
        query = parse_qs(urlparse(self.path).query)
        try:
            if path == "/api/screens":
                self._json(200, {"monitors": services.monitors()})
                return
            if path == "/api/screen":
                monitor = int(query.get("monitor", ["1"])[0])
                self._bytes(200, "image/jpeg", services.capture_screen(monitor))
                return
            if path == "/api/monitor":
                self._json(200, services.system_monitor())
                return
            if path == "/api/network":
                self._json(200, services.network_status())
                return
            if path == "/api/apps":
                self._json(200, {"applications": services.applications()})
                return
            if path == "/api/files/roots":
                self._json(200, {"roots": services.file_roots()})
                return
            if path == "/api/rgb":
                self._json(200, signalrgb_service.status())
                return
            if path == "/api/openrgb":
                self._json(200, openrgb_service.status())
                return
            if path == "/api/files/list":
                raw_path = query.get("path", [None])[0]
                self._json(200, services.list_files(raw_path))
                return
            if path == "/api/files/download":
                raw_path = query.get("path", [""])[0]
                file_path, content = services.download_file(raw_path)
                filename = quote(file_path.name)
                content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
                self._bytes(200, content_type, content, {"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"})
                return
        except PermissionError as error:
            self._json(403, {"error": str(error)})
            return
        except FileNotFoundError:
            self._json(404, {"error": "not_found"})
            return
        except (ValueError, TypeError, IndexError) as error:
            self._json(400, {"error": str(error) or "invalid_request"})
            return
        except Exception:
            self._json(500, {"error": "service_failed"})
            return
        if path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        if not self._valid_host():
            self._json(403, {"error": "host_not_allowed"})
            return
        expected_origins = {f"http://localhost:{PORT}", f"http://127.0.0.1:{PORT}"}
        if self.headers.get("Origin") not in expected_origins:
            self._json(403, {"error": "origin_not_allowed"})
            return
        path = urlparse(self.path).path
        supported_paths = {"/api/control", "/api/files/upload", "/api/files/create-folder", "/api/files/rename", "/api/files/delete", "/api/files/copy", "/api/files/move", "/api/screenshot", "/api/apps/launch", "/api/rgb/brightness", "/api/rgb/effect", "/api/rgb/cycle", "/api/rgb/enabled", "/api/openrgb/profile"}
        if path not in supported_paths:
            self._json(404, {"error": "not_found"})
            return
        try:
            body = self._request_json(8192 if path == "/api/control" else 24 * 1024 * 1024)
            if path == "/api/control":
                result = controls.execute(body.get("action"), body.get("data", {}))
            elif path == "/api/files/upload":
                result = services.save_upload(body.get("folder"), body.get("name"), body.get("data"), body.get("confirmed", False))
            elif path == "/api/files/create-folder":
                result = services.create_folder(body.get("folder"), body.get("name"))
            elif path == "/api/files/rename":
                result = services.rename_path(body.get("path"), body.get("name"))
            elif path == "/api/files/delete":
                result = services.delete_path(body.get("path"), body.get("confirmed"))
            elif path in ("/api/files/copy", "/api/files/move"):
                result = services.transfer_path(body.get("path"), body.get("destination"), "copy" if path.endswith("copy") else "move", body.get("confirmed", False))
            elif path == "/api/screenshot":
                result = services.save_screenshot(body.get("monitor", 1))
            elif path == "/api/rgb/brightness":
                result = signalrgb_service.set_brightness(body.get("value"))
            elif path == "/api/rgb/effect":
                effect_id = body.get("id")
                if effect_id:
                    result = signalrgb_service.apply_effect(effect_id, body.get("name", ""))
                else:
                    result = signalrgb_service.apply_effect_by_name(body.get("name", ""))
            elif path == "/api/rgb/cycle":
                result = signalrgb_service.cycle_effect(body.get("direction"))
            elif path == "/api/rgb/enabled":
                result = signalrgb_service.set_enabled(body.get("enabled"))
            elif path == "/api/openrgb/profile":
                if signalrgb_service.is_running():
                    raise openrgb_service.OpenRGBError("close_signalrgb_before_openrgb_control")
                result = openrgb_service.load_profile(body.get("name"))
            else:
                result = services.launch_application(body.get("id"))
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
            self._json(400, {"error": str(error) or "invalid_request"})
            return
        except OverflowError:
            self._json(413, {"error": "invalid_request_size"})
            return
        except PermissionError as error:
            self._json(403, {"error": str(error)})
            return
        except FileNotFoundError:
            self._json(404, {"error": "not_found"})
            return
        except FileExistsError:
            self._json(409, {"error": "target_exists_or_confirmation_required"})
            return
        except OSError:
            self._json(400, {"error": "operation_failed"})
            return
        except signalrgb_service.SignalRGBError as error:
            self._json(403 if error.status == 403 else 503, {"error": str(error), "signalrgb_status": error.status})
            return
        except openrgb_service.OpenRGBError as error:
            self._json(409 if str(error) == "close_signalrgb_before_openrgb_control" else 503, {"error": str(error)})
            return
        except RuntimeError as error:
            self._json(501, {"error": str(error)})
            return
        except Exception:
            self._json(500, {"error": "action_failed"})
            return
        self._json(200, result)

    def log_message(self, fmt: str, *args) -> None:
        # Avoid logging request content or other potentially sensitive data.
        print(f"[{self.log_date_time_string()}] {self.address_string()} {fmt % args}")


def main() -> None:
    global PORT
    candidates = [PORT] if PORT_WAS_CONFIGURED else range(PORT, min(PORT + 20, 65536))
    last_error = None
    for candidate in candidates:
        try:
            server = LocalServer((HOST, candidate), Handler)
            PORT = server.server_address[1]
            break
        except OSError as error:
            last_error = error
    else:
        raise OSError(f"No available localhost port in the selected range beginning at {PORT}") from last_error
    url = f"http://localhost:{PORT}"
    print(f"PC Control is available at {url}")
    if os.environ.get("PC_CONTROL_NO_BROWSER") != "1":
        threading.Thread(target=webbrowser.open, args=(url,), daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping PC Control...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
