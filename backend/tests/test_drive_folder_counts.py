"""`/api/drives/{drive}/folder-counts` and the kind filter on `GET .../tags`."""
from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.models import Collection, CollectionItem, File, Tag
from tests.conftest import TEST_DRIVE


def _file(
    db,
    path: str,
    *,
    mime: str,
    file_type: str = "document",
    deleted: bool = False,
    missing: bool = False,
    tags=(),
    size: int = 1,
    duration: float | None = None,
    favorite: bool = False,
    liked: bool = False,
    trust: str = "verified",
    reviewed: bool = True,
    origin: str | None = None,
):
    *folders, filename = path.split("/")
    row = File(
        filename=filename,
        title=filename,
        drive=TEST_DRIVE,
        folder_path="/".join(folders),
        file_path=path,
        file_size=size,
        file_type=file_type,
        mime_type=mime,
        duration=duration,
        is_favorite=favorite,
        liked_at=datetime.now(UTC).replace(tzinfo=None) if liked else None,
        trust_tier=trust,
        trust_reviewed_at=(
            datetime.now(UTC).replace(tzinfo=None) if reviewed else None
        ),
        md_origin=origin,
        deleted_at=datetime.now(UTC).replace(tzinfo=None) if deleted else None,
        missing_since=datetime.now(UTC).replace(tzinfo=None) if missing else None,
    )
    for name in tags:
        tag = db.query(Tag).filter(Tag.drive == TEST_DRIVE, Tag.name == name).first() or Tag(name=name, drive=TEST_DRIVE)
        row.tags.append(tag)
    db.add(row)
    db.commit()
    return row


def _seed_notes(db) -> dict[str, File]:
    rows = {
        "a": _file(
            db, "Notes/a.md", mime="text/markdown", size=10, tags=["AI"], favorite=True
        ),
        "b": _file(
            db, "Notes/b.md", mime="text/markdown", size=5000,
            tags=["AI", "Reading"], liked=True, trust="unverified", origin="clip",
        ),
        "c": _file(
            db, "Notes/Deep/c.md", mime="text/markdown", size=200,
            reviewed=False, origin="clip",
        ),
        "v": _file(
            db, "Notes/v.mp4", mime="video/mp4", file_type="video", size=9000,
            duration=120.0, tags=["Video"],
        ),
        "r": _file(
            db, "root.md", mime="text/markdown", size=50, favorite=True, origin="clip"
        ),
        "x": _file(db, "Other/x.md", mime="text/markdown", size=30),
    }
    collection = Collection(drive=TEST_DRIVE, name="Picks")
    db.add(collection)
    db.commit()
    for position, key in enumerate(("a", "b", "v")):
        db.add(
            CollectionItem(
                collection_id=collection.id, file_id=rows[key].id, position=position
            )
        )
    db.commit()
    return rows


def _count_map(res) -> dict[str, int]:
    assert res.status_code == 200, res.text
    return {entry["path"]: entry["count"] for entry in res.json()}


GET_CASES = [
    pytest.param([], {"": 1, "Notes": 3, "Notes/Deep": 1, "Other": 1}, id="none"),
    pytest.param(
        [("type", "text")], {"": 1, "Notes": 2, "Notes/Deep": 1, "Other": 1}, id="type"
    ),
    pytest.param(
        [("type", "markdown")],
        {"": 1, "Notes": 2, "Notes/Deep": 1, "Other": 1},
        id="type-markdown",
    ),
    pytest.param(
        [("type", "text"), ("type", "video")],
        {"": 1, "Notes": 3, "Notes/Deep": 1, "Other": 1},
        id="type-list",
    ),
    pytest.param(
        [("origin", "clip")], {"": 1, "Notes": 1, "Notes/Deep": 1}, id="origin"
    ),
    pytest.param(
        [("exclude_origin", "clip")], {"Notes": 2, "Other": 1}, id="exclude-origin"
    ),
    pytest.param([("search", "Deep")], {"Notes/Deep": 1}, id="search"),
    pytest.param([("favorite", "true")], {"": 1, "Notes": 1}, id="favorite"),
    pytest.param([("liked", "true")], {"Notes": 1}, id="liked"),
    pytest.param([("tag", "AI")], {"Notes": 2}, id="tag"),
    pytest.param([("folder", "Notes")], {"Notes": 3, "Notes/Deep": 1}, id="folder"),
    pytest.param([("collection", "Picks")], {"Notes": 3}, id="collection"),
    pytest.param([("size", "gt:100")], {"Notes": 2, "Notes/Deep": 1}, id="size"),
    pytest.param([("duration", "gte:60")], {"Notes": 1}, id="duration"),
    pytest.param(
        [("trust", "verified")],
        {"": 1, "Notes": 2, "Notes/Deep": 1, "Other": 1},
        id="trust",
    ),
    pytest.param([("trust", "unreviewed")], {"Notes/Deep": 1}, id="trust-unreviewed"),
]


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

    @pytest.mark.parametrize(("params", "expected"), GET_CASES)
    def test_spec_core_130_counts_what_the_listing_returns_per_path(
        self, client, params, expected
    ):
        """SPEC-CORE-130 I14: every filter selects the listing's set, per folder."""
        api, db, *_ = client
        _seed_notes(db)

        counts = _count_map(
            api.get(f"/api/drives/{TEST_DRIVE}/folder-counts", params=params)
        )

        assert counts == expected
        for path, count in counts.items():
            res = api.get(
                f"/api/drives/{TEST_DRIVE}/files",
                params=[("limit", "1"), ("path", path), *params],
            )
            assert res.status_code == 200, res.text
            assert res.json()["meta"]["total"] == count, path
        total = api.get(
            f"/api/drives/{TEST_DRIVE}/files", params=[("limit", "1"), *params]
        )
        assert total.status_code == 200, total.text
        assert sum(counts.values()) == total.json()["meta"]["total"]

    @pytest.mark.parametrize(
        ("params", "status"),
        [
            pytest.param([("type", "bogus")], 422, id="type"),
            pytest.param([("search", "x" * 201)], 422, id="search"),
            pytest.param([("folder", "../etc")], 400, id="folder"),
            pytest.param([("collection", "c" * 101)], 400, id="collection"),
            pytest.param([("size", "gt:not-a-number")], 400, id="size"),
            pytest.param([("duration", "gt:1.000")], 400, id="duration"),
        ],
    )
    def test_spec_core_130_invalid_parameters_answer_what_files_answers(
        self, client, params, status
    ):
        """SPEC-CORE-130: both forms refuse what the listing refuses."""
        api, db, *_ = client
        _seed_notes(db)

        assert (
            api.get(f"/api/drives/{TEST_DRIVE}/files", params=params).status_code
            == status
        )
        assert (
            api.get(
                f"/api/drives/{TEST_DRIVE}/folder-counts", params=params
            ).status_code
            == status
        )
        assert (
            api.post(
                f"/api/drives/{TEST_DRIVE}/folder-counts/query",
                params=params,
                json={"file_ids": []},
            ).status_code
            == status
        )

    def test_unknown_drive_is_404_and_unknown_kind_is_422(self, client):
        api, _, _, _ = client
        assert api.get("/api/drives/nope/folder-counts").status_code == 404
        assert api.get(f"/api/drives/{TEST_DRIVE}/folder-counts?type=bogus").status_code == 422


POST_CASES = [
    pytest.param([], ["a", "b", "v"], {"Notes": 3}, id="ids"),
    pytest.param([("tag", "AI")], ["a", "b", "v"], {"Notes": 2}, id="ids-and-filter"),
    pytest.param([("collection", "Picks")], [], {"Notes": 3}, id="collection"),
    pytest.param(
        [("collection", "Picks")],
        ["c"],
        {"Notes": 3, "Notes/Deep": 1},
        id="collection-or-ids",
    ),
    pytest.param([], [], {}, id="empty-ids"),
]


class TestFolderCountsQuery:
    """POST /api/drives/{drive}/folder-counts/query under SPEC-CORE-130."""

    @pytest.mark.parametrize(("params", "names", "expected"), POST_CASES)
    def test_spec_core_130_post_counts_what_files_query_returns_per_path(
        self, client, params, names, expected
    ):
        """SPEC-CORE-130 I14: the POST form answers `files/query`'s set, per folder."""
        api, db, *_ = client
        rows = _seed_notes(db)
        body = {"file_ids": [rows[name].id for name in names]}

        counts = _count_map(
            api.post(
                f"/api/drives/{TEST_DRIVE}/folder-counts/query",
                params=params,
                json=body,
            )
        )

        assert counts == expected
        for path, count in counts.items():
            res = api.post(
                f"/api/drives/{TEST_DRIVE}/files/query",
                params=[("limit", "1"), ("path", path), *params],
                json=body,
            )
            assert res.status_code == 200, res.text
            assert res.json()["meta"]["total"] == count, path
        total = api.post(
            f"/api/drives/{TEST_DRIVE}/files/query",
            params=[("limit", "1"), *params],
            json=body,
        )
        assert total.status_code == 200, total.text
        assert sum(counts.values()) == total.json()["meta"]["total"]


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

    def test_path_counts_only_files_directly_in_that_folder(self, client):
        api, db, _, _ = client
        _file(db, "root.md", mime="text/markdown", tags=["AI"])
        _file(db, "Inbox/a.md", mime="text/markdown", tags=["AI", "設計"])
        _file(db, "Inbox/Deep/b.md", mime="text/markdown", tags=["AI", "深い"])

        assert api.get(f"/api/drives/{TEST_DRIVE}/tags?type=text&path=Inbox").json() == [
            {"name": "AI", "count": 1},
            {"name": "設計", "count": 1},
        ]
        assert api.get(f"/api/drives/{TEST_DRIVE}/tags?type=text&path=").json() == [
            {"name": "AI", "count": 1},
        ]
        assert api.get(f"/api/drives/{TEST_DRIVE}/tags?path=../etc").status_code == 400

    def test_path_still_counts_only_active_files_of_the_kind(self, client):
        api, db, _, _ = client
        _file(db, "Inbox/a.md", mime="text/markdown", tags=["AI"])
        _file(db, "Inbox/gone.md", mime="text/markdown", deleted=True, tags=["AI", "消えた"])
        _file(db, "Inbox/lost.md", mime="text/markdown", missing=True, tags=["AI", "見失い"])
        _file(db, "Inbox/clip.mp4", mime="video/mp4", file_type="video", tags=["AI", "動画"])

        assert api.get(f"/api/drives/{TEST_DRIVE}/tags?type=text&path=Inbox").json() == [
            {"name": "AI", "count": 1},
        ]

    def test_without_a_kind_the_listing_is_unchanged(self, client):
        api, db, _, _ = client
        _file(db, "a.md", mime="text/markdown", tags=["AI"])
        _file(db, "c.mp4", mime="video/mp4", file_type="video", tags=["AI", "動画"])

        assert api.get(f"/api/drives/{TEST_DRIVE}/tags").json() == [
            {"name": "AI", "count": 2},
            {"name": "動画", "count": 1},
        ]


from tests.test_target_drive_access import LOCKED_DRIVE, OPEN_DRIVE, two_drives  # noqa: E402,F401


def _file_in(db, drive: str, path: str, tags=()):
    *folders, filename = path.split("/")
    row = File(
        filename=filename, title=filename, drive=drive, folder_path="/".join(folders),
        file_path=path, file_size=1, file_type="document", mime_type="text/markdown",
    )
    for name in tags:
        tag = db.query(Tag).filter(Tag.drive == drive, Tag.name == name).first() or Tag(name=name, drive=drive)
        row.tags.append(tag)
    db.add(row)
    db.commit()
    return row


class TestDriveBoundary:
    def test_a_locked_drive_answers_404_on_both_endpoints(self, two_drives):
        api, db, _, _ = two_drives
        _file_in(db, LOCKED_DRIVE, "Secret/a.md", tags=["hidden"])

        assert api.get(f"/api/drives/{LOCKED_DRIVE}/folder-counts?type=text").status_code == 404
        assert api.get(f"/api/drives/{LOCKED_DRIVE}/tags?type=text").status_code == 404

    def test_spec_core_130_a_locked_drive_answers_404_on_both_folder_count_forms(self, two_drives):
        """SPEC-CORE-130 I15."""
        api, db, _, _ = two_drives
        _file_in(db, LOCKED_DRIVE, "Secret/a.md")

        get_res = api.get(f"/api/drives/{LOCKED_DRIVE}/folder-counts?type=text")
        post_res = api.post(
            f"/api/drives/{LOCKED_DRIVE}/folder-counts/query?type=text",
            json={"file_ids": []},
        )

        assert get_res.status_code == 404
        assert post_res.status_code == 404
        assert post_res.json()["detail"] == f"Drive not found: {LOCKED_DRIVE}"

    def test_spec_core_130_another_drives_ids_and_collections_count_nothing(self, two_drives):
        """SPEC-CORE-130 I15."""
        api, db, _, _ = two_drives
        own = _file_in(db, OPEN_DRIVE, "Notes/a.md")
        hidden = _file_in(db, LOCKED_DRIVE, "Notes/b.md")
        collection = Collection(drive=LOCKED_DRIVE, name="Hidden")
        db.add(collection)
        db.commit()
        db.add(
            CollectionItem(
                collection_id=collection.id, file_id=hidden.id, position=0
            )
        )
        db.commit()

        assert _count_map(
            api.post(
                f"/api/drives/{OPEN_DRIVE}/folder-counts/query",
                json={"file_ids": [own.id, hidden.id]},
            )
        ) == {"Notes": 1}
        assert _count_map(
            api.post(
                f"/api/drives/{OPEN_DRIVE}/folder-counts/query",
                json={"file_ids": [hidden.id]},
            )
        ) == {}
        assert _count_map(
            api.get(f"/api/drives/{OPEN_DRIVE}/folder-counts?collection=Hidden")
        ) == {}

    def test_another_drives_files_are_never_counted(self, two_drives):
        api, db, _, _ = two_drives
        _file_in(db, OPEN_DRIVE, "Notes/a.md", tags=["shared"])
        _file_in(db, LOCKED_DRIVE, "Notes/b.md", tags=["shared", "hidden"])
        _file_in(db, LOCKED_DRIVE, "Secret/c.md")

        assert api.get(f"/api/drives/{OPEN_DRIVE}/folder-counts?type=text").json() == [
            {"path": "Notes", "count": 1}
        ]
        assert api.get(f"/api/drives/{OPEN_DRIVE}/tags?type=text").json() == [
            {"name": "shared", "count": 1}
        ]
