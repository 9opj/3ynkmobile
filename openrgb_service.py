"""Local OpenRGB SDK profile integration (loopback only)."""

from __future__ import annotations

import socket
import struct


HOST = "127.0.0.1"
PORT = 6742
TIMEOUT_SECONDS = 1.5
CLIENT_PROTOCOL = 5
MAX_PACKET = 4 * 1024 * 1024


class OpenRGBError(RuntimeError):
    pass


def _read_exact(sock: socket.socket, size: int) -> bytes:
    if size < 0 or size > MAX_PACKET:
        raise OpenRGBError("openrgb_invalid_packet_size")
    chunks = bytearray()
    while len(chunks) < size:
        part = sock.recv(size - len(chunks))
        if not part:
            raise OpenRGBError("openrgb_connection_closed")
        chunks.extend(part)
    return bytes(chunks)


def _send(sock: socket.socket, device: int, packet_id: int, payload: bytes = b"") -> None:
    sock.sendall(b"ORGB" + struct.pack("<III", device, packet_id, len(payload)) + payload)


def _response(sock: socket.socket, expected_id: int) -> bytes:
    header = _read_exact(sock, 16)
    if header[:4] != b"ORGB":
        raise OpenRGBError("openrgb_invalid_header")
    _device, packet_id, size = struct.unpack("<III", header[4:])
    if packet_id != expected_id:
        raise OpenRGBError("openrgb_unexpected_packet")
    return _read_exact(sock, size)


def _query() -> dict:
    with socket.create_connection((HOST, PORT), timeout=TIMEOUT_SECONDS) as sock:
        sock.settimeout(TIMEOUT_SECONDS)
        _send(sock, 0, 40, struct.pack("<I", CLIENT_PROTOCOL))
        protocol = 0
        try:
            version_payload = _response(sock, 40)
            if len(version_payload) == 4:
                protocol = min(CLIENT_PROTOCOL, struct.unpack("<I", version_payload)[0])
        except (socket.timeout, OpenRGBError):
            # OpenRGB protocol 0 has no version negotiation response.
            protocol = 0

        _send(sock, 0, 0)
        count_payload = _response(sock, 0)
        if len(count_payload) != 4:
            raise OpenRGBError("openrgb_invalid_device_count")
        device_count = struct.unpack("<I", count_payload)[0]

        profiles: list[str] = []
        if protocol >= 2:
            _send(sock, 0, 150)
            payload = _response(sock, 150)
            if len(payload) >= 6:
                declared_size, profile_count = struct.unpack_from("<IH", payload)
                if declared_size <= len(payload) - 4 and profile_count <= 1024:
                    offset = 6
                    for _ in range(profile_count):
                        if offset + 2 > len(payload):
                            break
                        length = struct.unpack_from("<H", payload, offset)[0]
                        offset += 2
                        if not length or offset + length > len(payload):
                            break
                        name = payload[offset:offset + length].split(b"\0", 1)[0].decode("utf-8", "replace")
                        offset += length
                        if name:
                            profiles.append(name)
        return {"connected": True, "protocol": protocol, "device_count": device_count, "profiles": profiles}


def status() -> dict:
    try:
        return {"running": True, "sdk_available": True, "message": "ok", **_query()}
    except (OSError, OpenRGBError):
        return {"running": False, "sdk_available": False, "message": "openrgb_sdk_unavailable", "protocol": None, "device_count": 0, "profiles": []}


def load_profile(name: str) -> dict:
    if not isinstance(name, str) or not name or len(name) > 120 or "\0" in name:
        raise ValueError("invalid_openrgb_profile")
    data = _query()
    if data["protocol"] < 2:
        raise OpenRGBError("openrgb_profiles_require_protocol_2")
    if name not in data["profiles"]:
        raise ValueError("openrgb_profile_not_found")
    if data["device_count"] < 1:
        raise OpenRGBError("openrgb_no_devices")
    payload = name.encode("utf-8") + b"\0"
    with socket.create_connection((HOST, PORT), timeout=TIMEOUT_SECONDS) as sock:
        sock.settimeout(TIMEOUT_SECONDS)
        _send(sock, 0, 152, payload)
    return {"status": "profile_load_sent", "profile": name}
