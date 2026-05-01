"""HTTP contract tests for GET /api/internal/files/{id} thumbnail_path field.

Spec: docs/superpowers/specs/2026-05-02-thumbnail-clip-default-shallow-search.md
Related hako: VHE7K0KWjIzV3M1CyfDAN (addon → core wire shape contract).

The intelligence addon projects ``thumbnail_path`` onto its
``IndexedFile`` row so the CLIP worker can embed the representative
frame without an HTTP roundtrip per file. This contract test pins the
wire shape so the projection path stays correct if core code shifts.
"""

from __future__ import annotations

from app.models import File
from tests.conftest import TEST_DRIVE


def _seed_video(db, drive_dir, path: str, *, thumbnail_path: str | None) -> File:
    fp = drive_dir / path
    fp.parent.mkdir(parents=True, exist_ok=True)
    fp.write_bytes(b"\x00" * 64)

    *folders, filename = path.split("/")
    folder = "/".join(folders)

    f = File(
        filename=filename,
        title=filename,
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=path,
        file_size=64,
        file_type="video",
        mime_type="video/mp4",
        thumbnail_path=thumbnail_path,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def test_file_info_includes_thumbnail_path_when_set(client):
    c, db, drive_dir, _ = client
    f = _seed_video(
        db, drive_dir, "videos/clip.mp4",
        thumbnail_path="thumbnails/clip.jpg",
    )

    r = c.get(f"/api/internal/files/{f.id}")
    assert r.status_code == 200
    payload = r.json()
    assert payload["id"] == f.id
    assert payload["thumbnail_path"] == "thumbnails/clip.jpg"


def test_file_info_thumbnail_path_null_when_unset(client):
    c, db, drive_dir, _ = client
    f = _seed_video(db, drive_dir, "videos/no_thumb.mp4", thumbnail_path=None)

    r = c.get(f"/api/internal/files/{f.id}")
    assert r.status_code == 200
    payload = r.json()
    assert payload["id"] == f.id
    assert payload["thumbnail_path"] is None


def test_file_info_response_shape_keys(client):
    c, db, drive_dir, _ = client
    f = _seed_video(db, drive_dir, "videos/c.mp4", thumbnail_path="t/c.jpg")

    r = c.get(f"/api/internal/files/{f.id}")
    assert r.status_code == 200
    payload = r.json()

    expected = {
        "id", "drive", "filename", "file_type", "folder_path",
        "thumbnail_path", "updated_at",
    }
    assert expected.issubset(set(payload.keys()))
