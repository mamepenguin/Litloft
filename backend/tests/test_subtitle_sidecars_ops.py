"""Sidecars follow a rename, move, copy or purge, or the operation is refused.

SPEC-CORE-184 I2, I3, I4, I5, I15, I16.
"""
from datetime import UTC, datetime, timedelta

import app.main as main
from app.models import File
from tests.conftest import TEST_DRIVE
from tests.subtitle_sidecar_helpers import (
    FIXTURES_DIR,
    detail,
    languages,
    names,
    rows,
    seed,
    sidecar,
    snapshot,
    upload,
    upload_base,
)


def _rename(c, row, name):
    return c.put(f"/api/files/{row.id}/rename", json={"new_filename": name})


def _move(c, row, folder, drive=TEST_DRIVE):
    return c.put(
        f"/api/files/{row.id}/move",
        json={"target_drive": drive, "target_folder_path": folder},
    )


class TestRenameRefusals:
    """SPEC-CORE-184 I2 (184.2): a rename is refused before anything moves."""

    def test_a_planned_name_holding_other_bytes_is_refused(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        sidecar(drive_dir, "a", "movie.ja.srt", b"mine")
        sidecar(drive_dir, "a", "film.ja.srt", b"theirs")
        before = snapshot(drive_dir / "a")
        before_rows = rows(db)

        res = _rename(c, movie, "film.mp4")

        assert res.status_code == 409
        assert detail(res) == {
            "code": "subtitle_name_taken",
            "names": ["a/film.ja.srt"],
        }
        assert snapshot(drive_dir / "a") == before
        assert rows(db) == before_rows

    def test_a_byte_identical_target_is_not_a_refusal(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        same = b"the same bytes"
        sidecar(drive_dir, "a", "movie.ja.srt", same)
        sidecar(drive_dir, "a", "film.ja.srt", same)

        res = _rename(c, movie, "film.mp4")

        assert res.status_code == 200, res.text
        assert names(drive_dir, "a") == ["film.ja.srt", "film.mp4"]
        assert (drive_dir / "a" / "film.ja.srt").read_bytes() == same
        db.expire_all()
        assert db.get(File, movie.id).filename == "film.mp4"

    def test_own_sidecars_move_under_the_new_stem_each_with_its_bytes(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        bare = sidecar(drive_dir, "a", "movie.srt", b"the bare track")
        ja = sidecar(drive_dir, "a", "movie.ja.srt", b"the japanese track")

        res = _rename(c, movie, "movie.ja.mp4")

        assert res.status_code == 200, res.text
        a = drive_dir / "a"
        assert names(drive_dir, "a") == [
            "movie.ja.ja.srt", "movie.ja.mp4", "movie.ja.srt",
        ]
        assert (a / "movie.ja.srt").read_bytes() == bare
        assert (a / "movie.ja.ja.srt").read_bytes() == ja


class TestMoveRefusals:
    """SPEC-CORE-184 I2 (184.2): a move is refused before anything moves."""

    def test_a_planned_name_holding_other_bytes_is_refused(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        sidecar(drive_dir, "a", "movie.ja.srt", b"mine")
        sidecar(drive_dir, "b", "movie.ja.srt", b"theirs")
        before = (snapshot(drive_dir / "a"), snapshot(drive_dir / "b"))
        before_rows = rows(db)

        res = _move(c, movie, "b")

        assert res.status_code == 409
        assert detail(res) == {
            "code": "subtitle_name_taken",
            "names": ["b/movie.ja.srt"],
        }
        assert (snapshot(drive_dir / "a"), snapshot(drive_dir / "b")) == before
        assert rows(db) == before_rows

    def test_landing_a_track_under_another_rows_stem_is_refused(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        seed(db, drive_dir, "movie.ja.mp4", "b")
        sidecar(drive_dir, "a", "movie.ja.srt", b"mine")
        before = (snapshot(drive_dir / "a"), snapshot(drive_dir / "b"))
        before_rows = rows(db)

        res = _move(c, movie, "b")

        assert res.status_code == 409
        assert detail(res)["code"] == "subtitle_owner_change"
        assert any(name.endswith("movie.ja.srt") for name in detail(res)["names"])
        assert (snapshot(drive_dir / "a"), snapshot(drive_dir / "b")) == before
        assert rows(db) == before_rows

    def test_a_byte_identical_target_is_not_a_refusal(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        same = b"the same bytes"
        sidecar(drive_dir, "a", "movie.ja.srt", same)
        sidecar(drive_dir, "b", "movie.ja.srt", same)

        res = _move(c, movie, "b")

        assert res.status_code == 200, res.text
        assert names(drive_dir, "a") == []
        assert names(drive_dir, "b") == ["movie.ja.srt", "movie.mp4"]
        assert (drive_dir / "b" / "movie.ja.srt").read_bytes() == same

    def test_both_owners_of_a_shared_track_move_to_one_folder(self, client):
        c, db, drive_dir, _ = client
        mp4 = seed(db, drive_dir, "movie.mp4")
        mkv = seed(db, drive_dir, "movie.mkv", mime="video/x-matroska")
        shared = sidecar(drive_dir, "a", "movie.srt", b"shared track")
        (drive_dir / "b").mkdir()

        first = _move(c, mp4, "b")
        assert first.status_code == 200, first.text
        assert names(drive_dir, "a") == ["movie.mkv", "movie.srt"]
        assert (drive_dir / "b" / "movie.srt").read_bytes() == shared

        db.expire_all()
        second = _move(c, mkv, "b")

        assert second.status_code == 200, second.text
        assert names(drive_dir, "a") == []
        assert names(drive_dir, "b") == ["movie.mkv", "movie.mp4", "movie.srt"]


class TestRenameAndMoveCarry:
    """SPEC-CORE-184 I3: carried tracks keep their bytes; other owners keep theirs."""

    def test_a_rename_copies_a_track_another_owner_keeps(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir, "movie.mp4")
        mkv = seed(db, drive_dir, "movie.mkv", mime="video/x-matroska")
        shared = sidecar(drive_dir, "a", "movie.srt", b"shared track")

        res = _rename(c, movie, "film.mp4")

        assert res.status_code == 200, res.text
        assert names(drive_dir, "a") == [
            "film.mp4", "film.srt", "movie.mkv", "movie.srt",
        ]
        assert (drive_dir / "a" / "film.srt").read_bytes() == shared
        assert (drive_dir / "a" / "movie.srt").read_bytes() == shared
        assert languages(c, mkv.id) == [""]

    def test_a_move_carries_every_own_track_byte_for_byte(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        bare = sidecar(drive_dir, "a", "movie.srt", b"bare")
        ja = sidecar(drive_dir, "a", "movie.ja.vtt", b"ja")
        sidecar(drive_dir, "a", "movie2.srt", b"not owned")

        res = _move(c, movie, "b")

        assert res.status_code == 200, res.text
        assert names(drive_dir, "b") == ["movie.ja.vtt", "movie.mp4", "movie.srt"]
        assert (drive_dir / "b" / "movie.srt").read_bytes() == bare
        assert (drive_dir / "b" / "movie.ja.vtt").read_bytes() == ja
        assert names(drive_dir, "a") == ["movie2.srt"]
        assert languages(c, movie.id) == ["", "ja"]


class TestCopyCarries:
    """SPEC-CORE-184 I4 / I15: copies take the tracks, sources stay untouched."""

    def test_a_copy_beside_the_source_takes_its_tracks(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        bare = sidecar(drive_dir, "a", "movie.srt", b"bare")
        ja = sidecar(drive_dir, "a", "movie.ja.srt", b"ja")

        res = c.post(f"/api/files/{movie.id}/copy", json={"target_folder_path": "a"})

        assert res.status_code == 200, res.text
        assert res.json()["filename"] == "movie_copy.mp4"
        assert res.json()["sidecar_errors"] == []
        a = drive_dir / "a"
        assert (a / "movie_copy.srt").read_bytes() == bare
        assert (a / "movie_copy.ja.srt").read_bytes() == ja
        assert (a / "movie.srt").read_bytes() == bare
        assert (a / "movie.ja.srt").read_bytes() == ja

    def test_a_copy_skips_a_candidate_whose_track_name_is_taken(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        bare = sidecar(drive_dir, "a", "movie.srt", b"source bytes")
        sidecar(drive_dir, "b", "movie.srt", b"someone else's")

        res = c.post(f"/api/files/{movie.id}/copy", json={"target_folder_path": "b"})

        assert res.status_code == 200, res.text
        assert res.json()["filename"] == "movie_copy.mp4"
        assert (drive_dir / "b" / "movie_copy.srt").read_bytes() == bare
        assert (drive_dir / "b" / "movie.srt").read_bytes() == b"someone else's"


class TestBatchRenameConflict:
    """SPEC-CORE-184 I2 (184.3): any sidecar clash refuses the whole batch."""

    def test_every_conflicting_planned_name_refuses_the_whole_batch(self, client):
        c, db, drive_dir, _ = client
        one = seed(db, drive_dir, "one.mp4")
        two = seed(db, drive_dir, "two.mp4")
        sidecar(drive_dir, "a", "one.srt", b"one")
        sidecar(drive_dir, "a", "two.srt", b"two")
        sidecar(drive_dir, "a", "clip_1.srt", b"theirs")
        sidecar(drive_dir, "a", "clip_2.srt", b"theirs")
        before = snapshot(drive_dir / "a")
        before_rows = rows(db)

        res = c.put(
            "/api/files/batch/rename",
            json={"ids": [one.id, two.id], "mode": "template", "template": "clip_{n}"},
        )

        assert res.status_code == 409
        assert detail(res)["code"] == "subtitle_conflict"
        assert set(detail(res)["names"]) == {"a/clip_1.srt", "a/clip_2.srt"}
        assert snapshot(drive_dir / "a") == before
        assert rows(db) == before_rows


class TestBatchMovePartial:
    """SPEC-CORE-184 I2 / I17 (184.4): one refusal leaves that file, the rest move."""

    def test_a_refused_file_stays_and_the_others_move(self, client):
        c, db, drive_dir, _ = client
        ok = seed(db, drive_dir, "ok.mp4")
        bad = seed(db, drive_dir, "bad.mp4")
        sidecar(drive_dir, "a", "ok.srt", b"ok")
        sidecar(drive_dir, "a", "bad.srt", b"bad")
        sidecar(drive_dir, "b", "bad.srt", b"theirs")

        res = c.put(
            "/api/files/batch/move",
            json={
                "ids": [ok.id, bad.id],
                "target_drive": TEST_DRIVE,
                "target_folder_path": "b",
            },
        )

        assert res.status_code == 200, res.text
        body = res.json()
        assert body["moved"] == 1
        assert body["errors"] == [
            {
                "id": bad.id,
                "error": "subtitle_name_taken",
                "names": ["b/bad.srt"],
            }
        ]
        assert names(drive_dir, "a") == ["bad.mp4", "bad.srt"]
        assert names(drive_dir, "b") == ["bad.srt", "ok.mp4", "ok.srt"]


class TestUploadOwnerChange:
    """SPEC-CORE-184 I2 (184.6): a video upload that would take a track is refused."""

    def test_a_video_upload_that_would_take_a_track_is_refused(self, client):
        c, db, drive_dir, _ = client
        seed(db, drive_dir, "movie.mp4")
        sidecar(drive_dir, "a", "movie.ja.srt", b"owned by movie.mp4")
        before = snapshot(drive_dir / "a")

        res = upload_base(c, TEST_DRIVE, "a", "movie.ja.mp4", 10)

        assert res.status_code == 409
        assert detail(res)["code"] == "subtitle_owner_change"
        assert snapshot(drive_dir / "a") == before

    def test_a_video_arriving_after_its_orphan_subtitle_succeeds(self, client):
        c, db, drive_dir, _ = client
        sidecar(drive_dir, "a", "movie.srt", b"waiting for its video")
        body = (FIXTURES_DIR / "short_video.mp4").read_bytes()

        done = upload(c, TEST_DRIVE, "a", "movie.mp4", body)

        assert done.status_code == 200, done.text
        assert (drive_dir / "a" / "movie.mp4").exists()
        assert (drive_dir / "a" / "movie.srt").read_bytes() == b"waiting for its video"


class TestPurgeDeletesOwnSidecars:
    """SPEC-CORE-184 I5 (184.8): a purge deletes the tracks only the row owns."""

    def test_a_single_purge_takes_the_unshared_tracks(self, client):
        c, db, drive_dir, _ = client
        doomed = seed(db, drive_dir, "movie.mp4", deleted_at=datetime.now(UTC))
        sidecar(drive_dir, "a", "movie.srt", b"bare")
        sidecar(drive_dir, "a", "movie.ja.srt", b"ja")

        res = c.delete(f"/api/files/{doomed.id}/purge")

        assert res.status_code == 200, res.text
        assert names(drive_dir, "a") == []

    def test_a_track_another_same_stem_row_owns_stays(self, client):
        c, db, drive_dir, _ = client
        doomed = seed(db, drive_dir, "movie.mp4", deleted_at=datetime.now(UTC))
        kept = seed(db, drive_dir, "movie.mkv", mime="video/x-matroska")
        sidecar(drive_dir, "a", "movie.srt", b"shared")

        c.delete(f"/api/files/{doomed.id}/purge")

        assert names(drive_dir, "a") == ["movie.mkv", "movie.srt"]
        assert languages(c, kept.id) == [""]

    def test_a_longer_stem_track_goes_with_its_owner(self, client):
        c, db, drive_dir, _ = client
        seed(db, drive_dir, "movie.mp4")
        doomed = seed(db, drive_dir, "movie.ja.mp4", deleted_at=datetime.now(UTC))
        sidecar(drive_dir, "a", "movie.srt", b"the shorter stem's")
        sidecar(drive_dir, "a", "movie.ja.srt", b"the longer stem's")

        res = c.delete(f"/api/files/{doomed.id}/purge")

        assert res.status_code == 200, res.text
        assert names(drive_dir, "a") == ["movie.mp4", "movie.srt"]

    def test_a_batch_purge_takes_each_rows_tracks(self, client):
        c, db, drive_dir, _ = client
        first = seed(db, drive_dir, "one.mp4", deleted_at=datetime.now(UTC))
        second = seed(db, drive_dir, "two.mp4", deleted_at=datetime.now(UTC))
        sidecar(drive_dir, "a", "one.srt", b"one")
        sidecar(drive_dir, "a", "two.ja.srt", b"two")

        res = c.post(
            "/api/files/batch/purge", json={"ids": [first.id, second.id]}
        )

        assert res.status_code == 200, res.text
        assert res.json()["purged"] == 2
        assert names(drive_dir, "a") == []

    def test_empty_trash_takes_a_track_its_two_owners_shared(self, client):
        c, db, drive_dir, _ = client
        seed(db, drive_dir, "movie.mp4", deleted_at=datetime.now(UTC))
        seed(
            db, drive_dir, "movie.mkv", mime="video/x-matroska",
            deleted_at=datetime.now(UTC),
        )
        sidecar(drive_dir, "a", "movie.srt", b"shared")

        res = c.post(f"/api/drives/{TEST_DRIVE}/trash/empty")

        assert res.status_code == 200, res.text
        assert res.json()["purged"] == 2
        assert names(drive_dir, "a") == []

    def test_the_auto_purge_takes_the_tracks_after_the_row_commits(self, client):
        c, db, drive_dir, _ = client
        seed(
            db, drive_dir, "movie.mp4",
            deleted_at=datetime.now(UTC) - timedelta(days=31),
        )
        sidecar(drive_dir, "a", "movie.srt", b"bare")

        purged, _folders, drives = main._run_purge_batch(
            datetime.now(UTC) - timedelta(days=main.TRASH_RETENTION_DAYS)
        )

        assert purged
        assert drives == {TEST_DRIVE}
        assert names(drive_dir, "a") == []


class TestPurgesThatLeaveSidecars:
    """SPEC-CORE-184 I5: trash, restore and a missing purge touch no track."""

    def test_trash_and_restore_leave_the_tracks(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        sidecar(drive_dir, "a", "movie.srt", b"bare")

        assert c.delete(f"/api/files/{movie.id}").status_code == 200
        assert names(drive_dir, "a") == ["movie.mp4", "movie.srt"]

        assert c.post(f"/api/files/{movie.id}/restore").status_code == 200
        assert names(drive_dir, "a") == ["movie.mp4", "movie.srt"]
        assert languages(c, movie.id) == [""]

    def test_purging_a_missing_video_leaves_the_tracks(self, client):
        c, db, drive_dir, _ = client
        ghost = seed(
            db, drive_dir, "gone.mp4", missing_since=datetime.now(UTC), write=False,
        )
        sidecar(drive_dir, "a", "gone.srt", b"still wanted")

        res = c.delete(f"/api/files/{ghost.id}/purge")

        assert res.status_code == 200, res.text
        assert names(drive_dir, "a") == ["gone.srt"]

    def test_purging_all_missing_leaves_the_tracks(self, client):
        c, db, drive_dir, _ = client
        for name in ("one.mp4", "two.mp4"):
            seed(
                db, drive_dir, name, missing_since=datetime.now(UTC), write=False,
            )
            sidecar(drive_dir, "a", name.replace(".mp4", ".srt"), b"still wanted")

        res = c.post(f"/api/drives/{TEST_DRIVE}/missing/purge-all")

        assert res.status_code == 200, res.text
        assert res.json()["purged"] == 2
        assert names(drive_dir, "a") == ["one.srt", "two.srt"]


class TestOperationResponses:
    """SPEC-CORE-184 I16: an operation with no failure answers an empty list."""

    def test_single_file_operations_report_no_sidecar_errors(self, client):
        c, db, drive_dir, _ = client
        renamed = seed(db, drive_dir, "one.mp4")
        moved = seed(db, drive_dir, "two.mp4")
        copied = seed(db, drive_dir, "three.mp4")
        sidecar(drive_dir, "a", "one.srt", b"one")
        sidecar(drive_dir, "a", "two.srt", b"two")
        sidecar(drive_dir, "a", "three.srt", b"three")
        (drive_dir / "b").mkdir()

        assert _rename(c, renamed, "one_renamed.mp4").json()["sidecar_errors"] == []
        assert _move(c, moved, "b").json()["sidecar_errors"] == []
        assert c.post(
            f"/api/files/{copied.id}/copy", json={"target_folder_path": "b"}
        ).json()["sidecar_errors"] == []

    def test_batch_operations_report_no_sidecar_errors(self, client):
        c, db, drive_dir, _ = client
        for name in ("a", "b", "c"):
            seed(db, drive_dir, f"{name}.mp4")
            sidecar(drive_dir, "a", f"{name}.srt", name.encode())
        ids = [r.id for r in db.query(File).all() if r.filename.endswith(".mp4")]
        (drive_dir / "dest").mkdir()

        renamed = c.put(
            "/api/files/batch/rename",
            json={"ids": ids, "mode": "template", "template": "clip_{n}"},
        )
        assert renamed.status_code == 200, renamed.text
        assert renamed.json()["sidecar_errors"] == []

        db.expire_all()
        ids = [r.id for r in db.query(File).all() if r.filename.endswith(".mp4")]
        moved = c.put(
            "/api/files/batch/move",
            json={"ids": ids, "target_drive": TEST_DRIVE, "target_folder_path": "dest"},
        )
        assert moved.status_code == 200, moved.text
        assert moved.json()["sidecar_errors"] == []

        copied = c.post(
            "/api/files/batch/copy",
            json={"ids": ids, "target_drive": TEST_DRIVE, "target_folder_path": "a"},
        )
        assert copied.status_code == 200, copied.text
        assert copied.json()["sidecar_errors"] == []
