"""Recording an arrival: SPEC-CORE-032 and SPEC-ADDON-059.

An upload says so at init; a text-file create says so in the body. Nothing
else creates or renews a row.
"""

import pytest

from tests.conftest import TEST_DRIVE
from tests.inbox_helpers import (
    UPLOAD_I18N_KEY,
    broadcasts,
    create,
    flush,
    only_inbox_events,
    parse_ts,
    row,
    rows,
    set_missing,
    update_row,
    upload,
)

OLD_ARRIVAL = "2026-01-01 00:00:00.000000"

CLIP = {"source": "web_clip", "i18n_key": "knowledge.inbox.sourceWebClip"}


class TestUploadArrival:
    def test_upload_with_inbox_source_records_one_open_row(self, client):
        """SPEC-CORE-032 I2: an upload that says so leaves one open row."""
        c, db, drive_dir, _ = client

        r = upload(c, "arrived.txt", b"hello", inbox_source="upload")

        assert r.status_code == 200
        recorded = row(db, r.json()["id"])
        assert recorded is not None
        assert recorded["drive"] == TEST_DRIVE
        assert recorded["source"] == "upload"
        assert recorded["source_i18n_key"] == UPLOAD_I18N_KEY
        assert recorded["done_at"] is None

    def test_upload_without_inbox_source_records_nothing(self, client):
        """SPEC-CORE-032 I1: an upload that says nothing is not an arrival."""
        c, db, drive_dir, _ = client

        r = upload(c, "silent.txt", b"hello")

        assert r.status_code == 200
        assert rows(db) == []

    @pytest.mark.parametrize("value", ["", "web_clip", "Upload", 1])
    def test_upload_rejects_any_other_inbox_source(self, client, value):
        """SPEC-CORE-032 §2: the only accepted value is "upload"; anything else is 422."""
        c, db, drive_dir, _ = client

        r = upload(c, "rejected.txt", b"hello", inbox_source=value)

        assert r.status_code == 422
        assert list(drive_dir.iterdir()) == []
        assert rows(db) == []

    def test_subtitle_sidecar_is_not_an_arrival(self, client):
        """SPEC-CORE-032 I2: a subtitle produces no file row, so no inbox row."""
        c, db, drive_dir, _ = client

        r = upload(
            c,
            "movie.srt",
            b"1\n00:00:01,000 --> 00:00:02,000\nhi\n",
            inbox_source="upload",
        )

        assert r.status_code == 200
        assert r.json()["status"] == "sidecar"
        assert rows(db) == []

    def test_folder_upload_records_one_row_per_file(self, client):
        """SPEC-CORE-032 I2: a folder upload with relative_path arrives per file."""
        c, db, drive_dir, _ = client

        first = upload(
            c, "one.txt", b"1", inbox_source="upload", relative_path="album/one.txt"
        )
        second = upload(
            c, "two.txt", b"2", inbox_source="upload", relative_path="album/two.txt"
        )

        assert first.status_code == 200
        assert second.status_code == 200
        assert row(db, first.json()["id"])["drive"] == TEST_DRIVE
        assert row(db, second.json()["id"])["drive"] == TEST_DRIVE
        assert (drive_dir / "album" / "one.txt").exists()

    def test_reused_missing_row_renews_its_inbox_row(self, client):
        """SPEC-CORE-032 I9: a re-upload to a missing row's path renews the row."""
        c, db, drive_dir, _ = client
        file_id = create(
            c, "note.md", "old", arrival=CLIP
        ).json()["id"]
        update_row(db, file_id, arrived_at=OLD_ARRIVAL, done_at=OLD_ARRIVAL)
        (drive_dir / "note.md").unlink()
        set_missing(db, file_id)

        r = upload(c, "note.md", b"new", inbox_source="upload")

        assert r.status_code == 200
        assert r.json()["id"] == file_id
        renewed = row(db, file_id)
        assert renewed["done_at"] is None
        assert renewed["source"] == "upload"
        assert renewed["source_i18n_key"] == UPLOAD_I18N_KEY
        assert parse_ts(renewed["arrived_at"]) > parse_ts(OLD_ARRIVAL)

    def test_reused_active_row_whose_file_vanished_keeps_its_id(self, client):
        """SPEC-CORE-032 I9: a vanished active row is reused, not duplicated."""
        c, db, drive_dir, _ = client
        file_id = create(c, "note.md", "old", arrival=CLIP).json()["id"]
        (drive_dir / "note.md").unlink()

        r = upload(c, "note.md", b"new", inbox_source="upload")

        assert r.status_code == 200
        assert r.json()["id"] == file_id
        assert len(rows(db, file_id=file_id)) == 1
        assert row(db, file_id)["done_at"] is None

    def test_trashed_ghost_is_replaced_and_gets_a_new_row(self, client):
        """SPEC-CORE-032 I9: the ghost's row cascades away; the new file gets its own."""
        c, db, drive_dir, _ = client
        file_id = create(c, "note.md", "old", arrival=CLIP).json()["id"]
        assert c.delete(f"/api/files/{file_id}").status_code == 200
        assert row(db, file_id)["done_at"] is not None

        r = upload(c, "note.md", b"new", inbox_source="upload")

        assert r.status_code == 200
        new_id = r.json()["id"]
        assert new_id != file_id
        assert rows(db, file_id=file_id) == []
        assert row(db, new_id)["done_at"] is None
        assert row(db, new_id)["source"] == "upload"

    def test_upload_without_inbox_source_leaves_an_existing_row_unchanged(self, client):
        """SPEC-CORE-032 I1: a re-upload that says nothing renews no row."""
        c, db, drive_dir, _ = client
        file_id = create(c, "note.md", "old", arrival=CLIP).json()["id"]
        update_row(db, file_id, arrived_at=OLD_ARRIVAL)
        (drive_dir / "note.md").unlink()

        r = upload(c, "note.md", b"new")

        assert r.status_code == 200
        assert r.json()["id"] == file_id
        unchanged = row(db, file_id)
        assert parse_ts(unchanged["arrived_at"]) == parse_ts(OLD_ARRIVAL)
        assert unchanged["source"] == "web_clip"
        assert unchanged["done_at"] is None

    def test_upload_to_an_existing_path_is_refused_without_an_arrival(self, client):
        """SPEC-CORE-032 §2: a path that already holds a file is 409 at init."""
        c, db, drive_dir, _ = client
        create(c, "taken.txt", "x")

        r = upload(c, "taken.txt", b"y", inbox_source="upload")

        assert r.status_code == 409
        assert rows(db) == []

    def test_a_failed_complete_leaves_no_file_and_no_row(self, client):
        """SPEC-CORE-032 I3: no committed arrival without its file."""
        c, db, drive_dir, _ = client

        r = upload(c, "short.txt", b"abc", inbox_source="upload", file_size=10)

        assert r.status_code == 400
        assert list(drive_dir.iterdir()) == []
        assert rows(db) == []

    def test_upload_frontmatter_projection_closes_nothing(self, client):
        """SPEC-CORE-032 I8: an upload's own tag projection is not a tag write."""
        c, db, drive_dir, _ = client

        r = upload(
            c,
            "tagged.md",
            b"---\ntags: [alpha]\n---\nbody\n",
            inbox_source="upload",
        )

        assert r.status_code == 200
        assert row(db, r.json()["id"])["done_at"] is None


class TestCreateArrival:
    def test_create_with_arrival_records_the_given_source(self, client):
        """SPEC-ADDON-059 §1: the create writes the arrival with the given values."""
        c, db, drive_dir, _ = client

        r = create(c, "clip.md", "# clip\n", arrival=CLIP)

        assert r.status_code == 201
        recorded = row(db, r.json()["id"])
        assert recorded["source"] == "web_clip"
        assert recorded["source_i18n_key"] == "knowledge.inbox.sourceWebClip"
        assert recorded["done_at"] is None

    def test_create_without_arrival_records_nothing(self, client):
        """SPEC-ADDON-059 I1: callers that omit arrival are unchanged."""
        c, db, drive_dir, _ = client

        r = create(c, "quick-note.md", "text")

        assert r.status_code == 201
        assert rows(db) == []

    def test_create_does_not_interpret_the_source(self, client):
        """SPEC-ADDON-059 §1: the core stores any well-formed source as given."""
        c, db, drive_dir, _ = client
        arrival = {"source": "phone_share", "i18n_key": "inbox.sourceShare"}

        r = create(c, "shared.md", "x", arrival=arrival)

        assert r.status_code == 201
        recorded = row(db, r.json()["id"])
        assert recorded["source"] == "phone_share"
        assert recorded["source_i18n_key"] == "inbox.sourceShare"

    def test_suffix_renamed_create_attaches_the_row_to_the_new_file(self, client):
        """SPEC-ADDON-059 §1: a suffix-renamed create still writes its arrival."""
        c, db, drive_dir, _ = client
        first = create(c, "dup.md", "a")

        r = create(c, "dup.md", "b", arrival=CLIP)

        assert first.status_code == 201
        assert r.status_code == 201
        assert r.json()["filename"] == "dup (1).md"
        assert row(db, r.json()["id"]) is not None
        assert rows(db, file_id=first.json()["id"]) == []

    def test_missing_recovery_with_arrival_renews_the_row(self, client):
        """SPEC-ADDON-059 I9: a recovered row keeps its id and gets a fresh arrival."""
        c, db, drive_dir, _ = client
        file_id = create(c, "recover.md", "old", arrival=CLIP).json()["id"]
        update_row(db, file_id, arrived_at=OLD_ARRIVAL, done_at=OLD_ARRIVAL)
        (drive_dir / "recover.md").unlink()
        set_missing(db, file_id)

        r = create(
            c,
            "recover.md",
            "new",
            arrival={"source": "upload", "i18n_key": UPLOAD_I18N_KEY},
        )

        assert r.status_code == 200
        assert r.json()["id"] == file_id
        renewed = row(db, file_id)
        assert renewed["done_at"] is None
        assert renewed["source"] == "upload"
        assert renewed["source_i18n_key"] == UPLOAD_I18N_KEY
        assert parse_ts(renewed["arrived_at"]) > parse_ts(OLD_ARRIVAL)

    def test_create_frontmatter_projection_closes_nothing(self, client):
        """SPEC-CORE-032 I8: a create's own tag projection is not a tag write."""
        c, db, drive_dir, _ = client

        r = create(c, "tagged.md", "---\ntags: [alpha]\n---\nbody\n", arrival=CLIP)

        assert r.status_code == 201
        assert row(db, r.json()["id"])["done_at"] is None

    def test_create_still_accepts_an_unknown_top_level_field(self, client):
        """SPEC-ADDON-059 §1: only the nested arrival forbids extra keys."""
        c, db, drive_dir, _ = client

        r = c.post(
            f"/api/drives/{TEST_DRIVE}/files",
            json={"path": "legacy.md", "content": "x", "older_caller_field": True},
        )

        assert r.status_code == 201

    @pytest.mark.parametrize(
        "arrival",
        [
            {"source": "WebClip", "i18n_key": "inbox.sourceWebClip"},
            {"source": "web clip", "i18n_key": "inbox.sourceWebClip"},
            {"source": "", "i18n_key": "inbox.sourceWebClip"},
            {"source": "a" * 65, "i18n_key": "inbox.sourceWebClip"},
            {"source": "web_clip", "i18n_key": "1nbox.source"},
            {"source": "web_clip", "i18n_key": "inbox-source"},
            {"source": "web_clip", "i18n_key": "a" * 129},
            {"source": "web_clip", "i18n_key": "inbox.source", "extra": 1},
            {"source": "web_clip"},
            {"i18n_key": "inbox.source"},
        ],
        ids=[
            "uppercase-source",
            "space-in-source",
            "empty-source",
            "source-too-long",
            "i18n-starts-with-digit",
            "i18n-has-dash",
            "i18n-too-long",
            "extra-key",
            "missing-i18n-key",
            "missing-source",
        ],
    )
    def test_create_rejects_an_invalid_arrival(self, client, arrival):
        """SPEC-ADDON-059 §2: an invalid arrival is 422 and nothing is created."""
        c, db, drive_dir, _ = client

        r = create(c, "bad.md", "x", arrival=arrival)

        assert r.status_code == 422
        assert list(drive_dir.iterdir()) == []
        assert rows(db) == []

    def test_create_accepts_the_longest_valid_arrival(self, client):
        """SPEC-ADDON-059 §1: the length bounds are inclusive."""
        c, db, drive_dir, _ = client
        arrival = {"source": "a" * 64, "i18n_key": "A" + "a" * 127}

        r = create(c, "bound.md", "x", arrival=arrival)

        assert r.status_code == 201
        assert row(db, r.json()["id"])["source"] == "a" * 64


class TestNothingElseArrives:
    def test_copy_does_not_create_a_row(self, client):
        """SPEC-CORE-032 I1: a copy is not an arrival."""
        c, db, drive_dir, _ = client
        file_id = create(c, "source.md", "x", arrival=CLIP).json()["id"]

        r = c.post(f"/api/files/{file_id}/copy", json={"target_folder_path": "copies"})

        assert r.status_code == 200
        assert rows(db, file_id=r.json()["id"]) == []
        assert row(db, file_id)["done_at"] is None

    def test_a_scan_does_not_create_a_row(self, client):
        """SPEC-CORE-032 I1: a scanner find is not an arrival."""
        c, db, drive_dir, _ = client
        (drive_dir / "scanned.txt").write_text("x")

        r = c.post(f"/api/drives/{TEST_DRIVE}/scan")

        assert r.status_code == 200
        from app.models import File

        db.expire_all()
        scanned = db.query(File).filter(File.file_path == "scanned.txt").one()
        assert rows(db, file_id=scanned.id) == []


class TestArrivalBroadcasts:
    def test_upload_with_inbox_source_broadcasts_once_for_the_drive(
        self, client, broadcasts
    ):
        """SPEC-CORE-032 I16: one inbox.updated, scoped to the drive."""
        c, db, drive_dir, _ = client

        upload(c, "arrived.txt", b"hello", inbox_source="upload")
        flush(c)

        assert only_inbox_events(broadcasts) == [
            ("inbox.updated", {"drive": TEST_DRIVE}, TEST_DRIVE)
        ]

    def test_upload_without_inbox_source_broadcasts_nothing(self, client, broadcasts):
        """SPEC-CORE-032 I16: no row changed, no event."""
        c, db, drive_dir, _ = client

        r = upload(c, "silent.txt", b"hello")
        flush(c)

        assert r.status_code == 200
        assert only_inbox_events(broadcasts) == []

    def test_create_with_arrival_broadcasts_once_for_the_drive(
        self, client, broadcasts
    ):
        """SPEC-ADDON-059 I16: a created arrival notifies the drive."""
        c, db, drive_dir, _ = client

        create(c, "clip.md", "x", arrival=CLIP)
        flush(c)

        assert only_inbox_events(broadcasts) == [
            ("inbox.updated", {"drive": TEST_DRIVE}, TEST_DRIVE)
        ]

    def test_create_without_arrival_broadcasts_nothing(self, client, broadcasts):
        """SPEC-ADDON-059 I16: no row changed, no event."""
        c, db, drive_dir, _ = client

        r = create(c, "quick-note.md", "x")
        flush(c)

        assert r.status_code == 201
        assert only_inbox_events(broadcasts) == []

