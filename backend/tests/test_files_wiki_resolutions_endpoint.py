"""HTTP tests for ``GET /api/files/{file_id}/wiki-resolutions``.

Spec: docs/superpowers/specs/2026-05-12-markdown-link-three-forms.md
§3.8 / Phase B.

The endpoint returns a per-target resolution map for the requested
``.md`` file, so the renderer can decide between resolved /
unresolved / ambiguous styling without re-parsing the body
client-side.

DESIGN DECISION (resolving spec ambiguity):
We pick the **separate endpoint** option over inlining a body on
``PUT /content``.  Rationale:

- ``PUT /content`` keeps its current ``Response(status_code=200,
  headers={"ETag": ...})`` shape so existing clients are unaffected
  (backward compatibility).
- Diagnostics may be needed on read paths too (Markdown preview on
  ``GET /content`` flow), not only after writes.
- The endpoint cleanly satisfies Internal-API R1-R5 evaluation: it's
  a read of a core entity (file relations), with a generic
  ``target → resolution`` map (no addon-vocabulary).
- The PUT response MAY carry an ``X-Link-Diagnostics-Count`` header
  when non-zero so the client knows whether to call the
  full-diagnostics endpoint; that header is purely advisory.

Response shape::

    {
      "resolutions": {
        "<target_text>": {
          "kind": "resolved" | "unresolved" | "ambiguous",
          "file_id": "<id>",              # only when kind == "resolved"
          "candidates": ["<path>", ...]   # only when kind == "ambiguous"
        },
        ...
      }
    }

Error contract:
- 404 — file missing / trashed / not found.
- 404 — drive is password-protected and the request is unauthenticated.
- 415 — file is not a ``.md`` (mime not ``text/markdown`` and
  filename does not end with ``.md``).

RED until the route is wired up.
"""
from __future__ import annotations

import hashlib
import json

import pytest

from app.models import File
from tests.conftest import TEST_DRIVE


def _etag_of(content: str | bytes) -> str:
    if isinstance(content, str):
        content = content.encode("utf-8")
    return hashlib.sha256(content).hexdigest()


def _seed_md_with_body(
    db, drive_dir, path: str, body: str = "initial\n"
) -> File:
    file_path = drive_dir / path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(body)

    *folders, filename = path.split("/")
    folder = "/".join(folders)
    f = File(
        filename=filename,
        title=filename,
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=path,
        file_size=len(body.encode("utf-8")),
        file_type="document",
        mime_type="text/markdown",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _put_content(api, file_id: str, body: str, old_body: str) -> None:
    r = api.put(
        f"/api/files/{file_id}/content",
        content=body.encode("utf-8"),
        headers={
            "Content-Type": "text/plain; charset=utf-8",
            "If-Match": f'"{_etag_of(old_body)}"',
        },
    )
    assert r.status_code == 200, r.text


class TestWikiResolutionsHappyPath:
    def test_resolved_basename_appears_in_map(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md_with_body(session, drive_dir, "note.md", "initial\n")
        target = _seed_md_with_body(
            session, drive_dir, "year-recap.md", "initial2\n"
        )
        body = "See [[year-recap]] for context.\n"
        _put_content(api, note.id, body, "initial\n")

        r = api.get(f"/api/files/{note.id}/wiki-resolutions")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "resolutions" in data
        entry = data["resolutions"]["year-recap"]
        assert entry["kind"] == "resolved"
        assert entry["file_id"] == target.id

    def test_unresolved_appears_in_map(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md_with_body(session, drive_dir, "note.md", "initial\n")
        _put_content(api, note.id, "See [[ghost]]\n", "initial\n")

        r = api.get(f"/api/files/{note.id}/wiki-resolutions")
        assert r.status_code == 200, r.text
        data = r.json()
        entry = data["resolutions"]["ghost"]
        assert entry["kind"] == "unresolved"
        assert "file_id" not in entry or entry.get("file_id") is None
        # ``candidates`` is empty or absent for unresolved.
        assert not entry.get("candidates")

    def test_ambiguous_appears_with_candidates(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md_with_body(session, drive_dir, "note.md", "initial\n")
        _seed_md_with_body(session, drive_dir, "a/year.md", "x")
        _seed_md_with_body(session, drive_dir, "b/year.md", "y")
        _put_content(api, note.id, "See [[year]]\n", "initial\n")

        r = api.get(f"/api/files/{note.id}/wiki-resolutions")
        assert r.status_code == 200, r.text
        entry = r.json()["resolutions"]["year"]
        assert entry["kind"] == "ambiguous"
        candidates = set(entry.get("candidates") or [])
        assert "a/year.md" in candidates
        assert "b/year.md" in candidates

    def test_loft_inline_links_not_in_wiki_map(self, client):
        # ``loft://`` inline links are NOT wiki-link targets — they are
        # not included in the resolutions map.  Only ``[[X]]`` targets
        # appear.
        api, session, drive_dir, _ = client
        note = _seed_md_with_body(session, drive_dir, "note.md", "initial\n")
        target = _seed_md_with_body(
            session, drive_dir, "year-recap.md", "x"
        )
        body = (
            f"See [[year-recap]] and [video](loft://{target.id})\n"
        )
        _put_content(api, note.id, body, "initial\n")

        r = api.get(f"/api/files/{note.id}/wiki-resolutions")
        assert r.status_code == 200, r.text
        resolutions = r.json()["resolutions"]
        assert "year-recap" in resolutions
        # The loft id text is NOT a key.
        assert target.id not in resolutions

    def test_empty_body_yields_empty_map(self, client):
        api, session, drive_dir, _ = client
        note = _seed_md_with_body(session, drive_dir, "note.md", "initial\n")
        _put_content(api, note.id, "Just prose.\n", "initial\n")

        r = api.get(f"/api/files/{note.id}/wiki-resolutions")
        assert r.status_code == 200, r.text
        assert r.json()["resolutions"] == {}


class TestWikiResolutionsErrors:
    def test_404_on_unknown_file(self, client):
        api, _, _, _ = client
        r = api.get("/api/files/nonexistent12/wiki-resolutions")
        # 404 from missing file ID; the path validator enforces the
        # 12-char format so an invalid format yields 422 instead.
        assert r.status_code in (404, 422)

    def test_404_on_trashed_file(self, client):
        from datetime import UTC, datetime

        api, session, drive_dir, _ = client
        f = _seed_md_with_body(session, drive_dir, "note.md", "x")
        f.deleted_at = datetime.now(UTC).replace(tzinfo=None)
        session.commit()
        r = api.get(f"/api/files/{f.id}/wiki-resolutions")
        assert r.status_code == 404

    def test_404_on_missing_file(self, client):
        from datetime import UTC, datetime

        api, session, drive_dir, _ = client
        f = _seed_md_with_body(session, drive_dir, "note.md", "x")
        f.missing_since = datetime.now(UTC).replace(tzinfo=None)
        session.commit()
        r = api.get(f"/api/files/{f.id}/wiki-resolutions")
        assert r.status_code == 404

    def test_415_on_non_markdown(self, client):
        api, session, drive_dir, _ = client
        # Seed a non-md file.
        (drive_dir / "video.mp4").write_bytes(b"\x00" * 64)
        f = File(
            filename="video.mp4",
            title="video.mp4",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="video.mp4",
            file_size=64,
            file_type="video",
            mime_type="video/mp4",
        )
        session.add(f)
        session.commit()
        session.refresh(f)
        r = api.get(f"/api/files/{f.id}/wiki-resolutions")
        assert r.status_code == 415


class TestWikiResolutionsDriveScope:
    def test_resolutions_only_consider_same_drive(self, client, tmp_path):
        # The resolver must not leak files from a different drive.
        # We add a second drive with a matching basename and assert
        # the .md from the first drive treats the target as unresolved.
        import json as _json

        import app.config as config

        api, session, drive_dir, _ = client
        # Second drive: create its on-disk directory and add to drives.json.
        second_dir = tmp_path / "drives" / "second-drive"
        second_dir.mkdir(parents=True, exist_ok=True)
        drives_json_path = config.DRIVES_CONFIG
        # Read current drives.json (created by the fixture).
        existing = _json.loads(drives_json_path.read_text())
        existing.append({"name": "second-drive", "path": str(second_dir)})
        drives_json_path.write_text(_json.dumps(existing))
        config._drives_cache = None

        # Seed `year-recap` on the SECOND drive (not the one the note lives on).
        (second_dir / "year-recap.md").write_text("x")
        other = File(
            filename="year-recap.md",
            title="year-recap.md",
            drive="second-drive",
            folder_path="",
            file_path="year-recap.md",
            file_size=1,
            file_type="document",
            mime_type="text/markdown",
        )
        session.add(other)
        session.commit()

        note = _seed_md_with_body(session, drive_dir, "note.md", "initial\n")
        _put_content(api, note.id, "[[year-recap]]\n", "initial\n")

        r = api.get(f"/api/files/{note.id}/wiki-resolutions")
        assert r.status_code == 200, r.text
        entry = r.json()["resolutions"]["year-recap"]
        # Cross-drive resolution forbidden → unresolved.
        assert entry["kind"] == "unresolved"
