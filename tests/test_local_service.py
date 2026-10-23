import json
import os
import socket
import subprocess
import sys
import time
import unittest
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class LocalServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            cls.port = sock.getsockname()[1]
        env = os.environ.copy()
        env["PC_CONTROL_PORT"] = str(cls.port)
        env["PC_CONTROL_NO_BROWSER"] = "1"
        cls.process = subprocess.Popen(
            [sys.executable, str(ROOT / "app.py")], cwd=ROOT, env=env,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        cls.base = f"http://127.0.0.1:{cls.port}"
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            try:
                urllib.request.urlopen(cls.base + "/api/health", timeout=0.25).close()
                return
            except (OSError, urllib.error.URLError):
                if cls.process.poll() is not None:
                    raise AssertionError("service exited before it became ready")
                time.sleep(0.05)
        raise AssertionError("service did not become ready")

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        try:
            cls.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            cls.process.kill()
            cls.process.wait(timeout=3)

    def test_health_check(self):
        with urllib.request.urlopen(self.base + "/api/health", timeout=2) as response:
            payload = json.load(response)
            self.assertEqual(response.status, 200)
            self.assertEqual(payload["status"], "ok")
            self.assertEqual(payload["host"], "127.0.0.1")
            self.assertEqual(payload["port"], self.port)
            self.assertGreaterEqual(payload["uptime_seconds"], 0)

    def test_home_page_and_assets_are_served(self):
        for path, expected in [
            ("/", b"3ynk"),
            ("/styles.css", b".sidebar"),
            ("/app.js", b"checkHealth"),
        ]:
            with self.subTest(path=path), urllib.request.urlopen(self.base + path, timeout=2) as response:
                self.assertEqual(response.status, 200)
                self.assertIn(expected, response.read())

    def test_rejects_unexpected_host(self):
        request = urllib.request.Request(self.base + "/api/health", headers={"Host": "example.com"})
        with self.assertRaises(urllib.error.HTTPError) as result:
            urllib.request.urlopen(request, timeout=2)
        self.assertEqual(result.exception.code, 403)

    def test_post_is_not_an_action_interface(self):
        request = urllib.request.Request(self.base + "/api/control", data=b"{}", method="POST")
        with self.assertRaises(urllib.error.HTTPError) as result:
            urllib.request.urlopen(request, timeout=2)
        self.assertEqual(result.exception.code, 403)

    def test_control_api_rejects_unknown_actions(self):
        body = json.dumps({"action": "shell", "data": {"command": "anything"}}).encode()
        request = urllib.request.Request(
            self.base + "/api/control", data=body, method="POST",
            headers={"Origin": self.base, "Content-Type": "application/json"},
        )
        with self.assertRaises(urllib.error.HTTPError) as result:
            urllib.request.urlopen(request, timeout=2)
        self.assertEqual(result.exception.code, 400)

    def test_monitoring_and_sections_are_real_endpoints(self):
        for path in ("/api/screens", "/api/monitor", "/api/network", "/api/apps", "/api/files/roots", "/api/rgb", "/api/openrgb"):
            with self.subTest(path=path), urllib.request.urlopen(self.base + path, timeout=8) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers.get_content_type(), "application/json")

    def test_signalrgb_status_distinguishes_connection_from_api_access(self):
        with urllib.request.urlopen(self.base + "/api/rgb", timeout=5) as response:
            payload = json.load(response)
        for key in ("running", "connected", "api_access", "pro_required", "effects", "layouts"):
            self.assertIn(key, payload)
        self.assertIsInstance(payload["running"], bool)
        self.assertIsInstance(payload["api_access"], bool)

    def test_openrgb_status_is_honest_when_sdk_is_not_running(self):
        with urllib.request.urlopen(self.base + "/api/openrgb", timeout=4) as response:
            payload = json.load(response)
        self.assertIn("sdk_available", payload)
        self.assertIn("device_count", payload)
        self.assertIsInstance(payload["sdk_available"], bool)
        self.assertIsInstance(payload["profiles"], list)

    def test_live_screen_endpoint_returns_a_non_cached_jpeg(self):
        with urllib.request.urlopen(self.base + "/api/screen?monitor=1", timeout=8) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers.get_content_type(), "image/jpeg")
            self.assertEqual(response.headers.get("Cache-Control"), "no-store")
            self.assertTrue(response.read().startswith(b"\xff\xd8"))

    def test_file_api_rejects_paths_outside_user_roots(self):
        path = urllib.parse.urlencode({"path": "C:\\Windows"})
        with self.assertRaises(urllib.error.HTTPError) as result:
            urllib.request.urlopen(self.base + "/api/files/list?" + path, timeout=3)
        self.assertEqual(result.exception.code, 403)


if __name__ == "__main__":
    unittest.main()
