import json
import http.client
import os
import queue
import re
import socket
import subprocess
import sys
import threading
import time
import unittest
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
import services


class LocalServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            cls.port = sock.getsockname()[1]
        env = os.environ.copy()
        env["PC_CONTROL_PORT"] = str(cls.port)
        env["PC_CONTROL_NO_BROWSER"] = "1"
        cls.output = queue.Queue()
        cls.process = subprocess.Popen(
            [sys.executable, "-u", str(ROOT / "app.py")], cwd=ROOT, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
        )
        threading.Thread(target=lambda: [cls.output.put(line.rstrip()) for line in cls.process.stdout], daemon=True).start()
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
        lines = []
        while True:
            try: lines.append(cls.output.get_nowait())
            except queue.Empty: break
        raise AssertionError(f"service did not become ready (exit={cls.process.poll()}, output={lines})")

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
            self.assertEqual(payload["host"], "0.0.0.0")
            self.assertEqual(payload["port"], self.port)
            self.assertIn("lan_addresses", payload)
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

    def test_phone_lan_pairing_and_authenticated_api(self):
        lan_ip = next(item["ipv4"] for item in services.network_status()["adapters"]
                      if item["is_up"] and item["ipv4"].startswith(("10.", "172.", "192.168.")))
        lines = []
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            try:
                line = self.output.get(timeout=0.2)
            except queue.Empty:
                continue
            lines.append(line)
            match = re.search(r"Phone pairing code \(valid for this run\): ([A-Z2-9]{8})", line)
            if match:
                code = match.group(1)
                break
        else:
            self.fail("service did not print its phone pairing code")

        def request(path, body=None, token=None):
            connection = http.client.HTTPConnection(lan_ip, self.port, timeout=5, source_address=(lan_ip, 0))
            headers = {"Host": f"{lan_ip}:{self.port}", "Origin": f"http://{lan_ip}:{self.port}"}
            if body is not None:
                headers["Content-Type"] = "application/json"
                body = json.dumps(body).encode()
            if token:
                headers["Authorization"] = f"Bearer {token}"
            connection.request("POST" if body is not None else "GET", path, body=body, headers=headers)
            response = connection.getresponse()
            result = json.loads(response.read())
            connection.close()
            return response.status, result

        status, _ = request("/api/monitor")
        self.assertEqual(status, 401)
        status, paired = request("/api/pair", {"code": code.lower()})
        self.assertEqual(status, 200)
        self.assertTrue(paired["token"])
        status, monitor = request("/api/monitor", token=paired["token"])
        self.assertEqual(status, 200)
        self.assertIn("cpu_percent", monitor)


if __name__ == "__main__":
    unittest.main()
