"""Integration tests for PUT /api/files/{id}/content frontmatter ``id:`` injection.

Spec: docs/superpowers/specs/2026-05-12-markdown-link-three-forms.md §3.1 / §4 Phase A.

For ``.md`` files, the PUT /content handler must:

1. Parse the request body as frontmatter.
2. Call ``ensure_id`` with ``existing_id=file.md_id`` to decide whether
   to inject an ``id:``.
3. If the id was added/changed, re-compose the body with the new
   metadata and write THAT to disk (not the original request bytes).
4. After the atomic write, project the id into ``File.md_id`` in a
   separate transaction (same isolation pattern as the existing tag
   projection / loft-link sync blocks).
5. If a generated id collides with another ``File.md_id`` in the same
   drive, append a 3-digit millisecond suffix (→ 17-char total).
6. Non-``.md`` writes are untouched.
7. Malformed frontmatter does not crash — id injection is skipped.

The Etag returned by the endpoint must hash the actually-written bytes
(with id), not the original request body, so the client's next
If-Match round-trip aligns with what's on disk.
"""
import hashlib
from datetime import UTC, datetime

import pytest

import app.routers.files as files_mod
from app.models import File
from app.services.frontmatter import parse as parse_frontmatter
from tests.conftest import TEST_DRIVE


class _FrozenDT:
    """``datetime`` shim that returns a fixed ``now``.

    Used by ``monkeypatch.setattr(files_mod, "datetime", _FrozenDT(...))``
    to make collision-path assertions deterministic. Other attributes
    fall through to the real ``datetime`` so callers can still do
    ``datetime(...)`` or ``datetime.fromisoformat(...)``.
    """

    def __init__(self, fixed: datetime) -> None:
        self._fixed = fixed

    def now(self, tz=None) -> datetime:
        return self._fixed if tz is None else self._fixed.astimezone(tz)

    def __getattr__(self, name: str):
        return getattr(datetime, name)


def _etag_of(content: str | bytes) -> str:
    if isinstance(content, str):
        content = content.encode("utf-8")
    return hashlib.sha256(content).hexdigest()


def _seed_md(db, drive_dir, path: str, content: str = "initial\n") -> File:
    file_path = drive_dir / path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content)

    *folders, filename = path.split("/")
    folder = "/".join(folders)

    f = File(
        filename=filename,
        title=filename,
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=path,
        file_size=len(content.encode("utf-8")),
        file_type="document",
        mime_type="text/markdown",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _seed_txt(db, drive_dir, path: str, content: str = "initial\n") -> File:
    file_path = drive_dir / path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content)

    *folders, filename = path.split("/")
    folder = "/".join(folders)

    f = File(
        filename=filename,
        title=filename,
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=path,
        file_size=len(content.encode("utf-8")),
        file_type="document",
        mime_type="text/plain",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


class TestIdInjectionOnNewMd:
    """PUT /content on a freshly-created .md without ``id:`` injects one."""

    def test_body_without_id_gains_id_on_disk(self, client):
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "notes/new.md", "initial\n")
        new_content = "---\ntags:\n  - a\n---\n\n# Body\n"

        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text

        on_disk = (drive_dir / "notes/new.md").read_text()
        parsed = parse_frontmatter(on_disk)
        assert "id" in parsed.metadata
        # 14- or 17-digit timestamp string.
        id_val = parsed.metadata["id"]
        assert isinstance(id_val, str)
        assert id_val.isdigit()
        assert 12 <= len(id_val) <= 17

    def test_file_md_id_column_matches_frontmatter(self, client):
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "notes/new.md", "initial\n")
        new_content = "---\ntags:\n  - a\n---\n\nbody\n"

        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text

        session.expire_all()
        refreshed = session.query(File).filter(File.id == file.id).first()
        assert refreshed.md_id is not None
        on_disk = (drive_dir / "notes/new.md").read_text()
        fm = parse_frontmatter(on_disk).metadata
        assert refreshed.md_id == fm["id"]
        # No other md_id exists in the drive, so the common-case 14-digit
        # form is used (collision-bumped 17-digit is the rare exception).
        assert len(refreshed.md_id) == 14
        assert refreshed.md_id.isdigit()

    def test_etag_matches_written_bytes_not_request_body(self, client):
        # The returned ETag must hash what's on disk (with id), so the
        # next round-trip's If-Match aligns. Request bytes (without id)
        # would diverge from disk after the server's rewrite.
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "notes/new.md", "initial\n")
        new_content = "---\ntags:\n  - a\n---\n\nbody\n"

        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        on_disk = (drive_dir / "notes/new.md").read_text()
        assert r.headers["ETag"].strip('"') == _etag_of(on_disk)
        # Sanity: the body we sent did NOT contain id, so the etag must
        # diverge from the request bytes.
        assert r.headers["ETag"].strip('"') != _etag_of(new_content)


class TestIdInjectionPreservesExisting:
    def test_body_with_valid_id_unchanged(self, client):
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "notes/k.md", "initial\n")
        new_content = (
            "---\n"
            "id: \"20260512143028\"\n"
            "tags:\n  - a\n"
            "---\n\nbody\n"
        )
        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        on_disk = (drive_dir / "notes/k.md").read_text()
        # Frontmatter id is preserved exactly.
        assert parse_frontmatter(on_disk).metadata["id"] == "20260512143028"
        # File.md_id projection is in sync.
        session.expire_all()
        refreshed = session.query(File).filter(File.id == file.id).first()
        assert refreshed.md_id == "20260512143028"

    def test_etag_matches_request_body_when_id_already_present(self, client):
        # When the body already has a valid id we don't rewrite the
        # bytes — the ETag matches the request as-is.
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "notes/k.md", "initial\n")
        new_content = "---\nid: \"20260512143028\"\n---\n\nbody\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        assert r.headers["ETag"].strip('"') == _etag_of(new_content)


class TestIdInjectionReusesDbMdId:
    """If body lacks ``id:`` but ``File.md_id`` is set, re-inject from DB."""

    def test_stale_frontmatter_reinjects_db_md_id(self, client):
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "notes/r.md", "initial\n")
        # Pre-seed File.md_id as if the previous write had captured it.
        file.md_id = "20251231235959"
        session.commit()

        # Body has tags but no id (Obsidian-edited externally, plugin
        # stripped frontmatter, etc.)
        new_content = "---\ntags:\n  - a\n---\n\nbody\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        on_disk = (drive_dir / "notes/r.md").read_text()
        fm = parse_frontmatter(on_disk).metadata
        # DB id wins over a fresh-timestamp id.
        assert fm["id"] == "20251231235959"


class TestIdInjectionCollision:
    """A generated id that collides with another File.md_id in the same
    drive falls back to a 17-digit ms-suffixed id."""

    def test_collision_uses_17_digit_suffix(self, client, monkeypatch):
        api, session, drive_dir, _ = client
        # Freeze the clock so the generated 14-digit id deterministically
        # collides with the pre-seeded md_id below. ``microsecond=123_000``
        # exercises the ``microsecond // 1000`` ms-suffix path.
        fixed_now = datetime(2026, 5, 12, 14, 30, 28, 123_000, tzinfo=UTC)
        monkeypatch.setattr(files_mod, "datetime", _FrozenDT(fixed_now))

        # Pre-seed another file in the same drive whose md_id collides
        # with the generator's first attempt under the frozen clock.
        other_path = drive_dir / "other.md"
        other_path.write_text("---\nid: \"20260512143028\"\n---\n\nbody\n")
        other = File(
            filename="other.md",
            title="other.md",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="other.md",
            file_size=other_path.stat().st_size,
            file_type="document",
            mime_type="text/markdown",
            md_id="20260512143028",
        )
        session.add(other)
        session.commit()

        # Now write a fresh .md that will need an id. The first attempt
        # collides; the helper must fall back to 17 digits.
        file = _seed_md(session, drive_dir, "fresh.md", "initial\n")
        new_content = "---\ntags:\n  - a\n---\n\nbody\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        on_disk = (drive_dir / "fresh.md").read_text()
        fm = parse_frontmatter(on_disk).metadata
        # Exact id: base 14 digits + 3 ms digits (microsecond // 1000).
        assert fm["id"] == "20260512143028123"

        # Projection matches.
        session.expire_all()
        refreshed = session.query(File).filter(File.id == file.id).first()
        assert refreshed.md_id == "20260512143028123"


class TestIdInjectionSkipsNonMarkdown:
    def test_txt_file_not_injected(self, client):
        api, session, drive_dir, _ = client
        file = _seed_txt(session, drive_dir, "plain.txt", "initial\n")

        new_content = "---\ntags:\n  - a\n---\n\nbody\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        # No id injection: disk content is the raw request body.
        on_disk = (drive_dir / "plain.txt").read_text()
        assert on_disk == new_content

        session.expire_all()
        refreshed = session.query(File).filter(File.id == file.id).first()
        # md_id remains NULL for non-.md.
        assert refreshed.md_id is None


class TestIdInjectionMalformedFrontmatter:
    def test_malformed_frontmatter_writes_body_as_is(self, client):
        # When YAML is broken, the helper skips id injection rather
        # than crash. The bytes still land on disk.
        api, session, drive_dir, _ = client
        file = _seed_md(session, drive_dir, "notes/x.md", "initial\n")
        new_content = "---\ntags: [unterminated\n---\n\nbody\n"
        r = api.put(
            f"/api/files/{file.id}/content",
            content=new_content.encode("utf-8"),
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "If-Match": f'"{_etag_of("initial\n")}"',
            },
        )
        assert r.status_code == 200, r.text
        assert (drive_dir / "notes/x.md").read_text() == new_content
        # Etag matches the raw request bytes (no rewrite happened).
        assert r.headers["ETag"].strip('"') == _etag_of(new_content)
        # md_id remains NULL (or untouched).
        session.expire_all()
        refreshed = session.query(File).filter(File.id == file.id).first()
        assert refreshed.md_id is None
