import shutil
from pathlib import Path

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed(db, drive_dir):
    from app.models import File

    for folder_name in ["旅行", "料理"]:
        d = drive_dir / folder_name
        d.mkdir(exist_ok=True)
        shutil.copy(FIXTURES_DIR / "short_video.mp4", d / "v.mp4")
        db.add(
            File(
                filename="v.mp4",
                title="V",
                drive=TEST_DRIVE,
                folder_path=folder_name,
                file_path=f"{folder_name}/v.mp4",
                file_size=d.joinpath("v.mp4").stat().st_size,
                file_type="video",
                mime_type="video/mp4",
            )
        )
    db.commit()


def _seed_nested(db, drive_dir):
    from app.models import File

    folders = ["アクション", "アクション/SF", "アクション/コメディ"]
    for folder in folders:
        d = drive_dir / folder
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy(FIXTURES_DIR / "short_video.mp4", d / "v.mp4")
        db.add(
            File(
                filename="v.mp4",
                title=f"V in {folder}",
                drive=TEST_DRIVE,
                folder_path=folder,
                file_path=f"{folder}/v.mp4",
                file_size=d.joinpath("v.mp4").stat().st_size,
                file_type="video",
                mime_type="video/mp4",
            )
        )
    db.commit()


class TestListDrives:
    def test_drives(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/drives")
        assert res.status_code == 200
        drives = res.json()
        assert len(drives) == 1
        assert drives[0]["name"] == TEST_DRIVE

    def test_drives_includes_file_count(self, client):
        # spec 2026-05-19-root-home-enrichment §3.1: list_drives returns a
        # per-drive active file_count via a single grouped query.
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)  # 2 active files (旅行/v.mp4, 料理/v.mp4)
        res = c.get("/api/drives")
        assert res.status_code == 200
        drives = res.json()
        assert drives[0]["name"] == TEST_DRIVE
        assert drives[0]["file_count"] == 2

    def test_file_count_zero_when_empty(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/drives")
        assert res.status_code == 200
        assert res.json()[0]["file_count"] == 0

    def test_file_count_excludes_trash_and_missing(self, client):
        # spec §3.1: counts must go through active_file_filter()
        # (design-decisions.md "File state": trash/missing excluded).
        from datetime import datetime, timezone

        from app.models import File

        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)  # 2 active
        now = datetime.now(timezone.utc)
        db.add(
            File(
                filename="trashed.mp4",
                title="Trashed",
                drive=TEST_DRIVE,
                folder_path="旅行",
                file_path="旅行/trashed.mp4",
                file_size=1,
                file_type="video",
                mime_type="video/mp4",
                deleted_at=now,
            )
        )
        db.add(
            File(
                filename="gone.mp4",
                title="Gone",
                drive=TEST_DRIVE,
                folder_path="料理",
                file_path="料理/gone.mp4",
                file_size=1,
                file_type="video",
                mime_type="video/mp4",
                missing_since=now,
            )
        )
        db.commit()
        res = c.get("/api/drives")
        assert res.status_code == 200
        # Only the 2 active files count; trash + missing excluded.
        assert res.json()[0]["file_count"] == 2

    def test_invalid_drive(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get("/api/drives/nonexistent/files")
        assert res.status_code == 404


class TestFileByPath:
    def test_returns_active_file_by_exact_normalized_relative_path(self, client):
        from app.models import File

        c, db, drive_dir, _ = client
        folder = drive_dir / "Captures"
        folder.mkdir()
        (folder / "Inbox.md").write_text("# Inbox\n")
        row = File(
            filename="Inbox.md",
            title="Inbox",
            drive=TEST_DRIVE,
            folder_path="Captures",
            file_path="Captures/Inbox.md",
            file_size=8,
            file_type="document",
            mime_type="text/markdown",
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        response = c.get(
            f"/api/drives/{TEST_DRIVE}/files/by-path",
            params={"path": "Captures/Inbox.md"},
        )

        assert response.status_code == 200, response.text
        assert response.json()["id"] == row.id

    def test_returns_404_for_missing_exact_path(self, client):
        c, _, _, _ = client

        response = c.get(
            f"/api/drives/{TEST_DRIVE}/files/by-path",
            params={"path": "Captures/Inbox.md"},
        )

        assert response.status_code == 404


class TestListFolders:
    def test_root_folders(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/folders")
        assert res.status_code == 200
        folders = res.json()
        assert len(folders) == 2
        names = {f["name"] for f in folders}
        assert "旅行" in names
        assert "料理" in names
        assert all(f["file_count"] == 1 for f in folders)

    def test_nested_folders(self, client):
        c, db, drive_dir, data_dir = client
        _seed_nested(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/folders?path=アクション")
        assert res.status_code == 200
        folders = res.json()
        assert len(folders) == 2
        names = {f["name"] for f in folders}
        assert "SF" in names
        assert "コメディ" in names

    def test_empty(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/folders")
        assert res.status_code == 200
        assert res.json() == []

    def test_kind_counts_breaks_the_total_down_by_kind(self, client):
        """The folder card's breakdown, and `dominant_kind`'s own input."""
        from app.models import File

        c, db, drive_dir, data_dir = client
        d = drive_dir / "mixed"
        d.mkdir()
        rows = [
            ("a.mp4", "video", "video/mp4"),
            ("b.mp4", "video", "video/mp4"),
            ("c.mp4", "video", "video/mp4"),
            ("d.txt", "document", "text/plain"),
            ("e.png", "image", "image/png"),
        ]
        for name, ft, mt in rows:
            (d / name).write_text("x")
            db.add(
                File(
                    filename=name,
                    title=name,
                    drive=TEST_DRIVE,
                    folder_path="mixed",
                    file_path=f"mixed/{name}",
                    file_size=1,
                    file_type=ft,
                    mime_type=mt,
                )
            )
        db.commit()

        folders = c.get(f"/api/drives/{TEST_DRIVE}/folders").json()
        assert len(folders) == 1
        assert folders[0]["kind_counts"] == {"video": 3, "document": 1, "image": 1}
        # The breakdown is a partition of the total, which is what lets a
        # renderer show the largest few and leave the rest to subtraction.
        assert sum(folders[0]["kind_counts"].values()) == folders[0]["file_count"]
        assert folders[0]["dominant_kind"] == "video"

    def test_kind_counts_rolls_subfolders_up(self, client):
        """Recursive, exactly like `file_count` beside it."""
        from app.models import File

        c, db, drive_dir, data_dir = client
        d = drive_dir / "parent" / "child"
        d.mkdir(parents=True)
        (d / "clip.mp4").write_text("x")
        db.add(
            File(
                filename="clip.mp4",
                title="Clip",
                drive=TEST_DRIVE,
                folder_path="parent/child",
                file_path="parent/child/clip.mp4",
                file_size=1,
                file_type="video",
                mime_type="video/mp4",
            )
        )
        db.commit()

        folders = c.get(f"/api/drives/{TEST_DRIVE}/folders").json()
        assert len(folders) == 1
        assert folders[0]["name"] == "parent"
        assert folders[0]["kind_counts"] == {"video": 1}
        assert folders[0]["file_count"] == 1

    def test_kind_counts_uses_the_refined_kinds_not_file_type(self, client):
        """Markdown and PDF are their own kinds, not `document`.

        `_classify_kind` is the vocabulary here — the same one the type
        filter offers — so a folder of notes reports `markdown`, not the
        `document` its `file_type` column holds.
        """
        from app.models import File

        c, db, drive_dir, data_dir = client
        d = drive_dir / "notes"
        d.mkdir()
        for name, mt in (("a.md", "text/markdown"), ("b.pdf", "application/pdf")):
            (d / name).write_text("x")
            db.add(
                File(
                    filename=name,
                    title=name,
                    drive=TEST_DRIVE,
                    folder_path="notes",
                    file_path=f"notes/{name}",
                    file_size=1,
                    file_type="document",
                    mime_type=mt,
                )
            )
        db.commit()

        folders = c.get(f"/api/drives/{TEST_DRIVE}/folders").json()
        assert folders[0]["kind_counts"] == {"markdown": 1, "pdf": 1}

    def test_kind_counts_empty_for_a_folder_with_no_files(self, client):
        from app.models import EmptyFolder

        c, db, drive_dir, data_dir = client
        (drive_dir / "empty").mkdir()
        db.add(EmptyFolder(drive=TEST_DRIVE, path="empty"))
        db.commit()

        folders = c.get(f"/api/drives/{TEST_DRIVE}/folders").json()
        assert len(folders) == 1
        assert folders[0]["name"] == "empty"
        assert folders[0]["kind_counts"] == {}
        assert folders[0]["file_count"] == 0

    def test_no_thumbnail_file_id(self, client):
        """The field is gone, and so is the scan that filled it.

        Its only consumers were the folder card and the folder list row,
        which both draw a glyph now. Leaving the field would keep a
        whole-subtree scan running for something nothing reads — and the
        assertion has to be that it is *absent*, since a renderer reading
        `undefined` looks exactly like one reading `null`.
        """
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        folders = c.get(f"/api/drives/{TEST_DRIVE}/folders").json()
        assert folders, "no folders to check"
        for f in folders:
            assert "thumbnail_file_id" not in f


class TestListDriveFiles:
    def test_all_files(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files")
        assert res.status_code == 200
        assert len(res.json()["data"]) == 2

    def test_filter_by_path(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?path=旅行")
        assert res.status_code == 200
        assert len(res.json()["data"]) == 1

    def test_filter_by_path_no_match(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?path=音楽")
        assert res.status_code == 200
        assert len(res.json()["data"]) == 0

    def test_filter_by_type(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?type=video")
        assert len(res.json()["data"]) == 2

        res = c.get(f"/api/drives/{TEST_DRIVE}/files?type=image")
        assert len(res.json()["data"]) == 0

    def test_search(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?search=V")
        assert len(res.json()["data"]) == 2

        res = c.get(f"/api/drives/{TEST_DRIVE}/files?search=nonexistent")
        assert len(res.json()["data"]) == 0

    def test_search_matches_folder_path_only(self, client):
        # spec 2026-05-02-search-path-match: "旅行" は folder_path のみに含まれ
        # title "V" には含まれない。filename match SQL の WHERE が title OR
        # folder_path に拡張されたことで初めてヒットする。
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?search=旅行")
        assert res.status_code == 200
        body = res.json()["data"]
        assert len(body) == 1
        assert body[0]["folder_path"] == "旅行"
        assert body[0]["match_source"] == "path"

    def test_search_match_source_filename(self, client):
        # title "V" にヒットし folder_path には無いケース。
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?search=V")
        assert res.status_code == 200
        for item in res.json()["data"]:
            assert item["match_source"] == "filename"

    def test_search_match_source_both(self, client):
        # title と folder_path の両方にクエリ語が含まれる場合は "both"。
        from app.models import File
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        d = drive_dir / "旅行"
        (d / "kyoto.mp4").write_bytes(b"x")
        db.add(File(
            filename="kyoto.mp4",
            title="旅行のメモ",
            drive=TEST_DRIVE,
            folder_path="旅行",
            file_path="旅行/kyoto.mp4",
            file_size=1,
            file_type="video",
            mime_type="video/mp4",
        ))
        db.commit()
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?search=旅行")
        assert res.status_code == 200
        items = res.json()["data"]
        sources = {item["title"]: item["match_source"] for item in items}
        assert sources["旅行のメモ"] == "both"
        assert sources["V"] == "path"

    def test_search_no_match_source_when_unsearched(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files")
        for item in res.json()["data"]:
            assert item["match_source"] is None

    def test_search_escapes_like_special_chars(self, client):
        # "%" / "_" がリテラル扱いされ、無関係なファイルがヒットしないこと。
        from app.models import File
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        d = drive_dir / "discounts"
        d.mkdir()
        (d / "literal.mp4").write_bytes(b"x")
        db.add(File(
            filename="literal.mp4",
            title="50% off sale",
            drive=TEST_DRIVE,
            folder_path="discounts",
            file_path="discounts/literal.mp4",
            file_size=1,
            file_type="video",
            mime_type="video/mp4",
        ))
        db.commit()
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?search=50%25")  # URL-encoded %
        assert res.status_code == 200
        items = res.json()["data"]
        assert len(items) == 1
        assert items[0]["title"] == "50% off sale"

    def test_sort(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?sort=title&order=asc")
        assert res.status_code == 200

    def test_pagination(self, client):
        c, db, drive_dir, data_dir = client
        _seed(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?page=1&limit=1")
        assert res.status_code == 200
        body = res.json()
        assert body["meta"]["page"] == 1
        assert body["meta"]["limit"] == 1
        assert len(body["data"]) == 1
        assert body["meta"]["total"] == 2


def _seed_subtree(db, drive_dir, folders):
    """Seed one video per folder_path in `folders` (including "" for root)."""
    from app.models import File

    for folder in folders:
        d = drive_dir / folder if folder else drive_dir
        d.mkdir(parents=True, exist_ok=True)
        shutil.copy(FIXTURES_DIR / "short_video.mp4", d / "v.mp4")
        db.add(
            File(
                filename="v.mp4",
                title=f"V in {folder or '<root>'}",
                drive=TEST_DRIVE,
                folder_path=folder,
                file_path=f"{folder}/v.mp4" if folder else "v.mp4",
                file_size=d.joinpath("v.mp4").stat().st_size,
                file_type="video",
                mime_type="video/mp4",
            )
        )
    db.commit()


class TestListDriveFilesRecursive:
    """spec 2026-08-21-folder-scoped-tag-filter §3.

    `recursive=True` widens `path` from an exact folder match to a subtree
    match. The default stays False so every existing caller is unchanged.
    """

    def test_recursive_matches_folder_and_descendants(self, client):
        c, db, drive_dir, data_dir = client
        _seed_subtree(db, drive_dir, ["recipes", "recipes/soup", "recipes/soup/miso", "dev"])
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?path=recipes&recursive=true")
        assert res.status_code == 200
        body = res.json()
        paths = {item["folder_path"] for item in body["data"]}
        assert paths == {"recipes", "recipes/soup", "recipes/soup/miso"}
        assert body["meta"]["total"] == 3

    def test_default_is_direct_children_only(self, client):
        c, db, drive_dir, data_dir = client
        _seed_subtree(db, drive_dir, ["recipes", "recipes/soup", "dev"])
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?path=recipes")
        assert res.status_code == 200
        body = res.json()
        assert {item["folder_path"] for item in body["data"]} == {"recipes"}
        assert body["meta"]["total"] == 1

    def test_recursive_false_is_direct_children_only(self, client):
        c, db, drive_dir, data_dir = client
        _seed_subtree(db, drive_dir, ["recipes", "recipes/soup"])
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?path=recipes&recursive=false")
        assert res.status_code == 200
        assert {item["folder_path"] for item in res.json()["data"]} == {"recipes"}

    def test_empty_path_non_recursive_returns_root_level_only(self, client):
        # spec §3.1: RootFileListing.tsx and ImageGallery.tsx both send
        # path="" with recursive=False and must keep meaning "root level".
        c, db, drive_dir, data_dir = client
        _seed_subtree(db, drive_dir, ["", "recipes", "recipes/soup"])
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?path=")
        assert res.status_code == 200
        body = res.json()
        assert {item["folder_path"] for item in body["data"]} == {""}
        assert body["meta"]["total"] == 1

    def test_empty_path_recursive_returns_whole_drive(self, client):
        # spec §3.1: an empty prefix with recursive applies no folder
        # predicate — a recursive search from the root is the whole drive.
        c, db, drive_dir, data_dir = client
        _seed_subtree(db, drive_dir, ["", "recipes", "recipes/soup"])
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?path=&recursive=true")
        assert res.status_code == 200
        assert res.json()["meta"]["total"] == 3

    def test_recursive_escapes_like_underscore(self, client):
        # "my_docs" must not match "myXdocs" via an unescaped LIKE wildcard.
        c, db, drive_dir, data_dir = client
        _seed_subtree(db, drive_dir, ["my_docs", "my_docs/sub", "myXdocs", "myXdocs/sub"])
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?path=my_docs&recursive=true")
        assert res.status_code == 200
        body = res.json()
        assert {item["folder_path"] for item in body["data"]} == {"my_docs", "my_docs/sub"}
        assert body["meta"]["total"] == 2

    def test_recursive_escapes_like_percent(self, client):
        c, db, drive_dir, data_dir = client
        _seed_subtree(db, drive_dir, ["100%", "100%/sub", "100off", "100off/sub"])
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?path=100%25&recursive=true")
        assert res.status_code == 200
        body = res.json()
        assert {item["folder_path"] for item in body["data"]} == {"100%", "100%/sub"}

    def test_recursive_prefix_boundary_not_confused(self, client):
        # "rec" must not swallow "recipes" — the separator is part of the match.
        c, db, drive_dir, data_dir = client
        _seed_subtree(db, drive_dir, ["rec", "recipes"])
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?path=rec&recursive=true")
        assert res.status_code == 200
        assert {item["folder_path"] for item in res.json()["data"]} == {"rec"}

    def test_recursive_rejects_traversal(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?path=recipes/../dev&recursive=true")
        assert res.status_code == 400

    def test_recursive_rejects_leading_slash(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?path=/recipes&recursive=true")
        assert res.status_code == 400

    def test_recursive_with_tag_scopes_to_subtree(self, client):
        """The headline combination this spec exists for.

        The subtree and the tag must *both* narrow. The fixture therefore
        puts untagged and differently-tagged files inside the subtree as
        well as a tagged file outside it — otherwise an implementation
        that dropped either predicate would still pass.
        """
        from app.models import File, Tag

        c, db, drive_dir, data_dir = client
        _seed_subtree(db, drive_dir, ["recipes", "recipes/nested", "dev"])

        wanted = Tag(name="soup", drive=TEST_DRIVE)
        other = Tag(name="stew", drive=TEST_DRIVE)
        db.add_all([wanted, other])
        db.commit()

        # One extra file per folder so each can carry a different tag state.
        extras = {}
        for folder in ["recipes", "recipes/nested"]:
            d = drive_dir / folder
            (d / "extra.mp4").write_bytes(b"x")
            f = File(
                filename="extra.mp4",
                title=f"Extra in {folder}",
                drive=TEST_DRIVE,
                folder_path=folder,
                file_path=f"{folder}/extra.mp4",
                file_size=1,
                file_type="video",
                mime_type="video/mp4",
            )
            db.add(f)
            extras[folder] = f
        db.commit()

        by_folder = {
            f.folder_path: f
            for f in db.query(File)
            .filter(File.drive == TEST_DRIVE, File.filename == "v.mp4")
            .all()
        }
        by_folder["recipes"].tags.append(wanted)         # in subtree, wanted
        by_folder["recipes/nested"].tags.append(wanted)  # in subtree, wanted
        by_folder["dev"].tags.append(wanted)             # tagged but OUTSIDE
        extras["recipes"].tags.append(other)             # in subtree, other tag
        # extras["recipes/nested"] stays untagged, in subtree
        db.commit()

        res = c.get(f"/api/drives/{TEST_DRIVE}/files?path=recipes&recursive=true&tag=soup")
        assert res.status_code == 200
        body = res.json()
        assert {item["title"] for item in body["data"]} == {
            "V in recipes",
            "V in recipes/nested",
        }
        assert body["meta"]["total"] == 2

    def test_recursive_tag_predicate_is_not_ignored(self, client):
        """Guard: with recursive=true, dropping the tag filter must matter.

        Without this, `test_recursive_with_tag_scopes_to_subtree` alone
        cannot tell a working tag predicate from an ignored one.
        """
        from app.models import File, Tag

        c, db, drive_dir, data_dir = client
        _seed_subtree(db, drive_dir, ["recipes", "recipes/nested"])
        tag = Tag(name="soup", drive=TEST_DRIVE)
        db.add(tag)
        db.commit()
        only = (
            db.query(File)
            .filter(File.drive == TEST_DRIVE, File.folder_path == "recipes/nested")
            .one()
        )
        only.tags.append(tag)
        db.commit()

        untagged = c.get(f"/api/drives/{TEST_DRIVE}/files?path=recipes&recursive=true")
        tagged = c.get(f"/api/drives/{TEST_DRIVE}/files?path=recipes&recursive=true&tag=soup")
        assert untagged.json()["meta"]["total"] == 2
        assert tagged.json()["meta"]["total"] == 1
        assert tagged.json()["data"][0]["folder_path"] == "recipes/nested"
