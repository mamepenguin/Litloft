"""Frontmatter tags reach File.tags on every path that creates a note's row
or replaces its content."""
import io
import json
from datetime import UTC, datetime

import pytest

import app.config as config
from app.models import File, Tag
from tests.conftest import TEST_DRIVE

NOTE = "---\ntags: [Alpha, beta]\n---\n\nbody\n"
FILTERED = "---\ntags: [ok, 'bad tag!']\n---\n\nbody\n"


def _names(db, file_id):
    db.expire_all()
    return sorted(t.name for t in db.query(File).filter(File.id == file_id).one().tags)


def _tag_rows(db, drive=TEST_DRIVE):
    db.expire_all()
    return sorted(t.name for t in db.query(Tag).filter(Tag.drive == drive))


def _upload(c, name, text):
    data = text if isinstance(text, bytes) else text.encode()
    init = c.post(
        f"/api/drives/{TEST_DRIVE}/upload/init",
        json={"filename": name, "file_size": len(data), "folder_path": "", "chunk_size": len(data)},
    )
    assert init.status_code == 200, init.text
    uid = init.json()["upload_id"]
    r = c.post(
        f"/api/drives/{TEST_DRIVE}/upload/{uid}/chunk",
        data={"chunk_index": "0"},
        files={"chunk": ("chunk", io.BytesIO(data), "application/octet-stream")},
    )
    assert r.status_code == 200, r.text
    done = c.post(f"/api/drives/{TEST_DRIVE}/upload/{uid}/complete")
    assert done.status_code == 200, done.text
    return done.json()["id"]


def _create(c, path, text):
    r = c.post(f"/api/drives/{TEST_DRIVE}/files", json={"path": path, "content": text})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _seed_note(db, drive_dir, text=NOTE, name="src.md"):
    (drive_dir / name).write_text(text)
    f = File(
        filename=name, title="src", drive=TEST_DRIVE, folder_path="", file_path=name,
        file_size=len(text.encode()), file_type="document", mime_type="text/markdown",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


@pytest.mark.parametrize("make", [_upload, _create], ids=["upload", "create"])
class TestNewRow:
    @pytest.mark.parametrize(
        ("text", "expected"),
        [(NOTE, ["Alpha", "beta"]), (FILTERED, ["ok"]), ("# plain\n", [])],
        ids=["tags", "invalid-dropped", "no-frontmatter"],
    )
    def test_tags(self, client, make, text, expected):
        c, db, _, _ = client
        fid = make(c, "n.md", text)
        assert _names(db, fid) == expected

    def test_text_file_gets_no_tags(self, client, make):
        c, db, _, _ = client
        fid = make(c, "n.txt", NOTE)
        assert _names(db, fid) == []


def test_upload_of_non_utf8_note_succeeds_without_tags(client):
    c, db, _, _ = client
    fid = _upload(c, "n.md", b"---\ntags: [a]\n---\n\xff\xfe\n")
    assert _names(db, fid) == []


class TestReusedRow:
    def test_upload_over_missing_row_follows_new_tags_and_sweeps(self, client):
        c, db, drive_dir, _ = client
        old = _seed_note(db, drive_dir, "---\ntags: [stale]\n---\n\nx\n", "n.md")
        from app.services.tagops import project_frontmatter_tags
        project_frontmatter_tags(db, old, "---\ntags: [stale]\n---\n")
        old.missing_since = datetime.now(UTC).replace(tzinfo=None)
        db.commit()
        (drive_dir / "n.md").unlink()
        assert _tag_rows(db) == ["stale"]

        fid = _upload(c, "n.md", NOTE)
        assert fid == old.id
        assert _names(db, fid) == ["Alpha", "beta"]
        assert _tag_rows(db) == ["Alpha", "beta"]

    def test_create_over_missing_row_follows_new_tags_and_sweeps(self, client):
        c, db, drive_dir, _ = client
        old = _seed_note(db, drive_dir, "---\ntags: [stale]\n---\n\nx\n", "n.md")
        from app.services.tagops import project_frontmatter_tags
        project_frontmatter_tags(db, old, "---\ntags: [stale]\n---\n")
        old.missing_since = datetime.now(UTC).replace(tzinfo=None)
        db.commit()
        (drive_dir / "n.md").unlink()

        fid = _create(c, "n.md", NOTE)
        assert fid == old.id
        assert _names(db, fid) == ["Alpha", "beta"]
        assert _tag_rows(db) == ["Alpha", "beta"]


class TestCopy:
    def test_same_drive(self, client):
        c, db, drive_dir, _ = client
        src = _seed_note(db, drive_dir)
        r = c.post(f"/api/files/{src.id}/copy", json={"target_folder_path": "sub"})
        assert r.status_code == 200, r.text
        assert _names(db, r.json()["id"]) == ["Alpha", "beta"]
        assert _tag_rows(db) == ["Alpha", "beta"]

    def test_cross_drive_joins_destination_row_as_it_stands(self, client):
        c, db, drive_dir, _ = client
        drive2 = drive_dir.parent / "drive2"
        drive2.mkdir(parents=True)
        config.DRIVES_CONFIG.write_text(json.dumps([
            {"name": TEST_DRIVE, "path": str(drive_dir)},
            {"name": "drive2", "path": str(drive2)},
        ]))
        config._drives_cache = None
        src = _seed_note(db, drive_dir)
        src_row = Tag(name="ALPHA", drive=TEST_DRIVE)
        dst_row = Tag(name="aLpHa", drive="drive2")
        db.add_all([src_row, dst_row])
        db.commit()
        dst_row_id = dst_row.id

        r = c.post(
            f"/api/files/{src.id}/copy",
            json={"target_folder_path": "", "target_drive": "drive2"},
        )
        assert r.status_code == 200, r.text
        db.expire_all()
        copy = db.query(File).filter(File.id == r.json()["id"]).one()
        assert sorted(t.name for t in copy.tags) == ["aLpHa", "beta"]
        assert dst_row_id in {t.id for t in copy.tags}
        assert _tag_rows(db, "drive2") == ["aLpHa", "beta"]
        assert _tag_rows(db, TEST_DRIVE) == ["ALPHA"]

    def test_copy_onto_trashed_ghost_keeps_the_tag(self, client):
        c, db, drive_dir, _ = client
        src = _seed_note(db, drive_dir, "---\ntags: [solo]\n---\n\nx\n")
        ghost = _seed_note(db, drive_dir, "---\ntags: [solo]\n---\n\nx\n", "src_copy.md")
        (drive_dir / "src_copy.md").unlink()
        from app.services.tagops import project_frontmatter_tags
        project_frontmatter_tags(db, ghost, "---\ntags: [solo]\n---\n")
        ghost.deleted_at = datetime.now(UTC).replace(tzinfo=None)
        db.commit()

        r = c.post(f"/api/files/{src.id}/copy", json={"target_folder_path": ""})
        assert r.status_code == 200, r.text
        assert r.json()["filename"] == "src_copy.md"
        assert _names(db, r.json()["id"]) == ["solo"]
        assert _tag_rows(db) == ["solo"]
