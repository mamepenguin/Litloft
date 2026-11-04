"""File actions that close an inbox row: SPEC-CORE-032 I8/I9/I11/I16."""

import hashlib

import pytest
from sqlalchemy import text

from tests.conftest import TEST_DRIVE
from tests.inbox_helpers import (
    SECOND_DRIVE,
    broadcasts,
    configure_drives,
    drives_for,
    flush,
    only_inbox_events,
    row,
    rows,
    seed,
    set_missing,
)

T1 = "2026-01-01 00:00:01.000000"
T2 = "2026-01-01 00:00:02.000000"


@pytest.fixture()
def two_drives(client, tmp_path):
    c, db, drive_dir, _data_dir = client
    configure_drives(drives_for(client, tmp_path, [{"name": SECOND_DRIVE}]))
    return c, db, drive_dir, tmp_path / SECOND_DRIVE


def _put_content(api, drive_dir, file_id, path, body):
    etag = hashlib.sha256((drive_dir / path).read_bytes()).hexdigest()
    return api.put(
        f"/api/files/{file_id}/content",
        content=body.encode("utf-8"),
        headers={
            "If-Match": etag,
            "Content-Type": "text/plain; charset=utf-8",
        },
    )


class TestMoveCloses:
    def test_same_drive_move_closes_the_row(self, client):
        """SPEC-CORE-032 I8: a move within the drive closes the row."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.md")

        r = c.put(f"/api/files/{file_id}/move", json={"target_folder_path": "filed"})

        assert r.status_code == 200
        assert row(db, file_id)["done_at"] is not None

    def test_same_drive_move_broadcasts_once_for_the_drive(self, client, broadcasts):
        """SPEC-CORE-032 I16: the move notifies its drive once."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.md")

        c.put(f"/api/files/{file_id}/move", json={"target_folder_path": "filed"})
        flush(c)

        assert only_inbox_events(broadcasts) == [
            ("inbox.updated", {"drive": TEST_DRIVE}, TEST_DRIVE)
        ]

    def test_cross_drive_move_deletes_the_row(self, two_drives):
        """SPEC-CORE-032 I4: a row never travels with its file."""
        c, db, drive_dir, second_dir = two_drives
        file_id = seed(c, db, "note.md")

        r = c.put(
            f"/api/files/{file_id}/move",
            json={"target_drive": SECOND_DRIVE, "target_folder_path": ""},
        )

        assert r.status_code == 200
        assert r.json()["drive"] == SECOND_DRIVE
        assert rows(db, file_id=file_id) == []

    def test_cross_drive_move_broadcasts_for_the_source_drive_only(
        self, two_drives, broadcasts
    ):
        """SPEC-CORE-032 I16: the source drive is told, the destination is not."""
        c, db, drive_dir, second_dir = two_drives
        file_id = seed(c, db, "note.md")

        c.put(
            f"/api/files/{file_id}/move",
            json={"target_drive": SECOND_DRIVE, "target_folder_path": ""},
        )
        flush(c)

        assert only_inbox_events(broadcasts) == [
            ("inbox.updated", {"drive": TEST_DRIVE}, TEST_DRIVE)
        ]

    def test_batch_move_closes_each_row_and_broadcasts_once(self, client, broadcasts):
        """SPEC-CORE-032 I8/I16: per-file commits, one event per drive."""
        c, db, drive_dir, _ = client
        first = seed(c, db, "first.md")
        second = seed(c, db, "second.md")
        flush(c)
        broadcasts.clear()

        r = c.put(
            "/api/files/batch/move",
            json={"ids": [first, second], "target_folder_path": "filed"},
        )
        flush(c)

        assert r.json()["moved"] == 2
        assert row(db, first)["done_at"] is not None
        assert row(db, second)["done_at"] is not None
        assert only_inbox_events(broadcasts) == [
            ("inbox.updated", {"drive": TEST_DRIVE}, TEST_DRIVE)
        ]

    def test_batch_cross_drive_move_deletes_the_rows(self, two_drives):
        """SPEC-CORE-032 I4: every row of the batch is removed at the boundary."""
        c, db, drive_dir, second_dir = two_drives
        first = seed(c, db, "first.md")
        second = seed(c, db, "second.md")

        r = c.put(
            "/api/files/batch/move",
            json={
                "ids": [first, second],
                "target_drive": SECOND_DRIVE,
                "target_folder_path": "",
            },
        )

        assert r.json()["moved"] == 2
        assert rows(db, file_id=first) == []
        assert rows(db, file_id=second) == []


class TestTrashCloses:
    def test_trash_closes_the_row(self, client):
        """SPEC-CORE-032 I8: a trash closes the row."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.md")

        r = c.delete(f"/api/files/{file_id}")

        assert r.status_code == 200
        assert row(db, file_id)["done_at"] is not None

    def test_batch_trash_closes_each_row(self, client):
        """SPEC-CORE-032 I8: the batch delete closes per file."""
        c, db, drive_dir, _ = client
        first = seed(c, db, "first.md")
        second = seed(c, db, "second.md")

        r = c.post("/api/files/batch/delete", json={"ids": [first, second]})

        assert r.json()["deleted"] == 2
        assert row(db, first)["done_at"] is not None
        assert row(db, second)["done_at"] is not None

    def test_folder_trash_closes_every_file_under_it(self, client, broadcasts):
        """SPEC-CORE-032 I8: one UPDATE closes every file the folder soft-deletes."""
        c, db, drive_dir, _ = client
        direct = seed(c, db, "box/direct.md")
        nested = seed(c, db, "box/deep/nested.md")
        elsewhere = seed(c, db, "elsewhere.md")
        flush(c)
        broadcasts.clear()

        r = c.delete(f"/api/drives/{TEST_DRIVE}/folders", params={"path": "box"})
        flush(c)

        assert r.status_code == 200
        assert row(db, direct)["done_at"] is not None
        assert row(db, nested)["done_at"] is not None
        assert row(db, elsewhere)["done_at"] is None
        assert only_inbox_events(broadcasts) == [
            ("inbox.updated", {"drive": TEST_DRIVE}, TEST_DRIVE)
        ]


class TestTagWrites:
    def test_tag_write_that_changes_the_set_closes_the_row(self, client):
        """SPEC-CORE-032 I8: a tag write that changes the set closes the row."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.txt")

        r = c.put(f"/api/files/{file_id}/tags", json={"tags": ["alpha"]})

        assert r.status_code == 200
        assert row(db, file_id)["done_at"] is not None

    def test_tag_write_that_keeps_the_set_closes_nothing(self, client, broadcasts):
        """SPEC-CORE-032 I8: re-saving the same tags is not filing."""
        c, db, drive_dir, _ = client
        file_id = seed(
            c, db, "note.md", "---\ntags: [alpha]\n---\nbody\n"
        )
        flush(c)
        broadcasts.clear()

        r = c.put(f"/api/files/{file_id}/tags", json={"tags": ["alpha"]})
        flush(c)

        assert r.status_code == 200
        assert row(db, file_id)["done_at"] is None
        assert only_inbox_events(broadcasts) == []

    def test_batch_tag_merge_that_adds_a_tag_closes_the_row(self, client):
        """SPEC-CORE-032 I8: the batch tag endpoint closes on a set change."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.txt")

        r = c.put("/api/files/batch/tags", json={"ids": [file_id], "tags": ["beta"]})

        assert r.status_code == 200
        assert row(db, file_id)["done_at"] is not None

    def test_batch_tag_merge_that_adds_nothing_closes_nothing(self, client):
        """SPEC-CORE-032 I8: merging an already-present tag changes no set."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.md", "---\ntags: [alpha]\n---\nbody\n")

        r = c.put("/api/files/batch/tags", json={"ids": [file_id], "tags": ["alpha"]})

        assert r.status_code == 200
        assert row(db, file_id)["done_at"] is None

    def test_markdown_tag_endpoint_closes_on_a_set_change(self, client):
        """SPEC-CORE-032 I8: the .md branch of the tag endpoint closes."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.md", "---\ntags: [alpha]\n---\nbody\n")

        r = c.put(f"/api/files/{file_id}/tags", json={"tags": ["beta"]})

        assert r.status_code == 200
        assert row(db, file_id)["done_at"] is not None

    def test_content_write_that_changes_frontmatter_tags_closes_the_row(self, client):
        """SPEC-CORE-032 I8: a projected tag change closes the row."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.md", "---\ntags: [alpha]\n---\nbody\n")

        r = _put_content(
            c,
            drive_dir,
            file_id,
            "note.md",
            "---\ntags: [alpha, beta]\n---\nbody\n",
        )

        assert r.status_code == 200
        assert row(db, file_id)["done_at"] is not None

    def test_content_write_that_keeps_the_tag_set_closes_nothing(self, client):
        """SPEC-CORE-032 I8: a content write with the same tags files nothing."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.md", "---\ntags: [alpha]\n---\nbody\n")

        r = _put_content(
            c,
            drive_dir,
            file_id,
            "note.md",
            "---\ntags: [alpha]\n---\nnew body\n",
        )

        assert r.status_code == 200
        assert row(db, file_id)["done_at"] is None

    def test_a_failed_close_does_not_fail_the_content_write(self, client):
        """SPEC-CORE-032 I8: the content write commits first and survives a failed close."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.md", "---\ntags: [alpha]\n---\nbody\n")
        db.execute(text("DROP TABLE inbox_items"))
        db.commit()

        r = _put_content(
            c,
            drive_dir,
            file_id,
            "note.md",
            "---\ntags: [alpha, beta]\n---\nbody\n",
        )

        assert r.status_code == 200
        assert "beta" in (drive_dir / "note.md").read_text()

    def test_tag_write_that_changes_the_set_broadcasts_once(self, client, broadcasts):
        """SPEC-CORE-032 I16: the tag endpoint notifies the drive once."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.txt")
        flush(c)
        broadcasts.clear()

        c.put(f"/api/files/{file_id}/tags", json={"tags": ["alpha"]})
        flush(c)

        assert only_inbox_events(broadcasts) == [
            ("inbox.updated", {"drive": TEST_DRIVE}, TEST_DRIVE)
        ]


NON_CLOSING_ACTIONS = [
    ("open", "note.md", "", lambda c, fid, dirs: c.get(f"/api/files/{fid}")),
    (
        "view-only-progress",
        "note.md",
        "",
        lambda c, fid, dirs: c.post(
            f"/api/files/{fid}/progress",
            json={},
            headers={"X-Lit-Viewer": "viewer"},
        ),
    ),
    (
        "playback-progress",
        "note.md",
        "",
        lambda c, fid, dirs: c.post(
            f"/api/files/{fid}/progress",
            json={"position": 10.0, "duration": 100.0},
            headers={"X-Lit-Viewer": "viewer"},
        ),
    ),
    (
        "rename",
        "note.md",
        "",
        lambda c, fid, dirs: c.put(
            f"/api/files/{fid}/rename", json={"new_filename": "renamed.md"}
        ),
    ),
    (
        "folder-rename",
        "box/note.md",
        "",
        lambda c, fid, dirs: c.put(
            f"/api/drives/{TEST_DRIVE}/folders",
            json={"path": "box", "new_name": "crate"},
        ),
    ),
    (
        "folder-move",
        "box/note.md",
        "",
        lambda c, fid, dirs: c.put(
            f"/api/drives/{TEST_DRIVE}/folders/move",
            json={"path": "box", "target_path": "crate"},
        ),
    ),
    (
        "copy",
        "note.md",
        "",
        lambda c, fid, dirs: c.post(
            f"/api/files/{fid}/copy", json={"target_folder_path": "copies"}
        ),
    ),
    (
        "comment",
        "note.md",
        "",
        lambda c, fid, dirs: c.post(
            f"/api/files/{fid}/comments",
            json={"body": "hi"},
            headers={"X-Lit-Viewer": "viewer"},
        ),
    ),
    ("like", "note.md", "", lambda c, fid, dirs: c.post(f"/api/files/{fid}/like")),
    (
        "favorite",
        "note.md",
        "",
        lambda c, fid, dirs: c.post(f"/api/files/{fid}/favorite"),
    ),
    (
        "internal-tags",
        "note.md",
        "",
        lambda c, fid, dirs: c.post(
            f"/api/internal/files/{fid}/tags", json={"tags": ["changed"]}
        ),
    ),
]


class TestActionsThatCloseNothing:
    @pytest.mark.parametrize(
        "name,path,content,action",
        NON_CLOSING_ACTIONS,
        ids=[row[0] for row in NON_CLOSING_ACTIONS],
    )
    def test_these_actions_leave_the_row_open(self, client, name, path, content, action):
        """SPEC-CORE-032 I8: opening, playback, rename, folder ops, copy, comments, likes, favourites and internal tags close nothing."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, path, content)

        r = action(c, file_id, drive_dir)

        assert r.status_code < 400, (name, r.text)
        assert row(db, file_id)["done_at"] is None, name


class TestFileState:
    def test_restore_leaves_the_row_done(self, client):
        """SPEC-CORE-032 I9: restoring undoes the trash, not the triage."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.md")
        assert c.delete(f"/api/files/{file_id}").status_code == 200

        r = c.post(f"/api/files/{file_id}/restore")

        assert r.status_code == 200
        assert row(db, file_id)["done_at"] is not None
        assert c.get(f"/api/drives/{TEST_DRIVE}/inbox").json()["items"] == []

    def test_missing_hides_the_row_and_recovery_restores_it_unchanged(self, client):
        """SPEC-CORE-032 I9/I5: a missing file's row is kept and comes back as it was."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.md", arrived_at=T1)
        before = row(db, file_id)

        set_missing(db, file_id)
        hidden = c.get(f"/api/drives/{TEST_DRIVE}/inbox").json()

        clear_missing(db, file_id)

        assert hidden["items"] == []
        assert hidden["open_count"] == 0
        assert row(db, file_id) == before

    def test_a_missing_row_retired_to_a_placeholder_keeps_its_row(self, client):
        """SPEC-CORE-032 I9: resolve_db_path_conflict keeps the retired row."""
        c, db, drive_dir, _ = client
        missing = seed(c, db, "taken.md", arrived_at=T1)
        (drive_dir / "taken.md").unlink()
        set_missing(db, missing)
        before = row(db, missing)
        mover = seed(c, db, "mover.md", arrived_at=T2)

        r = c.put(f"/api/files/{mover}/rename", json={"new_filename": "taken.md"})

        assert r.status_code == 200
        assert row(db, missing) == before
        assert row(db, mover)["done_at"] is None

    def test_purge_deletes_the_row_through_the_cascade(self, client):
        """SPEC-CORE-032 I11: purging a file removes its row."""
        c, db, drive_dir, _ = client
        file_id = seed(c, db, "note.md")
        assert c.delete(f"/api/files/{file_id}").status_code == 200

        r = c.delete(f"/api/files/{file_id}/purge")

        assert r.status_code == 200
        assert rows(db, file_id=file_id) == []
