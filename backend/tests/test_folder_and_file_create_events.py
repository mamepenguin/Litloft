"""WS event emissions for folder create/delete/move and text file create.

Spec: 2026-05-09-tree-and-pane-refresh-sync.md.

The frontend tree and right panes refresh when they see one of these
events; without them, freshly created folders/files and empty-folder
renames are invisible until something else happens.
"""

import pytest

from tests.conftest import TEST_DRIVE


@pytest.fixture()
def captured_emits(monkeypatch):
    """Capture all event_hooks.emit / emit_sync calls."""
    calls: list[tuple[str, dict]] = []

    async def fake_emit(event, data):
        calls.append((event, data))

    def fake_emit_sync(event, data):
        calls.append((event, data))

    from app.services import event_hooks

    monkeypatch.setattr(event_hooks, "emit", fake_emit)
    monkeypatch.setattr(event_hooks, "emit_sync", fake_emit_sync)
    return calls


def _events(calls: list[tuple[str, dict]], name: str) -> list[dict]:
    return [data for ev, data in calls if ev == name]


class TestCreateFolderEmit:
    def test_emits_folders_created(self, client, captured_emits):
        c, _db, _drive_dir, _ = client
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/folders",
            json={"path": "", "name": "新しいフォルダ"},
        )
        assert res.status_code == 200
        emits = _events(captured_emits, "folders.created")
        assert len(emits) == 1
        assert emits[0]["drive"] == TEST_DRIVE
        assert "新しいフォルダ" in emits[0]["path"]

    def test_no_emit_on_failure(self, client, captured_emits):
        c, _db, drive_dir, _ = client
        # Create the folder, then attempt to create a duplicate which should fail.
        (drive_dir / "dup").mkdir()
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/folders",
            json={"path": "", "name": "dup"},
        )
        # Either 409 conflict or some 4xx — must NOT emit folders.created
        if res.status_code >= 400:
            assert _events(captured_emits, "folders.created") == []


class TestDeleteFolderEmit:
    def test_emits_folders_deleted(self, client, captured_emits):
        c, _db, drive_dir, _ = client
        (drive_dir / "to_delete").mkdir()
        res = c.delete(f"/api/drives/{TEST_DRIVE}/folders?path=to_delete")
        assert res.status_code == 200
        emits = _events(captured_emits, "folders.deleted")
        assert len(emits) == 1
        assert emits[0] == {"drive": TEST_DRIVE, "path": "to_delete"}


class TestFolderRenameMoveEmitFolders:
    """folders.moved fires on rename + move, so empty folders are observable."""

    def test_rename_emits_folders_moved(self, client, captured_emits):
        c, _db, drive_dir, _ = client
        (drive_dir / "old").mkdir()
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/folders",
            json={"path": "old", "new_name": "new"},
        )
        assert res.status_code == 200
        emits = _events(captured_emits, "folders.moved")
        assert len(emits) == 1
        assert emits[0]["drive"] == TEST_DRIVE
        assert emits[0]["old_path"] == "old"
        assert emits[0]["new_path"] == "new"

    def test_move_emits_folders_moved(self, client, captured_emits):
        c, _db, drive_dir, _ = client
        (drive_dir / "src").mkdir()
        (drive_dir / "dst").mkdir()
        res = c.put(
            f"/api/drives/{TEST_DRIVE}/folders/move",
            json={"path": "src", "target_path": "dst"},
        )
        assert res.status_code == 200
        emits = _events(captured_emits, "folders.moved")
        assert len(emits) == 1
        assert emits[0]["drive"] == TEST_DRIVE
        assert emits[0]["old_path"] == "src"
        assert "dst" in emits[0]["new_path"]


class TestCreateTextFileEmit:
    def test_emits_files_created(self, client, captured_emits):
        c, _db, _drive_dir, _ = client
        res = c.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "note.md", "content": "# hi"},
        )
        assert res.status_code == 201
        body = res.json()
        emits = _events(captured_emits, "files.created")
        assert len(emits) == 1
        assert emits[0] == {"file_ids": [body["id"]]}

    def test_recovery_emits_files_recovered_not_created(
        self, client, captured_emits
    ):
        c, db, _drive_dir, _ = client
        # Seed a missing-state file at the same path so the next POST
        # follows the recovery branch.
        from app.models import File
        from datetime import datetime, timezone

        f = File(
            filename="note.md",
            title="note",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="note.md",
            file_size=0,
            file_type="document",
            mime_type="text/markdown",
            missing_since=datetime.now(timezone.utc),
        )
        db.add(f)
        db.commit()
        db.refresh(f)

        res = c.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "note.md", "content": "# recovered"},
        )
        assert res.status_code == 200
        # Recovery path emits files.recovered, not files.created.
        assert _events(captured_emits, "files.recovered") != []
        assert _events(captured_emits, "files.created") == []
