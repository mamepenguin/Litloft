"""SPEC-CORE-091: frontmatter `origin` projected into `files.md_origin`.

Invariant ids are those of docs/specs/clips-app.md. The origins used here are
arbitrary strings, never the value one addon writes, so a core that compared
`md_origin` with a literal would fail them (I16).
"""
from __future__ import annotations

import hashlib
import io
import json
from datetime import UTC, datetime

import pytest
from sqlalchemy import text

import app.config as config
from app.models import File
from app.services.scanner import _scan_and_register, register_single_file
from tests.conftest import TEST_DRIVE

ORIGIN = "zz-origin"
OTHER = "yy-origin"
UNREADABLE = "---\norigin: [unclosed\n---\n\nbody\n"
BASE = datetime(2026, 1, 1, 9, 30)


def _note(origin_line: str) -> str:
    return f"---\n{origin_line}\n---\n\nbody\n"


# (content, expected md_origin) for a row that had no value before.
PROJECTION = [
    pytest.param(_note(f"origin: {ORIGIN}"), ORIGIN, id="plain"),
    pytest.param(_note(f"origin: '   {ORIGIN}  '"), ORIGIN, id="stripped"),
    pytest.param(_note("origin: x"), "x", id="one-char"),
    pytest.param(_note(f"origin: {'a' * 32}"), "a" * 32, id="exactly-32"),
    pytest.param(_note(f"origin: {'a' * 32}b"), "a" * 32, id="33-truncated"),
    pytest.param(_note(f"origin: '  {'c' * 40}  '"), "c" * 32, id="stripped-then-truncated"),
    pytest.param(_note("origin: ''"), None, id="empty-string"),
    pytest.param(_note("origin: '   '"), None, id="whitespace-only"),
    pytest.param(_note("origin: [a, b]"), None, id="list"),
    pytest.param(_note("origin: 5"), None, id="number"),
    pytest.param(_note("origin: {a: b}"), None, id="mapping"),
    pytest.param(_note("origin:"), None, id="null"),
    pytest.param(_note("title: T"), None, id="no-origin-key"),
    pytest.param("# plain\n\nno frontmatter\n", None, id="no-frontmatter"),
    pytest.param(UNREADABLE, None, id="unreadable-new-row-stays-null"),
]


def _origin(db, file_id: str):
    db.rollback()
    return db.execute(
        text("SELECT md_origin FROM files WHERE id = :id"), {"id": file_id}
    ).scalar_one()


def _set_origin(db, file_id: str, value):
    db.execute(
        text("UPDATE files SET md_origin = :v WHERE id = :id"), {"v": value, "id": file_id}
    )
    db.commit()


def _etag(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _create(c, path, content):
    r = c.post(f"/api/drives/{TEST_DRIVE}/files", json={"path": path, "content": content})
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _upload(c, name, content):
    data = content if isinstance(content, bytes) else content.encode()
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


def _put_content(c, file_id, old: str, new: str):
    r = c.put(
        f"/api/files/{file_id}/content",
        content=new.encode("utf-8"),
        headers={"Content-Type": "text/plain; charset=utf-8", "If-Match": f'"{_etag(old)}"'},
    )
    assert r.status_code == 200, r.text


def _seed_row(db, drive_dir, name: str, content: str) -> File:
    (drive_dir / name).write_text(content)
    f = File(
        filename=name, title=name, drive=TEST_DRIVE, folder_path="", file_path=name,
        file_size=len(content.encode()), file_type="document", mime_type="text/markdown",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


class TestNewRowProjection:
    """SPEC-CORE-091 step 2, I1, I2: the rule on the paths that create a row."""

    @pytest.mark.parametrize(("content", "expected"), PROJECTION)
    def test_spec_core_091_create_projects_origin(self, client, content, expected):
        c, db, _, _ = client
        fid = _create(c, "n.md", content)
        assert _origin(db, fid) == expected

    @pytest.mark.parametrize(("content", "expected"), PROJECTION)
    def test_spec_core_091_upload_projects_origin(self, client, content, expected):
        c, db, _, _ = client
        fid = _upload(c, "n.md", content)
        assert _origin(db, fid) == expected

    def test_spec_core_091_upload_of_non_utf8_note_succeeds_with_null_origin(self, client):
        c, db, _, _ = client
        fid = _upload(c, "n.md", b"---\norigin: zz-origin\n---\n\xff\xfe\n")
        assert _origin(db, fid) is None

    def test_spec_core_091_a_text_file_is_not_projected(self, client):
        c, db, _, _ = client
        fid = _create(c, "n.txt", _note(f"origin: {ORIGIN}"))
        assert _origin(db, fid) is None

    def test_spec_core_091_create_over_a_missing_row_projects_the_new_content(self, client):
        c, db, drive_dir, _ = client
        old = _seed_row(db, drive_dir, "n.md", _note(f"origin: {OTHER}"))
        _set_origin(db, old.id, OTHER)
        old.missing_since = datetime.now(UTC).replace(tzinfo=None)
        db.commit()
        (drive_dir / "n.md").unlink()

        fid = _create(c, "n.md", _note(f"origin: {ORIGIN}"))

        assert fid == old.id
        assert _origin(db, fid) == ORIGIN

    def test_spec_core_091_create_over_a_missing_row_without_origin_clears_it(self, client):
        c, db, drive_dir, _ = client
        old = _seed_row(db, drive_dir, "n.md", _note(f"origin: {OTHER}"))
        _set_origin(db, old.id, OTHER)
        old.missing_since = datetime.now(UTC).replace(tzinfo=None)
        db.commit()
        (drive_dir / "n.md").unlink()

        fid = _create(c, "n.md", "# mine now\n")

        assert fid == old.id
        assert _origin(db, fid) is None


class TestContentWrite:
    """SPEC-CORE-091 step 1 (content PUT), I1, I2, I4."""

    def test_spec_core_091_content_write_sets_the_origin(self, client):
        c, db, drive_dir, _ = client
        f = _seed_row(db, drive_dir, "n.md", "initial\n")
        _put_content(c, f.id, "initial\n", _note(f"origin: {ORIGIN}"))
        assert _origin(db, f.id) == ORIGIN

    @pytest.mark.parametrize(
        "new",
        [_note("title: mine"), "# no frontmatter\n", _note("origin: ''")],
        ids=["origin-removed", "frontmatter-removed", "origin-emptied"],
    )
    def test_spec_core_091_content_write_without_origin_clears_it(self, client, new):
        c, db, drive_dir, _ = client
        old = _note(f"origin: {ORIGIN}")
        f = _seed_row(db, drive_dir, "n.md", old)
        _set_origin(db, f.id, ORIGIN)

        _put_content(c, f.id, old, new)

        assert _origin(db, f.id) is None

    def test_spec_core_091_content_write_with_unreadable_frontmatter_keeps_the_origin(self, client):
        c, db, drive_dir, _ = client
        old = _note(f"origin: {ORIGIN}")
        f = _seed_row(db, drive_dir, "n.md", old)
        _set_origin(db, f.id, ORIGIN)

        _put_content(c, f.id, old, UNREADABLE)

        assert _origin(db, f.id) == ORIGIN
        assert (drive_dir / "n.md").read_text() == UNREADABLE

    def test_spec_core_091_content_write_changes_the_origin_to_another_value(self, client):
        c, db, drive_dir, _ = client
        old = _note(f"origin: {ORIGIN}")
        f = _seed_row(db, drive_dir, "n.md", old)
        _set_origin(db, f.id, ORIGIN)

        _put_content(c, f.id, old, _note(f"origin: {OTHER}"))

        assert _origin(db, f.id) == OTHER


class TestTagWrite:
    """SPEC-CORE-091 step 1 (frontmatter tag write)."""

    def test_spec_core_091_tag_write_projects_the_origin_it_keeps(self, client):
        c, db, drive_dir, _ = client
        f = _seed_row(db, drive_dir, "n.md", _note(f"origin: {ORIGIN}"))
        assert _origin(db, f.id) is None

        r = c.put(f"/api/files/{f.id}/tags", json={"tags": ["a"]})

        assert r.status_code == 200, r.text
        assert _origin(db, f.id) == ORIGIN
        assert "a" in [t["name"] if isinstance(t, dict) else t for t in r.json()["tags"]]


class TestCopy:
    """SPEC-CORE-091 step 1 (copy)."""

    def test_spec_core_091_copy_carries_the_origin_of_its_content(self, client):
        c, db, drive_dir, _ = client
        src = _seed_row(db, drive_dir, "src.md", _note(f"origin: {ORIGIN}"))

        r = c.post(f"/api/files/{src.id}/copy", json={"target_folder_path": "sub"})

        assert r.status_code == 200, r.text
        assert _origin(db, r.json()["id"]) == ORIGIN

    def test_spec_core_091_copy_of_a_note_without_origin_is_null(self, client):
        c, db, drive_dir, _ = client
        src = _seed_row(db, drive_dir, "src.md", _note("title: mine"))
        _set_origin(db, src.id, ORIGIN)

        r = c.post(f"/api/files/{src.id}/copy", json={"target_folder_path": "sub"})

        assert r.status_code == 200, r.text
        assert _origin(db, r.json()["id"]) is None


@pytest.fixture()
def drive_env(tmp_path, monkeypatch):
    drive_dir = tmp_path / "drive"
    drive_dir.mkdir()
    drives_json = tmp_path / "drives.json"
    drives_json.write_text(json.dumps([{"name": "test-drive", "path": str(drive_dir)}]))
    monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
    monkeypatch.setattr(config, "_drives_cache", None)
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr(config, "DATA_DIR", data_dir)
    monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")
    return drive_dir


def _row_id(db, name: str) -> str:
    db.expire_all()
    return db.query(File).filter(File.filename == name).one().id


def _scan(db):
    _scan_and_register(db, "test-drive")
    db.commit()


class TestScannerRegistersNewMarkdown:
    """SPEC-CORE-091 step 1 (scanner registering a new `.md`)."""

    @pytest.mark.parametrize(("content", "expected"), PROJECTION)
    def test_spec_core_091_register_single_file_projects_origin(self, db_session, drive_env, content, expected):
        md = drive_env / "note.md"
        md.write_text(content)

        fid = register_single_file(db_session, "test-drive", md)
        db_session.commit()

        assert _origin(db_session, fid) == expected

    def test_spec_core_091_scan_projects_origin_of_new_files(self, db_session, drive_env):
        (drive_env / "clip.md").write_text(_note(f"origin: {ORIGIN}"))
        (drive_env / "mine.md").write_text(_note("title: mine"))

        _scan(db_session)

        assert _origin(db_session, _row_id(db_session, "clip.md")) == ORIGIN
        assert _origin(db_session, _row_id(db_session, "mine.md")) is None


class TestScanPass:
    """SPEC-CORE-091 step 3, I2, I3, I23: every scan re-reads every active `.md`."""

    def _registered(self, db, drive_dir, name, content):
        md = drive_dir / name
        md.write_text(content)
        fid = register_single_file(db, "test-drive", md)
        db.commit()
        return md, fid

    def test_spec_core_091_scan_fills_a_row_from_before_the_column(self, db_session, drive_env):
        _, fid = self._registered(db_session, drive_env, "old.md", _note(f"origin: {ORIGIN}"))
        _set_origin(db_session, fid, None)

        _scan(db_session)

        assert _origin(db_session, fid) == ORIGIN

    def test_spec_core_091_scan_picks_up_an_outside_edit_that_adds_the_origin(self, db_session, drive_env):
        md, fid = self._registered(db_session, drive_env, "n.md", _note("title: mine"))
        assert _origin(db_session, fid) is None

        md.write_text(_note(f"origin: {ORIGIN}"))
        _scan(db_session)

        assert _origin(db_session, fid) == ORIGIN

    def test_spec_core_091_scan_picks_up_an_outside_edit_that_removes_the_origin(self, db_session, drive_env):
        md, fid = self._registered(db_session, drive_env, "n.md", _note(f"origin: {ORIGIN}"))
        assert _origin(db_session, fid) == ORIGIN

        md.write_text(_note("title: mine now"))
        _scan(db_session)

        assert _origin(db_session, fid) is None

    def test_spec_core_091_scan_picks_up_an_outside_edit_that_changes_the_origin(self, db_session, drive_env):
        md, fid = self._registered(db_session, drive_env, "n.md", _note(f"origin: {ORIGIN}"))

        md.write_text(_note(f"origin: {OTHER}"))
        _scan(db_session)

        assert _origin(db_session, fid) == OTHER

    def test_spec_core_091_scan_rereads_a_file_restored_from_trash(self, db_session, drive_env):
        md, fid = self._registered(db_session, drive_env, "n.md", _note("title: mine"))
        db_session.execute(
            text("UPDATE files SET deleted_at = :at WHERE id = :id"), {"at": BASE, "id": fid}
        )
        db_session.commit()
        md.write_text(_note(f"origin: {ORIGIN}"))
        db_session.execute(text("UPDATE files SET deleted_at = NULL WHERE id = :id"), {"id": fid})
        db_session.commit()

        _scan(db_session)

        assert _origin(db_session, fid) == ORIGIN

    @pytest.mark.parametrize(
        "content",
        [
            pytest.param(UNREADABLE.encode(), id="unreadable-frontmatter"),
            pytest.param(b"---\norigin: yy-origin\n---\n\xff\xfe body\n", id="not-utf8"),
            pytest.param(
                ("---\norigin: yy-origin\n---\n\n" + "x" * 1_200_000).encode(), id="over-1mb"
            ),
            pytest.param(
                ("---\ntitle: mine\n---\n\n" + "x" * 1_200_000).encode(), id="over-1mb-without-origin"
            ),
        ],
    )
    def test_spec_core_091_scan_leaves_the_origin_of_a_file_it_cannot_use(self, db_session, drive_env, content):
        md, fid = self._registered(db_session, drive_env, "n.md", _note(f"origin: {ORIGIN}"))
        assert _origin(db_session, fid) == ORIGIN

        md.write_bytes(content)
        _scan(db_session)

        assert _origin(db_session, fid) == ORIGIN

    def test_spec_core_091_scan_writing_only_the_origin_keeps_updated_at(self, db_session, drive_env):
        _, clip = self._registered(db_session, drive_env, "clip.md", _note(f"origin: {ORIGIN}"))
        _, mine = self._registered(db_session, drive_env, "mine.md", _note("title: mine"))
        for fid in (clip, mine):
            db_session.execute(
                text("UPDATE files SET md_origin = NULL, updated_at = :at WHERE id = :id"),
                {"at": BASE, "id": fid},
            )
        db_session.commit()

        _scan(db_session)

        assert _origin(db_session, clip) == ORIGIN
        for fid in (clip, mine):
            db_session.expire_all()
            row = db_session.query(File).filter(File.id == fid).one()
            assert row.updated_at.replace(tzinfo=None) == BASE

    def test_spec_core_091_scan_keeps_tags_and_md_id(self, db_session, drive_env):
        md, fid = self._registered(
            db_session, drive_env, "n.md", "---\ntags: [keep]\n---\n\nbody\n"
        )
        db_session.expire_all()
        before = db_session.query(File).filter(File.id == fid).one()
        md_id, tags = before.md_id, sorted(t.name for t in before.tags)
        on_disk = md.read_text()
        md.write_text(on_disk.replace("tags:", f"origin: {ORIGIN}\ntags:"))

        _scan(db_session)

        assert _origin(db_session, fid) == ORIGIN
        db_session.expire_all()
        after = db_session.query(File).filter(File.id == fid).one()
        assert after.md_id == md_id
        assert sorted(t.name for t in after.tags) == tags
