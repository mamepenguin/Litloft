"""GET /api/drives/{drive}/folder-counts and the kind filter on GET /api/drives/{drive}/tags."""
from __future__ import annotations

from datetime import UTC, datetime

from app.models import File, Tag
from tests.conftest import TEST_DRIVE


def _file(db, path: str, *, mime: str, file_type: str = "document", deleted: bool = False, missing: bool = False, tags=()):
    *folders, filename = path.split("/")
    row = File(
        filename=filename,
        title=filename,
        drive=TEST_DRIVE,
        folder_path="/".join(folders),
        file_path=path,
        file_size=1,
        file_type=file_type,
        mime_type=mime,
        deleted_at=datetime.now(UTC).replace(tzinfo=None) if deleted else None,
        missing_since=datetime.now(UTC).replace(tzinfo=None) if missing else None,
    )
    for name in tags:
        tag = db.query(Tag).filter(Tag.drive == TEST_DRIVE, Tag.name == name).first() or Tag(name=name, drive=TEST_DRIVE)
        row.tags.append(tag)
    db.add(row)
    db.commit()
    return row


class TestFolderCounts:
    def test_counts_active_files_of_the_kind_per_exact_folder(self, client):
        api, db, _, _ = client
        _file(db, "root.md", mime="text/markdown")
        _file(db, "Knowledge/a.md", mime="text/markdown")
        _file(db, "Knowledge/b.txt", mime="text/plain")
        _file(db, "Knowledge/AI/c.md", mime="text/markdown")
        _file(db, "Knowledge/clip.mp4", mime="video/mp4", file_type="video")
        _file(db, "Knowledge/gone.md", mime="text/markdown", deleted=True)
        _file(db, "Knowledge/lost.md", mime="text/markdown", missing=True)
        _file(db, "Videos/v.mp4", mime="video/mp4", file_type="video")

        res = api.get(f"/api/drives/{TEST_DRIVE}/folder-counts?type=text")

        assert res.status_code == 200
        assert res.json() == [
            {"path": "", "count": 1},
            {"path": "Knowledge", "count": 2},
            {"path": "Knowledge/AI", "count": 1},
        ]

    def test_without_a_kind_counts_every_active_file(self, client):
        api, db, _, _ = client
        _file(db, "Knowledge/a.md", mime="text/markdown")
        _file(db, "Knowledge/clip.mp4", mime="video/mp4", file_type="video")

        res = api.get(f"/api/drives/{TEST_DRIVE}/folder-counts")

        assert res.json() == [{"path": "Knowledge", "count": 2}]

    def test_accepts_the_old_markdown_name_for_text(self, client):
        api, db, _, _ = client
        _file(db, "n/a.txt", mime="text/plain")

        assert api.get(f"/api/drives/{TEST_DRIVE}/folder-counts?type=markdown").json() == [
            {"path": "n", "count": 1}
        ]

    def test_unknown_drive_is_404_and_unknown_kind_is_422(self, client):
        api, _, _, _ = client
        assert api.get("/api/drives/nope/folder-counts").status_code == 404
        assert api.get(f"/api/drives/{TEST_DRIVE}/folder-counts?type=bogus").status_code == 422


class TestTagCountsByKind:
    def test_counts_only_active_files_of_the_kind_and_drops_tags_with_none(self, client):
        api, db, _, _ = client
        _file(db, "a.md", mime="text/markdown", tags=["AI", "設計"])
        _file(db, "b.md", mime="text/markdown", tags=["AI"])
        _file(db, "c.mp4", mime="video/mp4", file_type="video", tags=["AI", "動画"])
        _file(db, "d.md", mime="text/markdown", deleted=True, tags=["消えた"])

        res = api.get(f"/api/drives/{TEST_DRIVE}/tags?type=text")

        assert res.status_code == 200
        assert res.json() == [{"name": "AI", "count": 2}, {"name": "設計", "count": 1}]

    def test_without_a_kind_the_listing_is_unchanged(self, client):
        api, db, _, _ = client
        _file(db, "a.md", mime="text/markdown", tags=["AI"])
        _file(db, "c.mp4", mime="video/mp4", file_type="video", tags=["AI", "動画"])

        assert api.get(f"/api/drives/{TEST_DRIVE}/tags").json() == [
            {"name": "AI", "count": 2},
            {"name": "動画", "count": 1},
        ]
