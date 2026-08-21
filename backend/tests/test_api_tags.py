import shutil
from pathlib import Path

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _seed_file(db, drive_dir, suffix="", folder_path="旅行"):
    folder = drive_dir / folder_path
    folder.mkdir(parents=True, exist_ok=True)
    fname = f"test{suffix}.mp4"
    shutil.copy(FIXTURES_DIR / "long_video.mp4", folder / fname)

    from app.models import File

    file = File(
        filename=fname,
        title=f"Test Video{suffix}",
        drive=TEST_DRIVE,
        folder_path=folder_path,
        file_path=f"{folder_path}/{fname}",
        file_size=folder.joinpath(fname).stat().st_size,
        file_type="video",
        mime_type="video/mp4",
        duration=10.0,
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


class TestListTags:
    def test_empty(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/tags")
        assert res.status_code == 200
        assert res.json() == []

    def test_with_tags(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        c.put(f"/api/files/{file.id}/tags", json={"tags": ["night", "tokyo"]})
        res = c.get(f"/api/drives/{TEST_DRIVE}/tags")
        assert res.status_code == 200
        tags = res.json()
        assert len(tags) == 2
        names = [t["name"] for t in tags]
        assert "night" in names
        assert "tokyo" in names

    def test_tag_count(self, client):
        c, db, drive_dir, data_dir = client
        f1 = _seed_file(db, drive_dir, "1")
        f2 = _seed_file(db, drive_dir, "2")
        c.put(f"/api/files/{f1.id}/tags", json={"tags": ["night"]})
        c.put(f"/api/files/{f2.id}/tags", json={"tags": ["night", "tokyo"]})
        res = c.get(f"/api/drives/{TEST_DRIVE}/tags")
        tags = {t["name"]: t["count"] for t in res.json()}
        assert tags["night"] == 2
        assert tags["tokyo"] == 1


class TestListTagsFolderScope:
    def test_folder_path_rejects_traversal(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/tags?folder_path=../etc")
        assert res.status_code == 400

    def test_folder_path_rejects_leading_slash(self, client):
        c, db, drive_dir, data_dir = client
        res = c.get(f"/api/drives/{TEST_DRIVE}/tags?folder_path=/etc")
        assert res.status_code == 400

    def test_folder_path_not_specified_returns_all(self, client):
        c, db, drive_dir, data_dir = client
        f1 = _seed_file(db, drive_dir, "1", folder_path="recipes")
        f2 = _seed_file(db, drive_dir, "2", folder_path="dev")
        c.put(f"/api/files/{f1.id}/tags", json={"tags": ["炒め物"]})
        c.put(f"/api/files/{f2.id}/tags", json={"tags": ["Flutter"]})
        res = c.get(f"/api/drives/{TEST_DRIVE}/tags")
        names = [t["name"] for t in res.json()]
        assert "炒め物" in names
        assert "Flutter" in names

    def test_folder_path_filters_to_subtree(self, client):
        c, db, drive_dir, data_dir = client
        f1 = _seed_file(db, drive_dir, "1", folder_path="recipes")
        f2 = _seed_file(db, drive_dir, "2", folder_path="dev")
        c.put(f"/api/files/{f1.id}/tags", json={"tags": ["炒め物"]})
        c.put(f"/api/files/{f2.id}/tags", json={"tags": ["Flutter"]})
        res = c.get(f"/api/drives/{TEST_DRIVE}/tags?folder_path=recipes")
        names = [t["name"] for t in res.json()]
        assert "炒め物" in names
        assert "Flutter" not in names

    def test_folder_path_includes_nested_subfolder(self, client):
        c, db, drive_dir, data_dir = client
        f1 = _seed_file(db, drive_dir, "1", folder_path="recipes/soup")
        c.put(f"/api/files/{f1.id}/tags", json={"tags": ["煮物"]})
        res = c.get(f"/api/drives/{TEST_DRIVE}/tags?folder_path=recipes")
        names = [t["name"] for t in res.json()]
        assert "煮物" in names

    def test_folder_path_prefix_boundary_not_confused(self, client):
        c, db, drive_dir, data_dir = client
        f1 = _seed_file(db, drive_dir, "1", folder_path="recipes2")
        c.put(f"/api/files/{f1.id}/tags", json={"tags": ["別物"]})
        res = c.get(f"/api/drives/{TEST_DRIVE}/tags?folder_path=recipes")
        names = [t["name"] for t in res.json()]
        assert "別物" not in names

    def test_folder_path_underscore_not_treated_as_wildcard(self, client):
        c, db, drive_dir, data_dir = client
        f1 = _seed_file(db, drive_dir, "1", folder_path="2024_photos")
        f2 = _seed_file(db, drive_dir, "2", folder_path="2024Xphotos")
        c.put(f"/api/files/{f1.id}/tags", json={"tags": ["target"]})
        c.put(f"/api/files/{f2.id}/tags", json={"tags": ["decoy"]})
        res = c.get(f"/api/drives/{TEST_DRIVE}/tags?folder_path=2024_photos")
        names = [t["name"] for t in res.json()]
        assert "target" in names
        assert "decoy" not in names

    def test_folder_path_keeps_unused_tags(self, client):
        c, db, drive_dir, data_dir = client
        from app.models import Tag

        db.add(Tag(name="unused", drive=TEST_DRIVE))
        db.commit()
        res = c.get(f"/api/drives/{TEST_DRIVE}/tags?folder_path=recipes")
        names = [t["name"] for t in res.json()]
        assert "unused" in names


class TestUpdateFileTags:
    def test_set_tags(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.put(f"/api/files/{file.id}/tags", json={"tags": ["night", "tokyo"]})
        assert res.status_code == 200
        assert sorted(res.json()["tags"]) == ["night", "tokyo"]

    def test_replace_tags(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        c.put(f"/api/files/{file.id}/tags", json={"tags": ["night"]})
        res = c.put(f"/api/files/{file.id}/tags", json={"tags": ["tokyo"]})
        assert res.json()["tags"] == ["tokyo"]

    def test_clear_tags(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        c.put(f"/api/files/{file.id}/tags", json={"tags": ["night"]})
        res = c.put(f"/api/files/{file.id}/tags", json={"tags": []})
        assert res.json()["tags"] == []

    def test_case_preserved(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.put(f"/api/files/{file.id}/tags", json={"tags": ["Tokyo", "iPhone"]})
        assert sorted(res.json()["tags"]) == ["Tokyo", "iPhone"]

    def test_case_insensitive_dedup(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.put(
            f"/api/files/{file.id}/tags", json={"tags": ["Tokyo", "tokyo", "TOKYO"]}
        )
        assert res.json()["tags"] == ["Tokyo"]

    def test_duplicate_tags(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.put(f"/api/files/{file.id}/tags", json={"tags": ["night", "night"]})
        assert res.json()["tags"] == ["night"]

    def test_too_many_tags(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        tags = [f"tag{i}" for i in range(11)]
        res = c.put(f"/api/files/{file.id}/tags", json={"tags": tags})
        assert res.status_code == 422

    def test_tag_too_long(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.put(f"/api/files/{file.id}/tags", json={"tags": ["a" * 31]})
        assert res.status_code == 422

    def test_unicode_tags(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.put(
            f"/api/files/{file.id}/tags", json={"tags": ["旅行", "カフェ", "風景"]}
        )
        assert res.status_code == 200
        assert sorted(res.json()["tags"]) == ["カフェ", "旅行", "風景"]

    def test_invalid_characters(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        res = c.put(f"/api/files/{file.id}/tags", json={"tags": ["hello world"]})
        assert res.status_code == 422

    def test_not_found(self, client):
        c, db, drive_dir, data_dir = client
        res = c.put("/api/files/zzNOTFOUNDzz/tags", json={"tags": ["night"]})
        assert res.status_code == 404


class TestOrphanTagCleanup:
    def test_orphan_deleted(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        c.put(f"/api/files/{file.id}/tags", json={"tags": ["night", "tokyo"]})
        c.put(f"/api/files/{file.id}/tags", json={"tags": ["tokyo"]})
        tags = c.get(f"/api/drives/{TEST_DRIVE}/tags").json()
        names = [t["name"] for t in tags]
        assert "night" not in names
        assert "tokyo" in names

    def test_shared_tag_not_deleted(self, client):
        c, db, drive_dir, data_dir = client
        f1 = _seed_file(db, drive_dir, "1")
        f2 = _seed_file(db, drive_dir, "2")
        c.put(f"/api/files/{f1.id}/tags", json={"tags": ["night"]})
        c.put(f"/api/files/{f2.id}/tags", json={"tags": ["night"]})
        c.put(f"/api/files/{f1.id}/tags", json={"tags": []})
        tags = c.get(f"/api/drives/{TEST_DRIVE}/tags").json()
        names = [t["name"] for t in tags]
        assert "night" in names


class TestTagFilter:
    def test_filter_by_tag(self, client):
        c, db, drive_dir, data_dir = client
        f1 = _seed_file(db, drive_dir, "1")
        f2 = _seed_file(db, drive_dir, "2")
        c.put(f"/api/files/{f1.id}/tags", json={"tags": ["night"]})
        c.put(f"/api/files/{f2.id}/tags", json={"tags": ["tokyo"]})
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?tag=night")
        assert len(res.json()["data"]) == 1
        assert res.json()["data"][0]["id"] == f1.id

    def test_filter_no_match(self, client):
        c, db, drive_dir, data_dir = client
        _seed_file(db, drive_dir)
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?tag=nonexistent")
        assert len(res.json()["data"]) == 0

    def test_response_includes_tags(self, client):
        c, db, drive_dir, data_dir = client
        file = _seed_file(db, drive_dir)
        c.put(f"/api/files/{file.id}/tags", json={"tags": ["night"]})
        res = c.get(f"/api/drives/{TEST_DRIVE}/files")
        assert "tags" in res.json()["data"][0]
        assert res.json()["data"][0]["tags"] == ["night"]


class TestFolderScopedTagCountAgreement:
    """spec 2026-08-21-folder-scoped-tag-filter §11 — the headline invariant.

    For the same folder and the same tag, the count shown in the sidebar
    (`list_drive_tags?folder_path=`) and the number of results in the
    listing (`list_drive_files?path=&recursive=true&tag=`) must agree.
    That equality is exactly what was broken: the sidebar narrowed its list
    to the folder while a click filtered the whole drive.

    Fixture note: `list_drive_files` matches tags case-insensitively
    (`func.lower(Tag.name) == tag.lower()`) while `list_drive_tags` groups
    by `Tag.id`, so two tags differing only in case would make the sidebar
    count smaller — pre-existing, and not this change's regression. Use a
    single-case tag here.
    """

    def _seed_tagged(self, db, drive_dir):
        """Seed a subtree where the tag predicate genuinely narrows.

        Every folder in the subtree also holds an untagged file and a
        differently-tagged one, so an implementation that ignored `tag`
        under `recursive=true` would return more rows than the sidebar
        count and break the agreement these tests assert.
        """
        from app.models import Tag

        # (folder_path, tag name or None), one file each.
        layout = [
            ("recipes", "soup"),
            ("recipes", "stew"),           # same folder, different tag
            ("recipes", None),             # same folder, untagged
            ("recipes/winter", "soup"),
            ("recipes/winter", None),      # descendant, untagged
            ("recipes/winter/2026", "soup"),
            ("dev", "soup"),               # tagged, outside the subtree
            ("", "soup"),                  # tagged, drive root level
        ]
        tags = {
            name: Tag(name=name, drive=TEST_DRIVE) for name in ("soup", "stew")
        }
        db.add_all(tags.values())
        db.commit()
        for i, (folder, tag_name) in enumerate(layout):
            f = _seed_file(db, drive_dir, suffix=f"-{i}", folder_path=folder or ".")
            f.folder_path = folder
            f.file_path = f"{folder}/{f.filename}" if folder else f.filename
            if tag_name:
                f.tags.append(tags[tag_name])
        db.commit()

    def test_sidebar_count_matches_listing_total_in_a_folder(self, client):
        c, db, drive_dir, data_dir = client
        self._seed_tagged(db, drive_dir)

        tags = c.get(f"/api/drives/{TEST_DRIVE}/tags?folder_path=recipes").json()
        sidebar_count = next(t["count"] for t in tags if t["name"] == "soup")

        listing = c.get(
            f"/api/drives/{TEST_DRIVE}/files?path=recipes&recursive=true&tag=soup"
        ).json()

        assert sidebar_count == listing["meta"]["total"] == 3

    def test_sidebar_count_matches_listing_total_at_the_drive_root(self, client):
        # No folder_path / no path: both sides describe the whole drive.
        c, db, drive_dir, data_dir = client
        self._seed_tagged(db, drive_dir)

        tags = c.get(f"/api/drives/{TEST_DRIVE}/tags").json()
        sidebar_count = next(t["count"] for t in tags if t["name"] == "soup")

        listing = c.get(f"/api/drives/{TEST_DRIVE}/files?tag=soup").json()

        assert sidebar_count == listing["meta"]["total"] == 5

    def test_agreement_holds_for_a_leaf_folder(self, client):
        c, db, drive_dir, data_dir = client
        self._seed_tagged(db, drive_dir)

        tags = c.get(
            f"/api/drives/{TEST_DRIVE}/tags?folder_path=recipes/winter"
        ).json()
        sidebar_count = next(t["count"] for t in tags if t["name"] == "soup")

        listing = c.get(
            f"/api/drives/{TEST_DRIVE}/files?path=recipes/winter&recursive=true&tag=soup"
        ).json()

        assert sidebar_count == listing["meta"]["total"] == 2

    def test_the_tag_predicate_is_load_bearing_in_these_fixtures(self, client):
        """Without this, the agreement tests above could pass on a
        recursive query that ignored `tag` entirely."""
        c, db, drive_dir, data_dir = client
        self._seed_tagged(db, drive_dir)

        untagged = c.get(
            f"/api/drives/{TEST_DRIVE}/files?path=recipes&recursive=true"
        ).json()
        assert untagged["meta"]["total"] == 6  # 3 tagged soup + stew + 2 untagged

        other = c.get(
            f"/api/drives/{TEST_DRIVE}/files?path=recipes&recursive=true&tag=stew"
        ).json()
        assert other["meta"]["total"] == 1

    def test_agreement_holds_for_a_second_tag(self, client):
        c, db, drive_dir, data_dir = client
        self._seed_tagged(db, drive_dir)

        tags = c.get(f"/api/drives/{TEST_DRIVE}/tags?folder_path=recipes").json()
        sidebar_count = next(t["count"] for t in tags if t["name"] == "stew")

        listing = c.get(
            f"/api/drives/{TEST_DRIVE}/files?path=recipes&recursive=true&tag=stew"
        ).json()

        assert sidebar_count == listing["meta"]["total"] == 1
