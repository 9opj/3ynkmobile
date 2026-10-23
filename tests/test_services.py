import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

import services


class BoundedFileServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / "work")
        self.root = Path(self.temp.name).resolve()
        self.folder = self.root / "資料"
        self.folder.mkdir()
        self.roots = patch.object(services, "allowed_roots", return_value=[self.root])
        self.roots.start()
        self.addCleanup(self.roots.stop)
        self.addCleanup(self.temp.cleanup)

    def test_blocks_paths_outside_approved_roots(self):
        with self.assertRaises(PermissionError):
            services.safe_path(str(self.root.parent))
        with self.assertRaises(PermissionError):
            services.safe_path(str(self.root / ".." / "outside.txt"), must_exist=False)

    def test_create_upload_rename_copy_download_and_delete(self):
        created = services.create_folder(str(self.root), "new-folder")
        self.assertEqual(created["name"], "new-folder")
        uploaded = services.save_upload(str(self.folder), "عربي.txt", "aGVsbG8=")
        self.assertEqual(uploaded["size"], 5)
        file_path = self.folder / "عربي.txt"
        renamed = services.rename_path(str(file_path), "renamed.txt")
        self.assertEqual(renamed["name"], "renamed.txt")
        copied = services.transfer_path(str(self.folder / "renamed.txt"), str(self.root / "new-folder"), "copy")
        self.assertEqual(copied["name"], "renamed.txt")
        path, content = services.download_file(str(self.root / "new-folder" / "renamed.txt"))
        self.assertEqual(path.name, "renamed.txt")
        self.assertEqual(content, b"hello")
        services.delete_path(str(self.root / "new-folder" / "renamed.txt"), True)
        self.assertFalse((self.root / "new-folder" / "renamed.txt").exists())

    def test_upload_overwrite_and_recursive_delete_require_explicit_safe_paths(self):
        file_path = self.folder / "exists.txt"
        file_path.write_text("original")
        with self.assertRaises(FileExistsError):
            services.save_upload(str(self.folder), "exists.txt", "bmV3")
        services.save_upload(str(self.folder), "exists.txt", "bmV3", confirmed=True)
        self.assertEqual(file_path.read_text(), "new")
        child = self.folder / "child"
        child.mkdir()
        (child / "file.txt").write_text("keep")
        with self.assertRaises(OSError):
            services.delete_path(str(child), True)
        with self.assertRaises(PermissionError):
            services.delete_path(str(self.root), True)


class WindowsServiceReadTests(unittest.TestCase):
    def test_monitor_and_network_return_real_system_fields(self):
        monitor = services.system_monitor()
        self.assertGreater(monitor["memory"]["total"], 0)
        self.assertGreaterEqual(monitor["cpu_percent"], 0)
        self.assertIn("gpu", monitor)
        network = services.network_status()
        self.assertTrue(network["local_only"])

    def test_screen_capture_returns_an_image_without_saving_it(self):
        monitors = services.monitors()
        self.assertTrue(monitors)
        image_bytes = services.capture_screen(monitors[0]["index"])
        image = Image.open(io.BytesIO(image_bytes))
        self.assertEqual(image.format, "JPEG")
        self.assertGreater(image.width, 0)


if __name__ == "__main__":
    unittest.main()
