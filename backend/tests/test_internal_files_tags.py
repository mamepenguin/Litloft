"""HTTP tests for POST /api/internal/files/{id}/tags.

Replaces a file's tags via the trusted internal caller (typically the
knowledge scanner projecting frontmatter.tags onto File.tags for .md
files). Gated by CORE_INTERNAL_SECRET, same pattern as
GET /files/{id}/content. Spec:
``docs/superpowers/specs/2026-04-24-knowledge-tag-unification.md``.
"""

from __future__ import annotations

import os

import pytest

from app.models import File, Tag
from tests.conftest import TEST_DRIVE


def _seed_file(db, drive_dir, path: str = "notes/hello.md") -> File:
    fp = drive_dir / path
    fp.parent.mkdir(parents=True, exist_ok=True)
    fp.write_text("body\n", encoding="utf-8")
    *folders, filename = path.split("/")
    f = File(
        filename=filename,
        title=filename,
        drive=TEST_DRIVE,
        folder_path="/".join(folders),
        file_path=path,
        file_size=5,
        file_type="document",
        mime_type="text/markdown",
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


@pytest.fixture(autouse=True)
def _clear_secret_env():
    prev = os.environ.pop("CORE_INTERNAL_SECRET", None)
    try:
        yield
    finally:
        if prev is not None:
            os.environ["CORE_INTERNAL_SECRET"] = prev
        else:
            os.environ.pop("CORE_INTERNAL_SECRET", None)


class TestInternalFileTagsReplace:
    def test_replaces_tags_when_secret_unset(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        r = c.post(
            f"/api/internal/files/{f.id}/tags",
            json={"tags": ["cooking", "japanese"]},
        )
        assert r.status_code == 204, r.text
        db.expire_all()
        refreshed = db.query(File).filter(File.id == f.id).one()
        assert {t.name for t in refreshed.tags} == {"cooking", "japanese"}

    def test_replaces_tags_with_matching_secret(self, client):
        c, db, drive_dir, _ = client
        os.environ["CORE_INTERNAL_SECRET"] = "topsecret"
        f = _seed_file(db, drive_dir)
        r = c.post(
            f"/api/internal/files/{f.id}/tags",
            headers={"X-Internal-Secret": "topsecret"},
            json={"tags": ["a", "b"]},
        )
        assert r.status_code == 204, r.text

    def test_rejects_missing_secret_when_configured(self, client):
        c, db, drive_dir, _ = client
        os.environ["CORE_INTERNAL_SECRET"] = "topsecret"
        f = _seed_file(db, drive_dir)
        r = c.post(f"/api/internal/files/{f.id}/tags", json={"tags": ["x"]})
        assert r.status_code == 403

    def test_rejects_mismatched_secret(self, client):
        c, db, drive_dir, _ = client
        os.environ["CORE_INTERNAL_SECRET"] = "topsecret"
        f = _seed_file(db, drive_dir)
        r = c.post(
            f"/api/internal/files/{f.id}/tags",
            headers={"X-Internal-Secret": "wrong"},
            json={"tags": ["x"]},
        )
        assert r.status_code == 403

    def test_404_for_unknown_file(self, client):
        c, _, _, _ = client
        r = c.post(
            "/api/internal/files/unknown-0001/tags",
            json={"tags": []},
        )
        assert r.status_code == 404

    def test_404_for_trashed_file(self, client):
        c, db, drive_dir, _ = client
        from datetime import UTC, datetime

        f = _seed_file(db, drive_dir)
        f.deleted_at = datetime.now(UTC)
        db.commit()
        r = c.post(
            f"/api/internal/files/{f.id}/tags",
            json={"tags": ["x"]},
        )
        assert r.status_code == 404

    def test_404_for_missing_file(self, client):
        c, db, drive_dir, _ = client
        from datetime import UTC, datetime

        f = _seed_file(db, drive_dir)
        f.missing_since = datetime.now(UTC)
        db.commit()
        r = c.post(
            f"/api/internal/files/{f.id}/tags",
            json={"tags": ["x"]},
        )
        assert r.status_code == 404

    def test_empty_list_clears_tags(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        # seed with some tags
        c.post(
            f"/api/internal/files/{f.id}/tags",
            json={"tags": ["a", "b"]},
        )
        # now clear
        r = c.post(
            f"/api/internal/files/{f.id}/tags",
            json={"tags": []},
        )
        assert r.status_code == 204
        db.expire_all()
        refreshed = db.query(File).filter(File.id == f.id).one()
        assert refreshed.tags == []

    def test_case_insensitive_dedup_keeps_first(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        r = c.post(
            f"/api/internal/files/{f.id}/tags",
            json={"tags": ["Cooking", "cooking", "JAPANESE"]},
        )
        assert r.status_code == 204
        db.expire_all()
        refreshed = db.query(File).filter(File.id == f.id).one()
        # Validator dedupes case-insensitively, keeping first occurrence
        names = {t.name for t in refreshed.tags}
        assert names == {"Cooking", "JAPANESE"}

    def test_orphan_tags_are_cleaned_up(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        c.post(
            f"/api/internal/files/{f.id}/tags",
            json={"tags": ["orphan-candidate"]},
        )
        assert db.query(Tag).filter(Tag.name == "orphan-candidate").count() == 1
        # Replace with different tags → orphan-candidate should be deleted
        c.post(
            f"/api/internal/files/{f.id}/tags",
            json={"tags": ["keeper"]},
        )
        db.expire_all()
        assert db.query(Tag).filter(Tag.name == "orphan-candidate").count() == 0
        assert db.query(Tag).filter(Tag.name == "keeper").count() == 1

    def test_reuses_existing_tag_row_for_same_drive(self, client):
        c, db, drive_dir, _ = client
        f1 = _seed_file(db, drive_dir, "notes/a.md")
        f2 = _seed_file(db, drive_dir, "notes/b.md")

        c.post(
            f"/api/internal/files/{f1.id}/tags",
            json={"tags": ["shared"]},
        )
        c.post(
            f"/api/internal/files/{f2.id}/tags",
            json={"tags": ["shared"]},
        )
        # Single Tag row reused across both files
        rows = db.query(Tag).filter(Tag.name == "shared", Tag.drive == TEST_DRIVE).all()
        assert len(rows) == 1
        assert len(rows[0].files) == 2

    def test_invalid_tag_name_returns_422(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        # TagUpdate validator rejects tags with spaces / special chars
        r = c.post(
            f"/api/internal/files/{f.id}/tags",
            json={"tags": ["invalid name with space"]},
        )
        assert r.status_code == 422

    def test_max_10_tags(self, client):
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        r = c.post(
            f"/api/internal/files/{f.id}/tags",
            json={"tags": [f"t{i}" for i in range(11)]},
        )
        assert r.status_code == 422

    def test_existing_public_api_still_works(self, client):
        """Regression: refactoring to shared helpers must not change
        the behaviour of the public PUT /api/files/{id}/tags.
        """
        c, db, drive_dir, _ = client
        f = _seed_file(db, drive_dir)
        r = c.put(f"/api/files/{f.id}/tags", json={"tags": ["public-api"]})
        assert r.status_code == 200
        data = r.json()
        assert data["tags"] == ["public-api"]
