from datetime import UTC, datetime, timedelta

import pytest

from tests.conftest import TEST_DRIVE

BASE = datetime(2026, 1, 1, tzinfo=UTC)


def _add(db, name, *, updated_minutes, folder="notes", mime="text/markdown", file_type="document"):
    from app.models import File

    row = File(
        filename=name,
        title=name,
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=f"{folder}/{name}",
        file_size=1,
        file_type=file_type,
        mime_type=mime,
        created_at=BASE,
        updated_at=BASE + timedelta(minutes=updated_minutes),
    )
    db.add(row)
    return row


def _seed(db):
    rows = [
        _add(db, "old.md", updated_minutes=1),
        _add(db, "newest.md", updated_minutes=30),
        _add(db, "middle.md", updated_minutes=10),
        _add(db, "clip.mp4", updated_minutes=20, mime="video/mp4", file_type="video"),
    ]
    db.commit()
    return rows


def _titles(res):
    assert res.status_code == 200, res.text
    return [item["title"] for item in res.json()["data"]]


def test_orders_by_updated_at_descending_by_default(client):
    c, db, _drive_dir, _data_dir = client
    _seed(db)

    res = c.get(f"/api/drives/{TEST_DRIVE}/files?sort=updated_at")

    assert _titles(res) == ["newest.md", "clip.mp4", "middle.md", "old.md"]


def test_orders_by_updated_at_ascending(client):
    c, db, _drive_dir, _data_dir = client
    _seed(db)

    res = c.get(f"/api/drives/{TEST_DRIVE}/files?sort=updated_at&order=asc")

    assert _titles(res) == ["old.md", "middle.md", "clip.mp4", "newest.md"]


def test_the_order_does_not_follow_created_at(client):
    c, db, _drive_dir, _data_dir = client
    from app.models import File

    db.add_all(
        [
            File(
                filename="edited.md", title="edited.md", drive=TEST_DRIVE, folder_path="",
                file_path="edited.md", file_size=1, file_type="document", mime_type="text/markdown",
                created_at=BASE, updated_at=BASE + timedelta(days=2),
            ),
            File(
                filename="imported.md", title="imported.md", drive=TEST_DRIVE, folder_path="",
                file_path="imported.md", file_size=1, file_type="document", mime_type="text/markdown",
                created_at=BASE + timedelta(days=1), updated_at=BASE + timedelta(days=1),
            ),
        ]
    )
    db.commit()

    res = c.get(f"/api/drives/{TEST_DRIVE}/files?sort=updated_at")

    assert _titles(res) == ["edited.md", "imported.md"]


@pytest.mark.parametrize("order", ["desc", "asc"])
def test_walking_every_page_yields_each_row_once_when_timestamps_tie(client, order):
    c, db, _drive_dir, _data_dir = client
    for i in range(5):
        _add(db, f"tie-{i}.md", updated_minutes=5)
    db.commit()

    seen = []
    for page in range(1, 6):
        res = c.get(
            f"/api/drives/{TEST_DRIVE}/files?sort=updated_at&order={order}&limit=1&page={page}"
        )
        seen += [item["id"] for item in res.json()["data"]]

    assert len(seen) == 5
    assert len(set(seen)) == 5
    assert seen == sorted(seen, reverse=order == "desc")


def test_filters_before_ordering_and_counts_the_filtered_set(client):
    c, db, _drive_dir, _data_dir = client
    _seed(db)
    _add(db, "elsewhere.md", updated_minutes=99, folder="other")
    db.commit()

    res = c.get(
        f"/api/drives/{TEST_DRIVE}/files?sort=updated_at&type=document&path=notes&limit=2"
    )

    assert _titles(res) == ["newest.md", "middle.md"]
    assert res.json()["meta"]["total"] == 3


@pytest.mark.parametrize(
    "sort, expected",
    [
        ("title", ["clip.mp4", "middle.md", "newest.md", "old.md"]),
        ("created_at", None),
        ("file_size", None),
        ("liked_at", None),
        ("random", None),
    ],
)
def test_the_existing_sort_values_still_answer(client, sort, expected):
    c, db, _drive_dir, _data_dir = client
    _seed(db)

    res = c.get(f"/api/drives/{TEST_DRIVE}/files?sort={sort}&order=asc")

    assert res.status_code == 200
    if expected is not None:
        assert _titles(res) == expected


def test_an_unknown_sort_is_still_rejected(client):
    c, _db, _drive_dir, _data_dir = client

    res = c.get(f"/api/drives/{TEST_DRIVE}/files?sort=modified_at")

    assert res.status_code == 422


def test_other_listings_do_not_accept_updated_at(client):
    c, db, _drive_dir, _data_dir = client
    rows = _seed(db)

    assert c.get(f"/api/files/{rows[0].id}/neighbors?sort=updated_at").status_code == 422
    assert c.get(f"/api/drives/{TEST_DRIVE}/trash?sort=updated_at").status_code == 422
    assert c.get(f"/api/drives/{TEST_DRIVE}/missing?sort=updated_at").status_code == 422
