import unittest
from unittest.mock import patch

import controls


class AllowlistedControlTests(unittest.TestCase):
    def setUp(self):
        self.windows = patch.object(controls, "_require_windows")
        self.windows.start()
        self.addCleanup(self.windows.stop)

    def test_arbitrary_shell_action_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "unknown_action"):
            controls.execute("shell", {"command": "whoami"})

    def test_movement_is_bounded(self):
        with self.assertRaisesRegex(ValueError, "invalid_movement"):
            controls.execute("move", {"dx": 201, "dy": 0})
        with self.assertRaisesRegex(ValueError, "invalid_movement"):
            controls.execute("move", {"dx": True, "dy": 0})

    def test_only_named_keyboard_actions_are_accepted(self):
        with self.assertRaisesRegex(ValueError, "invalid_key"):
            controls.execute("key", {"key": "F12"})
        with self.assertRaisesRegex(ValueError, "invalid_shortcut"):
            controls.execute("shortcut", {"shortcut": "arbitrary"})

    def test_text_is_bounded_and_rejects_control_characters(self):
        with self.assertRaisesRegex(ValueError, "invalid_text"):
            controls.execute("type_text", {"text": "\x00"})
        with self.assertRaisesRegex(ValueError, "invalid_text"):
            controls.execute("type_text", {"text": "x" * 1001})

    def test_power_action_requires_explicit_confirmation(self):
        with patch.object(controls, "_schedule_power") as schedule:
            with self.assertRaisesRegex(ValueError, "confirmation_required"):
                controls.execute("power", {"operation": "shutdown", "confirmed": False})
            schedule.assert_not_called()
            result = controls.execute("power", {"operation": "shutdown", "confirmed": True})
            self.assertEqual(result["status"], "accepted")
            schedule.assert_called_once_with("shutdown")

    def test_mouse_and_keyboard_actions_call_only_mapped_operations(self):
        with patch.object(controls, "_click") as click:
            controls.execute("click", {"button": "right"})
            click.assert_called_once_with("right")
        with patch.object(controls, "_scroll") as scroll:
            controls.execute("scroll", {"direction": "vertical", "amount": -3})
            scroll.assert_called_once_with("vertical", -3)
        with patch.object(controls, "_key_event") as key_event:
            controls.execute("key", {"key": "enter"})
            self.assertEqual(key_event.call_args_list[0].args, (0x0D,))
            self.assertEqual(key_event.call_args_list[1].args, (0x0D, True))

    def test_task_manager_is_launched_by_fixed_executable_name(self):
        with patch.object(controls.subprocess, "Popen") as popen:
            controls.execute("task_manager", {})
            popen.assert_called_once_with(["taskmgr.exe"], close_fds=True)


if __name__ == "__main__":
    unittest.main()
