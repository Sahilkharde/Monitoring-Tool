from typing import Any

_scan_progress: dict[str, dict[str, Any]] = {}


def update_progress(scan_id: str, data: dict[str, Any]) -> None:
    _scan_progress[scan_id] = data


def get_progress(scan_id: str) -> dict[str, Any] | None:
    return _scan_progress.get(scan_id)


def remove_progress(scan_id: str) -> None:
    _scan_progress.pop(scan_id, None)
