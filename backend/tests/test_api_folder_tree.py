"""Tests for GET /api/drives/{drive}/folder-tree endpoint and FolderResponse.dominant_kind.

Spec: docs/superpowers/specs/2026-05-08-vault-core-merger-design-handoff.md
- Topic 9: dominant_kind for layered viewMode fallback
- Topic 10: GET /api/drives/{drive}/folder-tree endpoint for left tree pane
"""

import shutil
from pathlib import Path

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _add_file(db, drive_dir, *, folder_path: str, filename: str, file_type: str, mime_type: str):
    from app.models import File

    if folder_path:
        d = drive_dir / folder_path
        d.mkdir(parents=True, exist_ok=True)
    else:
        d = drive_dir

    rel = f"{folder_path}/{filename}" if folder_path else filename

    if file_type == "video":
        shutil.copy(FIXTURES_DIR / "short_video.mp4", d / filename)
        size = (d / filename).stat().st_size
    else:
        (d / filename).write_text("x")
        size = 1

    f = File(
        filename=filename,
        title=Path(filename).stem,
        drive=TEST_DRIVE,
        folder_path=folder_path,
        file_path=rel,
        file_size=size,
        file_type=file_type,
        mime_type=mime_type,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


class TestFolderTree:
    def test_empty_drive(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree")
        assert res.status_code == 200
        assert res.json() == []

    def test_invalid_drive(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/drives/nonexistent/folder-tree")
        assert res.status_code == 404

    def test_root_returns_top_level_folders_and_files(self, client):
        c, db, drive_dir, data_dir = client
        _add_file(db, drive_dir, folder_path="travel", filename="trip.mp4", file_type="video", mime_type="video/mp4")
        _add_file(db, drive_dir, folder_path="", filename="readme.md", file_type="document", mime_type="text/markdown")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree")
        assert res.status_code == 200
        nodes = res.json()
        assert len(nodes) == 2

        by_name = {n["name"]: n for n in nodes}
        assert "travel" in by_name
        assert by_name["travel"]["kind"] == "folder"
        assert by_name["travel"]["path"] == "travel"
        assert by_name["travel"]["file_count"] == 1

        assert "readme.md" in by_name
        assert by_name["readme.md"]["kind"] == "file"
        assert by_name["readme.md"]["path"] == "readme.md"
        assert by_name["readme.md"]["file_id"] is not None
        assert by_name["readme.md"]["mime_type"] == "text/markdown"

    def test_folders_sorted_before_files(self, client):
        c, db, drive_dir, data_dir = client
        _add_file(db, drive_dir, folder_path="zfolder", filename="v.mp4", file_type="video", mime_type="video/mp4")
        _add_file(db, drive_dir, folder_path="", filename="a_root.md", file_type="document", mime_type="text/markdown")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree")
        nodes = res.json()
        assert len(nodes) == 2
        # Folders first regardless of name
        assert nodes[0]["kind"] == "folder"
        assert nodes[1]["kind"] == "file"

    def test_root_param_returns_subfolder_contents(self, client):
        c, db, drive_dir, data_dir = client
        _add_file(db, drive_dir, folder_path="parent/child", filename="v.mp4", file_type="video", mime_type="video/mp4")
        _add_file(db, drive_dir, folder_path="parent", filename="note.md", file_type="document", mime_type="text/markdown")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree?root=parent")
        assert res.status_code == 200
        nodes = res.json()
        assert len(nodes) == 2
        by_name = {n["name"]: n for n in nodes}
        assert by_name["child"]["kind"] == "folder"
        assert by_name["note.md"]["kind"] == "file"

    def test_type_filter_markdown_excludes_other_files(self, client):
        c, db, drive_dir, data_dir = client
        _add_file(db, drive_dir, folder_path="", filename="note.md", file_type="document", mime_type="text/markdown")
        _add_file(db, drive_dir, folder_path="", filename="movie.mp4", file_type="video", mime_type="video/mp4")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree?type_filter=markdown")
        nodes = res.json()
        names = {n["name"] for n in nodes}
        assert "note.md" in names
        assert "movie.mp4" not in names

    def test_type_filter_video_excludes_markdown(self, client):
        c, db, drive_dir, data_dir = client
        _add_file(db, drive_dir, folder_path="", filename="note.md", file_type="document", mime_type="text/markdown")
        _add_file(db, drive_dir, folder_path="", filename="movie.mp4", file_type="video", mime_type="video/mp4")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree?type_filter=video")
        nodes = res.json()
        names = {n["name"] for n in nodes}
        assert "movie.mp4" in names
        assert "note.md" not in names

    def test_type_filter_pdf(self, client):
        c, db, drive_dir, data_dir = client
        _add_file(db, drive_dir, folder_path="", filename="doc.pdf", file_type="document", mime_type="application/pdf")
        _add_file(db, drive_dir, folder_path="", filename="movie.mp4", file_type="video", mime_type="video/mp4")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree?type_filter=pdf")
        names = {n["name"] for n in res.json()}
        assert "doc.pdf" in names
        assert "movie.mp4" not in names

    def test_type_filter_image(self, client):
        c, db, drive_dir, data_dir = client
        _add_file(db, drive_dir, folder_path="", filename="pic.jpg", file_type="image", mime_type="image/jpeg")
        _add_file(db, drive_dir, folder_path="", filename="note.md", file_type="document", mime_type="text/markdown")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree?type_filter=image")
        names = {n["name"] for n in res.json()}
        assert "pic.jpg" in names
        assert "note.md" not in names

    def test_type_filter_does_not_hide_folders(self, client):
        """Folders must remain visible even when their direct files don't match filter."""
        c, db, drive_dir, data_dir = client
        _add_file(db, drive_dir, folder_path="onlyvideos", filename="v.mp4", file_type="video", mime_type="video/mp4")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree?type_filter=markdown")
        nodes = res.json()
        # Folder is still listed even though it has no markdown files
        names = {n["name"] for n in nodes if n["kind"] == "folder"}
        assert "onlyvideos" in names
        # But file_count reflects matching count under filter
        folder = next(n for n in nodes if n["name"] == "onlyvideos")
        assert folder["file_count"] == 0

    def test_folder_file_count_is_recursive(self, client):
        c, db, drive_dir, data_dir = client
        _add_file(db, drive_dir, folder_path="parent", filename="a.md", file_type="document", mime_type="text/markdown")
        _add_file(db, drive_dir, folder_path="parent/child", filename="b.md", file_type="document", mime_type="text/markdown")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree")
        nodes = res.json()
        parent = next(n for n in nodes if n["name"] == "parent" and n["kind"] == "folder")
        assert parent["file_count"] == 2  # recursive

    def test_folder_has_children_flag(self, client):
        c, db, drive_dir, data_dir = client
        _add_file(db, drive_dir, folder_path="parent", filename="a.md", file_type="document", mime_type="text/markdown")
        _add_file(db, drive_dir, folder_path="parent/child", filename="b.md", file_type="document", mime_type="text/markdown")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree?root=parent")
        nodes = res.json()
        # `child` is a sub-folder under parent
        child_folder = next((n for n in nodes if n["name"] == "child"), None)
        assert child_folder is not None
        # has_children should be True for child since it has b.md inside
        assert child_folder["has_children"] is True

    def test_folder_has_children_false_when_empty(self, client):
        c, db, drive_dir, data_dir = client
        # Create a folder via EmptyFolder marker
        from app.models import EmptyFolder
        db.add(EmptyFolder(drive=TEST_DRIVE, path="empty"))
        db.commit()

        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree")
        nodes = res.json()
        empty_folder = next((n for n in nodes if n["name"] == "empty"), None)
        assert empty_folder is not None
        assert empty_folder["has_children"] is False
        assert empty_folder["file_count"] == 0

    def test_invalid_type_filter_rejected(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree?type_filter=bogus")
        assert res.status_code == 422

    def test_path_traversal_rejected(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree?root=../etc")
        assert res.status_code == 400

    def test_excludes_trash_files(self, client):
        from datetime import datetime, timezone
        c, db, drive_dir, data_dir = client
        f = _add_file(db, drive_dir, folder_path="", filename="trashed.md", file_type="document", mime_type="text/markdown")
        f.deleted_at = datetime.now(timezone.utc)
        db.commit()

        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree")
        names = {n["name"] for n in res.json()}
        assert "trashed.md" not in names

    def test_excludes_missing_files(self, client):
        from datetime import datetime, timezone
        c, db, drive_dir, data_dir = client
        f = _add_file(db, drive_dir, folder_path="", filename="gone.md", file_type="document", mime_type="text/markdown")
        f.missing_since = datetime.now(timezone.utc)
        db.commit()

        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree")
        names = {n["name"] for n in res.json()}
        assert "gone.md" not in names


class TestFolderTreeFlat:
    """Spec 2026-05-09 tree filter: ``flat=true`` returns the entire tree."""

    def test_flat_returns_all_folders_and_files(self, client):
        c, db, drive_dir, data_dir = client
        _add_file(db, drive_dir, folder_path="", filename="root.md", file_type="document", mime_type="text/markdown")
        _add_file(db, drive_dir, folder_path="docs", filename="a.md", file_type="document", mime_type="text/markdown")
        _add_file(db, drive_dir, folder_path="docs/specs", filename="spec1.md", file_type="document", mime_type="text/markdown")
        _add_file(db, drive_dir, folder_path="media", filename="v.mp4", file_type="video", mime_type="video/mp4")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree?flat=true")
        assert res.status_code == 200
        nodes = res.json()
        # Folders + files all returned regardless of depth.
        names = {n["name"] for n in nodes}
        assert "root.md" in names
        assert "a.md" in names
        assert "spec1.md" in names
        assert "v.mp4" in names
        # Folder entries for every ancestor.
        folder_paths = {n["path"] for n in nodes if n["kind"] == "folder"}
        assert "docs" in folder_paths
        assert "docs/specs" in folder_paths
        assert "media" in folder_paths

    def test_flat_excludes_trash_and_missing(self, client):
        from datetime import datetime, timezone
        c, db, drive_dir, data_dir = client
        keep = _add_file(db, drive_dir, folder_path="", filename="ok.md", file_type="document", mime_type="text/markdown")
        trashed = _add_file(db, drive_dir, folder_path="", filename="trashed.md", file_type="document", mime_type="text/markdown")
        gone = _add_file(db, drive_dir, folder_path="", filename="gone.md", file_type="document", mime_type="text/markdown")
        trashed.deleted_at = datetime.now(timezone.utc)
        gone.missing_since = datetime.now(timezone.utc)
        db.commit()

        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree?flat=true")
        names = {n["name"] for n in res.json()}
        assert "ok.md" in names
        assert "trashed.md" not in names
        assert "gone.md" not in names

    def test_flat_respects_type_filter_for_files(self, client):
        c, db, drive_dir, data_dir = client
        _add_file(db, drive_dir, folder_path="docs", filename="a.md", file_type="document", mime_type="text/markdown")
        _add_file(db, drive_dir, folder_path="docs", filename="movie.mp4", file_type="video", mime_type="video/mp4")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folder-tree?flat=true&type_filter=markdown")
        names = {(n["kind"], n["name"]) for n in res.json()}
        assert ("file", "a.md") in names
        assert ("file", "movie.mp4") not in names
        # Folder still listed (filter does not hide folders).
        assert ("folder", "docs") in names

    def test_flat_invalid_drive(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/drives/nonexistent/folder-tree?flat=true")
        assert res.status_code == 404


class TestFolderResponseDominantKind:
    """Topic 9: dominant_kind on FolderResponse for layered viewMode fallback."""

    def test_dominant_kind_markdown(self, client):
        c, db, drive_dir, data_dir = client
        _add_file(db, drive_dir, folder_path="notes", filename="a.md", file_type="document", mime_type="text/markdown")
        _add_file(db, drive_dir, folder_path="notes", filename="b.md", file_type="document", mime_type="text/markdown")
        _add_file(db, drive_dir, folder_path="notes", filename="x.mp4", file_type="video", mime_type="video/mp4")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folders")
        folders = res.json()
        assert len(folders) == 1
        assert folders[0]["dominant_kind"] == "markdown"

    def test_dominant_kind_video(self, client):
        c, db, drive_dir, data_dir = client
        _add_file(db, drive_dir, folder_path="movies", filename="a.mp4", file_type="video", mime_type="video/mp4")
        _add_file(db, drive_dir, folder_path="movies", filename="b.mp4", file_type="video", mime_type="video/mp4")
        _add_file(db, drive_dir, folder_path="movies", filename="readme.md", file_type="document", mime_type="text/markdown")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folders")
        folders = res.json()
        assert folders[0]["dominant_kind"] == "video"

    def test_dominant_kind_image(self, client):
        c, db, drive_dir, data_dir = client
        _add_file(db, drive_dir, folder_path="pics", filename="a.jpg", file_type="image", mime_type="image/jpeg")
        _add_file(db, drive_dir, folder_path="pics", filename="b.jpg", file_type="image", mime_type="image/jpeg")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folders")
        folders = res.json()
        assert folders[0]["dominant_kind"] == "image"

    def test_dominant_kind_pdf(self, client):
        c, db, drive_dir, data_dir = client
        _add_file(db, drive_dir, folder_path="docs", filename="a.pdf", file_type="document", mime_type="application/pdf")
        _add_file(db, drive_dir, folder_path="docs", filename="b.pdf", file_type="document", mime_type="application/pdf")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folders")
        folders = res.json()
        assert folders[0]["dominant_kind"] == "pdf"

    def test_dominant_kind_null_for_empty_folder(self, client):
        c, db, drive_dir, data_dir = client
        from app.models import EmptyFolder
        db.add(EmptyFolder(drive=TEST_DRIVE, path="empty"))
        db.commit()

        res = c.get(f"/api/drives/{TEST_DRIVE}/folders")
        folders = res.json()
        assert len(folders) == 1
        assert folders[0]["dominant_kind"] is None

    def test_dominant_kind_recursive(self, client):
        """Recursive: folder with markdown-heavy descendants reports markdown."""
        c, db, drive_dir, data_dir = client
        _add_file(db, drive_dir, folder_path="parent/sub1", filename="a.md", file_type="document", mime_type="text/markdown")
        _add_file(db, drive_dir, folder_path="parent/sub2", filename="b.md", file_type="document", mime_type="text/markdown")
        _add_file(db, drive_dir, folder_path="parent", filename="x.mp4", file_type="video", mime_type="video/mp4")

        res = c.get(f"/api/drives/{TEST_DRIVE}/folders")
        folders = res.json()
        # Root view: only "parent" appears as a top-level folder
        parent = next(f for f in folders if f["name"] == "parent")
        # 2 markdown vs 1 video → markdown wins recursively
        assert parent["dominant_kind"] == "markdown"
