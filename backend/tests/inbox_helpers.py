"""Helpers for the inbox acceptance tests.

The stock ``client`` fixture serves one drive. The inbox also needs a second
drive to cross and a protected one to lock, so those tests rewrite the
fixture's drives.json and drop the config cache; the fixture restores both.
"""

from __future__ import annotations

import io
import json
import re
from datetime import UTC, datetime

import pytest
from sqlalchemy import text

from tests.conftest import TEST_DRIVE

SECOND_DRIVE = "second-drive"
PROTECTED_DRIVE = "protected-drive"

UPLOAD_I18N_KEY = "inbox.sourceUpload"
WIRE_TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$")
CURSOR_RE = re.compile(r"^[A-Za-z0-9_-]+$")

# SQLite's DATETIME text form, which is also what a raw UPDATE needs.
DB_TS_FORMAT = "%Y-%m-%d %H:%M:%S.%f"

_COLUMNS = (
    "id, drive, file_id, arrived_at, source, source_i18n_key, done_at"
)


def configure_drives(entries: list[dict]) -> None:
    import app.config as config

    config.DRIVES_CONFIG.write_text(json.dumps(entries))
    config._drives_cache = None


def drives_for(client, tmp_path, extra: list[dict]) -> list[dict]:
    """The fixture's drive plus ``extra``, whose paths are made under tmp_path."""
    _c, _db, drive_dir, _data_dir = client
    entries = [{"name": TEST_DRIVE, "path": str(drive_dir)}]
    for entry in extra:
        path = tmp_path / entry["name"]
        path.mkdir()
        entries.append({**entry, "path": str(path)})
    return entries


def create(
    api,
    path: str,
    content: str = "",
    *,
    arrival: dict | None = None,
    drive: str = TEST_DRIVE,
    conflict_mode: str = "rename",
):
    body: dict = {"path": path, "content": content, "conflict_mode": conflict_mode}
    if arrival is not None:
        body["arrival"] = arrival
    return api.post(f"/api/drives/{drive}/files", json=body)


def upload(
    api,
    filename: str,
    data: bytes = b"hello",
    *,
    drive: str = TEST_DRIVE,
    inbox_source: str | None = None,
    folder_path: str = "",
    relative_path: str = "",
    file_size: int | None = None,
):
    """Init, send one chunk, complete. Returns the last response.

    ``file_size`` overrides the declared size so a test can make the assembly
    disagree with it.
    """
    declared = len(data) if file_size is None else file_size
    body: dict = {
        "filename": filename,
        "file_size": declared,
        "folder_path": folder_path,
        "relative_path": relative_path,
        "chunk_size": max(len(data), 1),
    }
    if inbox_source is not None:
        body["inbox_source"] = inbox_source
    init = api.post(f"/api/drives/{drive}/upload/init", json=body)
    if init.status_code != 200:
        return init
    upload_id = init.json()["upload_id"]
    api.post(
        f"/api/drives/{drive}/upload/{upload_id}/chunk",
        data={"chunk_index": "0"},
        files={"chunk": ("chunk", io.BytesIO(data), "application/octet-stream")},
    )
    return api.post(f"/api/drives/{drive}/upload/{upload_id}/complete")


def seed(
    api,
    db,
    path: str,
    content: str = "",
    *,
    source: str = "upload",
    i18n_key: str = UPLOAD_I18N_KEY,
    arrived_at: str | datetime | None = None,
    drive: str = TEST_DRIVE,
) -> str:
    """Create a file through the arrival path and return its id."""
    r = create(
        api,
        path,
        content,
        arrival={"source": source, "i18n_key": i18n_key},
        drive=drive,
    )
    assert r.status_code in (200, 201), r.text
    file_id = r.json()["id"]
    if arrived_at is not None:
        update_row(db, file_id, arrived_at=arrived_at)
    return file_id


def rows(db, *, drive: str | None = None, file_id: str | None = None) -> list[dict]:
    clauses: list[str] = []
    params: dict = {}
    if drive is not None:
        clauses.append("drive = :drive")
        params["drive"] = drive
    if file_id is not None:
        clauses.append("file_id = :file_id")
        params["file_id"] = file_id
    sql = f"SELECT {_COLUMNS} FROM inbox_items"
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY arrived_at DESC, file_id DESC"
    db.expire_all()
    result = [dict(r._mapping) for r in db.execute(text(sql), params).all()]
    db.rollback()
    return result


def row(db, file_id: str) -> dict | None:
    found = rows(db, file_id=file_id)
    return found[0] if found else None


def update_row(db, file_id: str, **values) -> None:
    sets = ", ".join(f"{key} = :{key}" for key in values)
    params = {key: _db_value(value) for key, value in values.items()}
    params["file_id"] = file_id
    db.execute(
        text(f"UPDATE inbox_items SET {sets} WHERE file_id = :file_id"), params
    )
    db.commit()


def set_missing(db, file_id: str, since: str | datetime = "2026-01-01 00:00:00.000000") -> None:
    db.execute(
        text("UPDATE files SET missing_since = :since WHERE id = :file_id"),
        {"since": _db_value(since), "file_id": file_id},
    )
    db.commit()


def clear_missing(db, file_id: str) -> None:
    db.execute(
        text("UPDATE files SET missing_since = NULL WHERE id = :file_id"),
        {"file_id": file_id},
    )
    db.commit()


def set_deleted_at(db, file_id: str, when: str | datetime) -> None:
    db.execute(
        text("UPDATE files SET deleted_at = :when WHERE id = :file_id"),
        {"when": _db_value(when), "file_id": file_id},
    )
    db.commit()


def parse_ts(value: str | datetime) -> datetime:
    """A stored (naive) or wire (``Z``) timestamp as an aware UTC datetime."""
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed


def db_ts(value: datetime) -> str:
    return value.astimezone(UTC).strftime(DB_TS_FORMAT)


def _db_value(value):
    return db_ts(value) if isinstance(value, datetime) else value


def flush(api) -> None:
    """Let the app loop run broadcasts a sync handler queued from its thread."""
    import asyncio

    portal = getattr(api, "portal", None)
    if portal is not None:
        portal.call(asyncio.sleep, 0)
        portal.call(asyncio.sleep, 0)


def only_inbox_events(
    calls: list[tuple[str, dict, str | None]],
) -> list[tuple[str, dict, str | None]]:
    return [call for call in calls if call[0] == "inbox.updated"]


@pytest.fixture()
def broadcasts(monkeypatch):
    """Collect (event, data, drive) instead of touching real connections."""
    calls: list[tuple[str, dict, str | None]] = []

    import app.services.ws as ws

    async def fake_broadcast(event, data, drive=None):
        calls.append((event, data, drive))

    def fake_from_thread(event, data, drive=None):
        calls.append((event, data, drive))

    monkeypatch.setattr(ws.manager, "broadcast", fake_broadcast)
    monkeypatch.setattr(ws, "broadcast_from_thread", fake_from_thread)
    return calls
