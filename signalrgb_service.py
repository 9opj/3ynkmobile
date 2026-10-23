"""Narrow localhost integration with SignalRGB's documented local API."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request

import psutil


BASE_URL = "http://127.0.0.1:16038/api/v1"
TIMEOUT_SECONDS = 2


class SignalRGBError(RuntimeError):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def _request(path: str, method: str = "GET", body: dict | None = None) -> dict:
    if not path or path.startswith("/") or ".." in path.split("/"):
        raise ValueError("invalid_signalrgb_path")
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"{BASE_URL}/{path}", data=data, method=method,
        headers={"Accept": "application/json", **({"Content-Type": "application/json"} if data else {})},
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            result = json.loads(response.read(2 * 1024 * 1024))
    except urllib.error.HTTPError as error:
        raise SignalRGBError("signalrgb_pro_required" if error.code == 403 else "signalrgb_api_rejected", error.code) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise SignalRGBError("signalrgb_api_unavailable") from None
    if not isinstance(result, dict) or result.get("status") == "error":
        raise SignalRGBError("signalrgb_api_error")
    return result


def _running() -> bool:
    for process in psutil.process_iter(["name"]):
        try:
            name = (process.info.get("name") or "").casefold()
            if name in {"signalrgb.exe", "signalrgblauncher.exe", "signalrgb", "signalrgblauncher"}:
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return False


def is_running() -> bool:
    return _running()


def status(include_effects: bool = True) -> dict:
    installed_or_running = _running()
    try:
        current = _request("lighting")
    except SignalRGBError as error:
        return {
            "running": installed_or_running,
            "connected": error.status == 403,
            "api_access": False,
            "pro_required": error.status == 403,
            "message": str(error),
            "current": None,
            "effects": [],
            "layouts": [],
        }
    data = current.get("data", {})
    attributes = data.get("attributes", {}) if isinstance(data, dict) else {}
    result = {
        "running": True,
        "connected": True,
        "api_access": True,
        "pro_required": False,
        "message": "ok",
        "current": {
            "name": attributes.get("name", data.get("id", "")),
            "brightness": attributes.get("global_brightness"),
            "enabled": attributes.get("enabled"),
        },
        "effects": [],
        "layouts": [],
    }
    if include_effects:
        for endpoint, key in (("lighting/effects", "effects"), ("scenes/layouts", "layouts")):
            try:
                collection = _request(endpoint).get("data", {})
                items = collection.get("items", []) if isinstance(collection, dict) else []
                if key == "effects":
                    result[key] = [
                        {"id": item.get("id", ""), "name": item.get("attributes", {}).get("name", "")}
                        for item in items if item.get("id") and item.get("attributes", {}).get("name")
                    ]
                else:
                    result[key] = [item.get("id") for item in items if item.get("id")]
            except SignalRGBError:
                pass
    return result


def set_brightness(value: int) -> dict:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 100:
        raise ValueError("invalid_brightness")
    return _request("lighting/global_brightness", "PATCH", {"global_brightness": value})


def set_enabled(enabled: bool) -> dict:
    if not isinstance(enabled, bool):
        raise ValueError("invalid_enabled")
    return _request("lighting/enabled", "PATCH", {"enabled": enabled})


def apply_effect(effect_id: str, name: str) -> dict:
    if not isinstance(effect_id, str) or len(effect_id) > 180 or not isinstance(name, str) or not name or len(name) > 120:
        raise ValueError("invalid_effect")
    encoded_id = urllib.parse.quote(effect_id, safe="")
    try:
        return _request(f"lighting/effects/{encoded_id}/apply", "POST", {})
    except SignalRGBError as error:
        if error.status != 403:
            raise
        return _open_effect_by_name(name)


def apply_effect_by_name(name: str) -> dict:
    if not isinstance(name, str) or not name.strip() or len(name) > 120:
        raise ValueError("invalid_effect")
    try:
        effects = _request("lighting/effects").get("data", {}).get("items", [])
        for effect in effects:
            if effect.get("attributes", {}).get("name", "").casefold() == name.strip().casefold():
                return _request(f"lighting/effects/{urllib.parse.quote(str(effect['id']), safe='')}/apply", "POST", {})
    except SignalRGBError as error:
        if error.status != 403:
            raise
    return _open_effect_by_name(name.strip())


def _open_effect_by_name(name: str) -> dict:
    url = "signalrgb://effect/apply/" + urllib.parse.quote(name, safe="")
    if os.name != "nt" or not hasattr(os, "startfile"):
        raise SignalRGBError("signalrgb_effect_protocol_windows_only")
    try:
        os.startfile(url)  # type: ignore[attr-defined]
    except OSError:
        raise SignalRGBError("signalrgb_protocol_unavailable") from None
    return {"status": "sent_to_signalrgb", "effect": name, "method": "application_url"}


def cycle_effect(direction: str) -> dict:
    endpoints = {"next": "lighting/next", "previous": "lighting/previous", "shuffle": "lighting/shuffle"}
    if direction not in endpoints:
        raise ValueError("invalid_effect_action")
    return _request(endpoints[direction], "POST", {})

