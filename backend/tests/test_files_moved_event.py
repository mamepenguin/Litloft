"""Verify that files.moved event is emitted on rename / move / folder ops.

Covers all 6 mutation entry points:
- PUT /files/{id}/rename            (single id)
- PUT /files/{id}/move              (single id)
- PUT /files/batch/move             (bulk ids)
- PUT /files/batch/rename           (bulk ids)
- PUT /drives/{drive}/folders        (folder rename, bulk ids)
- PUT /drives/{drive}/folders/move   (folder move, bulk ids)
"""

import shutil
from pathlib import Path

import pytest

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed(db, drive_dir, filename="test.mp4", folder="旅行"):
    d = drive_dir / folder
    d.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "short_video.mp4", d / filename)

    from app.models import File
    file = File(
        filename=filename,
        title="Test",
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=f"{folder}/{filename}",
        file_size=d.joinpath(filename).stat().st_size,
        file_type="video",
        mime_type="video/mp4",
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


@pytest.fixture()
def captured_emits(monkeypatch):
    """Capture all event_hooks.emit / emit_sync calls.

    Routers import via ``from app.services import event_hooks`` and reference
    attributes at call time, so monkeypatching the module attributes is enough.
    """
    calls: list[tuple[str, dict]] = []

    # ``drives`` scopes the browser broadcast for events whose payload cannot
    # be resolved after the mutation (purges, cross-drive moves). It never
    # reaches addon listeners, so it is captured separately from the payload.
    drive_hints: list[list[str] | None] = []

    async def fake_emit(event, data, drives=None):
        calls.append((event, data))
        drive_hints.append(drives)

    def fake_emit_sync(event, data, drives=None):
        calls.append((event, data))
        drive_hints.append(drives)

    from app.services import event_hooks
    monkeypatch.setattr(event_hooks, "emit", fake_emit)
    monkeypatch.setattr(event_hooks, "emit_sync", fake_emit_sync)
    return calls


def _moved_file_ids(calls: list[tuple[str, dict]]) -> list[str]:
    """Extract file_ids from all files.moved emits, in order."""
    out = []
    for event, data in calls:
        if event == "files.moved":
            out.extend(data.get("file_ids", []))
    return out


class TestRenameFileEmit:
    def test_emits_files_moved(self, client, captured_emits):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)
        res = c.put(f"/api/files/{file.id}/rename", json={"new_filename": "renamed.mp4"})
        assert res.status_code == 200
        assert _moved_file_ids(captured_emits) == [file.id]

    def test_no_emit_on_failure(self, client, captured_emits):
        c, db, drive_dir, _ = client
        # Conflict: two files in same folder, attempt to rename to existing name
        _seed(db, drive_dir, "a.mp4")
        file = _seed(db, drive_dir, "b.mp4")
        res = c.put(f"/api/files/{file.id}/rename", json={"new_filename": "a.mp4"})
        assert res.status_code == 409
        assert _moved_file_ids(captured_emits) == []


class TestMoveFileEmit:
    def test_emits_files_moved(self, client, captured_emits):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)
        (drive_dir / "料理").mkdir(exist_ok=True)
        res = c.put(
            f"/api/files/{file.id}/move",
            json={"target_folder_path": "料理"},
        )
        assert res.status_code == 200
        assert _moved_file_ids(captured_emits) == [file.id]

    def test_no_emit_on_conflict(self, client, captured_emits):
        c, db, drive_dir, _ = client
        file = _seed(db, drive_dir)
        (drive_dir / "料理").mkdir(exist_ok=True)
        shutil.copy(FIXTURES_DIR / "short_video.mp4", drive_dir / "料理" / "test.mp4")
        res = c.put(
            f"/api/files/{file.id}/move",
            json={"target_folder_path": "料理"},
        )
        assert res.status_code == 409
        assert _moved_file_ids(captured_emits) == []


class TestBatchMoveEmit:
    def test_emits_files_moved_with_all_succeeded_ids(self, client, captured_emits):
        c, db, drive_dir, _ = client
        f1 = _seed(db, drive_dir, "a.mp4")
        f2 = _seed(db, drive_dir, "b.mp4")
        (drive_dir / "dest").mkdir(exist_ok=True)
        res = c.put(
            "/api/files/batch/move",
            json={"ids": [f1.id, f2.id], "target_folder_path": "dest"},
        )
        assert res.status_code == 200
        emitted = _moved_file_ids(captured_emits)
        assert sorted(emitted) == sorted([f1.id, f2.id])

    def test_emits_only_succeeded_ids(self, client, captured_emits):
        """When some files fail (e.g. conflict), only successful ids are emitted."""
        c, db, drive_dir, _ = client
        f1 = _seed(db, drive_dir, "a.mp4")
        f2 = _seed(db, drive_dir, "b.mp4")
        (drive_dir / "dest").mkdir(exist_ok=True)
        # Pre-occupy dest/a.mp4 to make f1 conflict
        shutil.copy(FIXTURES_DIR / "short_video.mp4", drive_dir / "dest" / "a.mp4")
        res = c.put(
            "/api/files/batch/move",
            json={"ids": [f1.id, f2.id], "target_folder_path": "dest"},
        )
        assert res.status_code == 200
        # Only f2 succeeded → only f2 emitted
        assert _moved_file_ids(captured_emits) == [f2.id]


class TestBatchRenameEmit:
    def test_emits_files_moved(self, client, captured_emits):
        c, db, drive_dir, _ = client
        f1 = _seed(db, drive_dir, "a.mp4")
        f2 = _seed(db, drive_dir, "b.mp4")
        res = c.put(
            "/api/files/batch/rename",
            json={
                "ids": [f1.id, f2.id],
                "mode": "template",
                "template": "renamed_{n}",
                "start_number": 1,
            },
        )
        assert res.status_code == 200
        emitted = _moved_file_ids(captured_emits)
        assert sorted(emitted) == sorted([f1.id, f2.id])


class TestFolderRenameEmit:
    def test_emits_files_moved_with_folder_files(self, client, captured_emits):
        c, db, drive_dir, _ = client
        f1 = _seed(db, drive_dir, "a.mp4", folder="旅行")
        f2 = _seed(db, drive_dir, "b.mp4", folder="旅行")
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/folders",
            json={"path": "旅行", "new_name": "旅行2024"},
        )
        assert res.status_code == 200
        emitted = _moved_file_ids(captured_emits)
        assert sorted(emitted) == sorted([f1.id, f2.id])

    def test_no_emit_when_no_files_in_folder(self, client, captured_emits):
        c, db, drive_dir, _ = client
        (drive_dir / "empty").mkdir()
        # Create a placeholder file in DB so folder is known? No — folders are
        # tracked by EmptyFolder when truly empty. Let's just ensure the folder
        # rename either succeeds (and emits []), or fails. Either way, no
        # files.moved emission.
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/folders",
            json={"path": "empty", "new_name": "renamed"},
        )
        # Either 200 (empty folder rename succeeded) or 404
        assert res.status_code in (200, 404)
        assert _moved_file_ids(captured_emits) == []


class TestFolderMoveEmit:
    def test_emits_files_moved_with_folder_files(self, client, captured_emits):
        c, db, drive_dir, _ = client
        f1 = _seed(db, drive_dir, "a.mp4", folder="旅行")
        f2 = _seed(db, drive_dir, "b.mp4", folder="旅行")
        (drive_dir / "アーカイブ").mkdir()
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/folders/move",
            json={"path": "旅行", "target_path": "アーカイブ"},
        )
        assert res.status_code == 200
        emitted = _moved_file_ids(captured_emits)
        assert sorted(emitted) == sorted([f1.id, f2.id])

    def test_emits_files_moved_with_nested_folder_files(self, client, captured_emits):
        c, db, drive_dir, _ = client
        # Create files in 旅行/2024/ to verify subfolder traversal also emits
        f1 = _seed(db, drive_dir, "a.mp4", folder="旅行")
        f2 = _seed(db, drive_dir, "b.mp4", folder="旅行/2024")
        (drive_dir / "アーカイブ").mkdir()
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/folders/move",
            json={"path": "旅行", "target_path": "アーカイブ"},
        )
        assert res.status_code == 200
        emitted = _moved_file_ids(captured_emits)
        assert sorted(emitted) == sorted([f1.id, f2.id])
