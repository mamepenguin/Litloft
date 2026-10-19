"""Tag writes on .md files go to the frontmatter, the canonical store."""
import hashlib

import pytest
import yaml
from app.models import File
from app.services.frontmatter import parse

from tests.conftest import TEST_DRIVE


def _etag_of(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _seed(db, drive_dir, path: str, content: str | bytes, mime="text/markdown") -> File:
    raw = content.encode("utf-8") if isinstance(content, str) else content
    fp = drive_dir / path
    fp.parent.mkdir(parents=True, exist_ok=True)
    fp.write_bytes(raw)
    *folders, filename = path.split("/")
    f = File(
        filename=filename,
        title=filename,
        drive=TEST_DRIVE,
        folder_path="/".join(folders),
        file_path=path,
        file_size=len(raw),
        file_type="document" if mime.startswith("text/") else "video",
        mime_type=mime,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _db_tags(db, file_id) -> list[str]:
    db.expire_all()
    f = db.query(File).filter(File.id == file_id).one()
    return sorted(t.name for t in f.tags)


def _disk(drive_dir, path) -> str:
    return (drive_dir / path).read_text(encoding="utf-8")


@pytest.mark.parametrize(
    ("content", "tags", "want_meta", "want_body"),
    [
        ("plain body\n", ["a", "b"], {"tags": ["a", "b"]}, "plain body\n"),
        (
            "---\nid: '20260101000000'\ntitle: T\naliases:\n- x\n---\n\nbody\n",
            ["a"],
            {"id": "20260101000000", "title": "T", "aliases": ["x"], "tags": ["a"]},
            "body\n",
        ),
        ("---\ntitle: T\ntags:\n- old\n---\n\nbody\n", ["new"], {"title": "T", "tags": ["new"]}, "body\n"),
        ("---\ntitle: T\ntags:\n- old\n---\n\nbody\n", [], {"title": "T"}, "body\n"),
        ("---\ntags:\n- old\n---\n\nbody\n", [], {}, "body\n"),
        ("body\n", [], {}, "body\n"),
        ("\ufeff---\ntags:\n- old\n---\n\nbody\n", [], {}, "body\n"),
        ("---\n---\nbody\n", ["a"], {"tags": ["a"]}, "body\n"),
    ],
)
def test_put_tags_writes_frontmatter(client, content, tags, want_meta, want_body):
    c, db, drive_dir, _ = client
    f = _seed(db, drive_dir, "notes/n.md", content)

    r = c.put(f"/api/files/{f.id}/tags", json={"tags": tags})

    assert r.status_code == 200, r.text
    assert sorted(r.json()["tags"]) == sorted(tags)
    parsed = parse(_disk(drive_dir, "notes/n.md"))
    assert parsed.metadata == want_meta
    assert parsed.body == want_body
    assert _db_tags(db, f.id) == sorted(tags)


def test_tags_survive_a_body_only_content_write(client):
    c, db, drive_dir, _ = client
    f = _seed(db, drive_dir, "notes/n.md", "---\ntags:\n- original\n---\n\nbody\n")

    assert c.put(f"/api/files/{f.id}/tags", json={"tags": ["added"]}).status_code == 200
    current = (drive_dir / "notes/n.md").read_bytes()
    edited = current.decode("utf-8") + "more\n"
    r = c.put(
        f"/api/files/{f.id}/content",
        content=edited.encode("utf-8"),
        headers={"If-Match": f'"{_etag_of(current)}"', "Content-Type": "text/plain"},
    )

    assert r.status_code == 200, r.text
    assert _db_tags(db, f.id) == ["added"]


def test_put_tags_repairs_drifted_db_tags_without_rewriting(client):
    c, db, drive_dir, _ = client
    content = "---\ntags:\n- a\n---\n\nbody\n"
    f = _seed(db, drive_dir, "notes/n.md", content)

    r = c.put(f"/api/files/{f.id}/tags", json={"tags": ["a"]})

    assert r.status_code == 200, r.text
    assert _disk(drive_dir, "notes/n.md") == content
    assert _db_tags(db, f.id) == ["a"]


_BIG = "x" * (1024 * 1024 + 1)


@pytest.mark.parametrize(
    ("content", "status"),
    [
        (b"---\r\ntags:\r\n- a\r\n---\r\nbody\r\n", 422),
        (b"---\ntags: [a\n---\nbody\n", 422),
        (b"---\ntags:\n- a\nbody without close\n", 422),
        (b"---\nSome paragraph\n---\nbody\n", 422),
        (b"---\n- a\n- b\n---\nbody\n", 422),
        ("﻿---\ntags: [a\n---\nbody\n".encode(), 422),
        (b"---\ntags:\n- a\n---\n\xff\xfe body\n", 422),
        pytest.param(_BIG.encode("utf-8"), 413, id="over-limit-before-write"),
        pytest.param(("y" * (1024 * 1024 - 8)).encode("utf-8"), 413, id="over-limit-after-compose"),
        pytest.param(
            ("---\ntags:\n- new\n---\n\n" + "z" * (1024 * 1024)).encode("utf-8"),
            413,
            id="over-limit-tags-unchanged",
        ),
    ],
)
def test_put_tags_rejects_unwritable_md_and_changes_nothing(client, content, status):
    c, db, drive_dir, _ = client
    f = _seed(db, drive_dir, "notes/n.md", content)

    r = c.put(f"/api/files/{f.id}/tags", json={"tags": ["new"]})

    assert r.status_code == status, r.text
    assert (drive_dir / "notes/n.md").read_bytes() == content
    assert _db_tags(db, f.id) == []


def test_non_markdown_put_tags_touches_only_the_db(client):
    c, db, drive_dir, _ = client
    f = _seed(db, drive_dir, "v/clip.mp4", b"\x00" * 64, mime="video/mp4")

    r = c.put(f"/api/files/{f.id}/tags", json={"tags": ["a"]})

    assert r.status_code == 200, r.text
    assert (drive_dir / "v/clip.mp4").read_bytes() == b"\x00" * 64
    assert _db_tags(db, f.id) == ["a"]


def test_put_tags_invalidates_an_editor_holding_the_old_etag(client):
    c, db, drive_dir, _ = client
    content = b"---\ntitle: T\n---\n\nbody\n"
    f = _seed(db, drive_dir, "notes/n.md", content)

    assert c.put(f"/api/files/{f.id}/tags", json={"tags": ["a"]}).status_code == 200
    r = c.put(
        f"/api/files/{f.id}/content",
        content=b"---\ntitle: T\n---\n\nedited\n",
        headers={"If-Match": f'"{_etag_of(content)}"', "Content-Type": "text/plain"},
    )

    assert r.status_code == 412
    assert _db_tags(db, f.id) == ["a"]


class TestBatchTags:
    def test_merges_into_md_frontmatter_and_db_for_others(self, client):
        c, db, drive_dir, _ = client
        md = _seed(db, drive_dir, "notes/a.md", "---\ntitle: T\ntags:\n- Keep\n- 'with space'\n---\n\nbody\n")
        vid = _seed(db, drive_dir, "v/clip.mp4", b"\x00" * 64, mime="video/mp4")

        r = c.put("/api/files/batch/tags", json={"ids": [md.id, vid.id], "tags": ["keep", "new"]})

        assert r.status_code == 200, r.text
        assert r.json() == {"updated": 2, "errors": []}
        meta = parse(_disk(drive_dir, "notes/a.md")).metadata
        assert meta == {"title": "T", "tags": ["Keep", "with space", "new"]}
        assert _db_tags(db, md.id) == ["Keep", "new"]
        assert _db_tags(db, vid.id) == ["Keep", "new"]
        assert (drive_dir / "v/clip.mp4").read_bytes() == b"\x00" * 64

    @pytest.mark.parametrize(
        "bad",
        [
            b"---\ntags: [a\n---\nbody\n",
            b"---\ntags: solo\n---\nbody\n",
            b"---\r\ntags:\r\n- a\r\n---\r\nbody\r\n",
        ],
    )
    def test_one_unwritable_md_does_not_stop_the_others(self, client, bad):
        c, db, drive_dir, _ = client
        good = _seed(db, drive_dir, "notes/good.md", "body\n")
        broken = _seed(db, drive_dir, "notes/bad.md", bad)

        r = c.put("/api/files/batch/tags", json={"ids": [broken.id, good.id], "tags": ["x"]})

        assert r.status_code == 200, r.text
        body = r.json()
        assert body["updated"] == 1
        assert [e["id"] for e in body["errors"]] == [broken.id]
        assert (drive_dir / "notes/bad.md").read_bytes() == bad
        assert _db_tags(db, broken.id) == []
        assert parse(_disk(drive_dir, "notes/good.md")).metadata == {"tags": ["x"]}
        assert _db_tags(db, good.id) == ["x"]

    def test_os_error_on_one_file_is_reported_per_file(self, client, monkeypatch):
        c, db, drive_dir, _ = client
        first = _seed(db, drive_dir, "notes/first.md", "body\n")
        failing = _seed(db, drive_dir, "notes/failing.md", "body\n")

        from app.services import content_write

        real = content_write.replace_file_contents

        def flaky(path, data):
            if path.name == "failing.md":
                raise PermissionError("read-only")
            return real(path, data)

        monkeypatch.setattr(content_write, "replace_file_contents", flaky)

        r = c.put("/api/files/batch/tags", json={"ids": [first.id, failing.id], "tags": ["x"]})

        assert r.status_code == 200, r.text
        body = r.json()
        assert body["updated"] == 1
        assert [e["id"] for e in body["errors"]] == [failing.id]
        assert _db_tags(db, first.id) == ["x"]
        assert _db_tags(db, failing.id) == []
        assert _disk(drive_dir, "notes/failing.md") == "body\n"


def test_written_frontmatter_is_plain_yaml(client):
    c, db, drive_dir, _ = client
    f = _seed(db, drive_dir, "notes/n.md", "body\n")

    c.put(f"/api/files/{f.id}/tags", json={"tags": ["日本語"]})

    text = _disk(drive_dir, "notes/n.md")
    assert text.startswith("---\n")
    assert yaml.safe_load(text.split("---\n")[1]) == {"tags": ["日本語"]}


@pytest.mark.parametrize(
    "body",
    ["---\ntags:\n- hidden\n---\nrest\n", "---\n\nSection text\n\n---\nmore\n"],
)
def test_clearing_the_last_key_keeps_a_body_that_opens_with_a_rule(client, body):
    c, db, drive_dir, _ = client
    f = _seed(db, drive_dir, "notes/n.md", "---\ntags:\n- a\n---\n\n" + body)

    r = c.put(f"/api/files/{f.id}/tags", json={"tags": []})

    assert r.status_code == 200, r.text
    parsed = parse(_disk(drive_dir, "notes/n.md"))
    assert parsed.metadata == {}
    assert parsed.body == body
    assert _db_tags(db, f.id) == []


def test_put_tags_refuses_a_md_symlinked_outside_the_drive(client):
    c, db, drive_dir, _ = client
    outside = drive_dir.parent / "outside.md"
    outside.write_text("---\ntags:\n- secret\n---\n\nbody\n", encoding="utf-8")
    (drive_dir / "notes").mkdir(parents=True, exist_ok=True)
    (drive_dir / "notes/link.md").symlink_to(outside)
    f = File(
        filename="link.md",
        title="link.md",
        drive=TEST_DRIVE,
        folder_path="notes",
        file_path="notes/link.md",
        file_size=10,
        file_type="document",
        mime_type="text/markdown",
    )
    db.add(f)
    db.commit()

    r = c.put(f"/api/files/{f.id}/tags", json={"tags": ["x"]})

    assert r.status_code == 403
    assert outside.read_text(encoding="utf-8") == "---\ntags:\n- secret\n---\n\nbody\n"
    assert (drive_dir / "notes/link.md").is_symlink()
    assert _db_tags(db, f.id) == []
