"""SPEC-CORE-026: storage and read of played segments."""

import json
import shutil
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"

ALICE = {"lit_viewer": "alice"}
BOB = {"lit_viewer": "bob"}


def _seed_file(db, drive_dir, filename="test.mp4", folder="旅行"):
    folder_dir = drive_dir / folder
    folder_dir.mkdir(exist_ok=True)
    shutil.copy(FIXTURES_DIR / "short_video.mp4", folder_dir / filename)

    from app.models import File

    file = File(
        filename=filename,
        title=filename.rsplit(".", 1)[0],
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=f"{folder}/{filename}",
        file_size=folder_dir.joinpath(filename).stat().st_size,
        file_type="video",
        mime_type="video/mp4",
        duration=120.0,
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


def _post(c, file_id, ranges, cookies=ALICE):
    return c.post(
        f"/api/files/{file_id}/played-ranges",
        json={"ranges": ranges},
        cookies=cookies,
    )


def _get(c, file_id, cookies=ALICE):
    return c.get(f"/api/files/{file_id}/played-segments", cookies=cookies)


def _segments(c, file_id, cookies=ALICE):
    res = _get(c, file_id, cookies)
    assert res.status_code == 200
    return res.json()


def _row_count(db, file_id=None):
    db.expire_all()
    if file_id is None:
        return db.execute(text("SELECT COUNT(*) FROM played_segments")).scalar()
    return db.execute(
        text("SELECT COUNT(*) FROM played_segments WHERE file_id = :f"),
        {"f": file_id},
    ).scalar()


def _seg(index, seconds):
    return {"index": index, "played_seconds": seconds}


class TestSplitAndRead:
    def test_worked_example_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)

        res = _post(c, file.id, [{"start": 12, "end": 47.5}])
        assert res.status_code == 204

        assert _segments(c, file.id) == {
            "segment_seconds": 5,
            "segments": [
                _seg(2, 3.0),
                _seg(3, 5.0),
                _seg(4, 5.0),
                _seg(5, 5.0),
                _seg(6, 5.0),
                _seg(7, 5.0),
                _seg(8, 5.0),
                _seg(9, 2.5),
            ],
        }

    @pytest.mark.parametrize(
        "rng, expected",
        [
            ({"start": 1, "end": 2}, [_seg(0, 1.0)]),
            ({"start": 0, "end": 5}, [_seg(0, 5.0)]),
            ({"start": 5, "end": 10}, [_seg(1, 5.0)]),
            ({"start": 4.5, "end": 5.5}, [_seg(0, 0.5), _seg(1, 0.5)]),
            ({"start": 604795, "end": 604800}, [_seg(120959, 5.0)]),
        ],
    )
    def test_segment_boundaries_spec_core_026(self, client, rng, expected):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        assert _post(c, file.id, [rng]).status_code == 204
        assert _segments(c, file.id) == {"segment_seconds": 5, "segments": expected}

    def test_every_range_in_a_request_adds_its_length_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        assert _post(c, file.id, [{"start": 0, "end": 3}, {"start": 2, "end": 5}]).status_code == 204
        assert _segments(c, file.id)["segments"] == [_seg(0, 6.0)]

    def test_same_range_twice_doubles_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        for _ in range(2):
            assert _post(c, file.id, [{"start": 12, "end": 47.5}]).status_code == 204
        segments = _segments(c, file.id)["segments"]
        assert segments[0] == _seg(2, 6.0)
        assert segments[-1] == _seg(9, 5.0)
        assert [s["played_seconds"] for s in segments[1:-1]] == [10.0] * 6

    def test_segments_ascend_by_index_whatever_the_send_order_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        _post(c, file.id, [{"start": 50, "end": 55}])
        _post(c, file.id, [{"start": 0, "end": 5}, {"start": 20, "end": 21}])
        assert [s["index"] for s in _segments(c, file.id)["segments"]] == [0, 4, 10]

    def test_unknown_fields_are_ignored_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/played-ranges",
            json={"ranges": [{"start": 0, "end": 5, "rate": 2}], "client": "web"},
            cookies=ALICE,
        )
        assert res.status_code == 204
        assert _segments(c, file.id)["segments"] == [_seg(0, 5.0)]

    def test_exactly_256_ranges_is_accepted_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        ranges = [{"start": i * 5, "end": i * 5 + 1} for i in range(256)]
        assert _post(c, file.id, ranges).status_code == 204
        segments = _segments(c, file.id)["segments"]
        assert len(segments) == 256
        assert all(s["played_seconds"] == 1.0 for s in segments)

    def test_concurrent_requests_lose_no_addition_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        n = 16

        def send(_):
            return _post(c, file.id, [{"start": 0, "end": 1}]).status_code

        with ThreadPoolExecutor(max_workers=8) as pool:
            statuses = list(pool.map(send, range(n)))

        assert statuses == [204] * n
        assert _segments(c, file.id)["segments"] == [_seg(0, float(n))]


class TestViewerScope:
    def test_get_returns_only_the_requesting_viewers_totals_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        _post(c, file.id, [{"start": 0, "end": 5}], cookies=ALICE)
        _post(c, file.id, [{"start": 0, "end": 2}, {"start": 10, "end": 15}], cookies=BOB)

        assert _segments(c, file.id, ALICE)["segments"] == [_seg(0, 5.0)]
        assert _segments(c, file.id, BOB)["segments"] == [_seg(0, 2.0), _seg(2, 5.0)]

    def test_get_returns_only_this_files_totals_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        a = _seed_file(db, drive_dir, filename="a.mp4")
        b = _seed_file(db, drive_dir, filename="b.mp4")
        _post(c, a.id, [{"start": 0, "end": 5}])
        _post(c, b.id, [{"start": 20, "end": 25}])
        assert _segments(c, a.id)["segments"] == [_seg(0, 5.0)]
        assert _segments(c, b.id)["segments"] == [_seg(4, 5.0)]

    def test_no_viewer_post_returns_204_and_writes_nothing_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/played-ranges",
            json={"ranges": [{"start": 0, "end": 5}]},
        )
        assert res.status_code == 204
        assert _row_count(db) == 0
        # Control: the same body from a viewer is stored.
        assert _post(c, file.id, [{"start": 0, "end": 5}]).status_code == 204
        assert _row_count(db) == 1

    def test_no_viewer_get_returns_empty_segments_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        _post(c, file.id, [{"start": 0, "end": 5}])
        res = c.get(f"/api/files/{file.id}/played-segments")
        assert res.status_code == 200
        assert res.json() == {"segment_seconds": 5, "segments": []}

    def test_viewer_with_nothing_played_gets_empty_segments_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        assert _segments(c, file.id) == {"segment_seconds": 5, "segments": []}


class TestValidation:
    @pytest.mark.parametrize(
        "body",
        [
            {"ranges": []},
            {"ranges": [{"start": i * 5, "end": i * 5 + 1} for i in range(257)]},
            {"ranges": [{"start": -1, "end": 5}]},
            {"ranges": [{"start": 5, "end": 5}]},
            {"ranges": [{"start": 6, "end": 5}]},
            {"ranges": [{"start": 0, "end": 604800.5}]},
            {"ranges": [{"start": 0, "end": 5}, {"start": 6, "end": 5}]},
            {"ranges": [{"start": 0}]},
            {"ranges": [{"start": "a", "end": 5}]},
            {},
        ],
        ids=[
            "zero-ranges",
            "257-ranges",
            "negative-start",
            "zero-length",
            "reversed",
            "past-7-days",
            "one-bad-among-good",
            "missing-end",
            "non-numeric",
            "no-ranges",
        ],
    )
    def test_invalid_body_is_422_and_writes_nothing_spec_core_026(self, client, body):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        res = c.post(f"/api/files/{file.id}/played-ranges", json=body, cookies=ALICE)
        assert res.status_code == 422
        assert _row_count(db) == 0

    @pytest.mark.parametrize("token", ["NaN", "Infinity", "-Infinity"])
    def test_non_finite_number_is_422_spec_core_026(self, client, token):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        res = c.post(
            f"/api/files/{file.id}/played-ranges",
            content=f'{{"ranges": [{{"start": 0, "end": 5}}, {{"start": 1, "end": {token}}}]}}',
            headers={"Content-Type": "application/json"},
            cookies=ALICE,
        )
        assert res.status_code == 422
        assert _row_count(db) == 0


class TestPrecedenceAndAvailability:
    def test_invalid_body_wins_over_no_viewer_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        res = c.post(f"/api/files/{file.id}/played-ranges", json={"ranges": []})
        assert res.status_code == 422

    def test_invalid_body_wins_over_unknown_file_spec_core_026(self, client):
        c, *_ = client
        res = c.post(
            "/api/files/zzNOTFOUNDzz/played-ranges",
            json={"ranges": []},
            cookies=ALICE,
        )
        assert res.status_code == 422

    def test_no_viewer_wins_over_unknown_file_on_post_spec_core_026(self, client):
        c, *_ = client
        res = c.post(
            "/api/files/zzNOTFOUNDzz/played-ranges",
            json={"ranges": [{"start": 0, "end": 5}]},
        )
        assert res.status_code == 204

    def test_unknown_file_wins_over_no_viewer_on_get_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        # Control: the route answers for an available file without a viewer.
        assert c.get(f"/api/files/{file.id}/played-segments").status_code == 200
        assert c.get("/api/files/zzNOTFOUNDzz/played-segments").status_code == 404

    def test_unknown_file_is_404_for_a_viewer_spec_core_026(self, client):
        c, db, *_ = client
        assert _post(c, "zzNOTFOUNDzz", [{"start": 0, "end": 5}]).status_code == 404
        assert _get(c, "zzNOTFOUNDzz").status_code == 404
        assert _row_count(db) == 0

    @pytest.mark.parametrize("state", ["trash", "missing"])
    def test_unavailable_file_is_404_and_writes_nothing_spec_core_026(self, client, state):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        assert _post(c, file.id, [{"start": 0, "end": 5}]).status_code == 204
        file_id = file.id

        if state == "trash":
            assert c.delete(f"/api/files/{file_id}").status_code == 200
        else:
            file.missing_since = datetime.now(UTC)
            db.commit()

        assert _post(c, file_id, [{"start": 10, "end": 15}]).status_code == 404
        assert _get(c, file_id).status_code == 404
        assert _row_count(db, file_id) == 1

    def test_locked_drive_is_404_and_writes_nothing_spec_core_026(self, client, tmp_path):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        assert _post(c, file.id, [{"start": 0, "end": 5}]).status_code == 204

        import app.auth as auth
        import app.config as config

        drives_json = tmp_path / "drives_protected.json"
        drives_json.write_text(json.dumps([
            {"name": TEST_DRIVE, "path": str(drive_dir), "access_group": "private"}
        ]))
        config._drives_cache = None
        config.DRIVES_CONFIG = drives_json
        pw_file = tmp_path / "passwords.json"
        pw_file.write_text(json.dumps([{"password": "secret123", "groups": ["private"]}]))
        auth._passwords_cache = None
        orig_pw_config = auth.PASSWORDS_CONFIG
        auth.PASSWORDS_CONFIG = pw_file
        auth.load_passwords()
        try:
            assert _post(c, file.id, [{"start": 10, "end": 15}]).status_code == 404
            assert _get(c, file.id).status_code == 404
            assert c.get(f"/api/files/{file.id}/played-segments").status_code == 404
        finally:
            auth.PASSWORDS_CONFIG = orig_pw_config
            auth._passwords_cache = None
        assert _row_count(db, file.id) == 1


class TestWatchHistoryUntouched:
    def test_post_and_get_leave_watch_history_as_it_was_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        c.post(
            f"/api/files/{file.id}/progress",
            json={"position": 30.0, "duration": 120.0},
            cookies=ALICE,
        )
        db.expire_all()
        before = db.execute(
            text("SELECT playback_position, duration, last_played_at FROM watch_history")
        ).all()

        assert _post(c, file.id, [{"start": 40, "end": 60}]).status_code == 204
        _segments(c, file.id)

        db.expire_all()
        after = db.execute(
            text("SELECT playback_position, duration, last_played_at FROM watch_history")
        ).all()
        assert after == before

    def test_post_creates_no_watch_history_row_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        assert _post(c, file.id, [{"start": 0, "end": 5}]).status_code == 204
        _segments(c, file.id)
        db.expire_all()
        assert db.execute(text("SELECT COUNT(*) FROM watch_history")).scalar() == 0
        assert c.get(f"/api/files/{file.id}/progress", cookies=ALICE).json() == {
            "position": 0,
            "duration": 0,
        }


class TestTransactionFailure:
    def test_failed_write_is_500_and_writes_nothing_from_the_body_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        db.execute(text(
            "CREATE TRIGGER fail_segment_3 BEFORE INSERT ON played_segments "
            "WHEN NEW.segment_index = 3 BEGIN SELECT RAISE(ABORT, 'injected'); END"
        ))
        db.commit()

        quiet = TestClient(c.app, raise_server_exceptions=False)
        res = quiet.post(
            f"/api/files/{file.id}/played-ranges",
            json={"ranges": [{"start": 0, "end": 20}]},
            cookies=ALICE,
        )
        assert res.status_code == 500
        assert _row_count(db) == 0


class TestDeleteProgress:
    def test_delete_removes_only_this_viewers_rows_for_this_file_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        a = _seed_file(db, drive_dir, filename="a.mp4")
        b = _seed_file(db, drive_dir, filename="b.mp4")
        c.post(f"/api/files/{a.id}/progress", json={"position": 30.0, "duration": 120.0}, cookies=ALICE)
        _post(c, a.id, [{"start": 0, "end": 10}], cookies=ALICE)
        _post(c, b.id, [{"start": 0, "end": 5}], cookies=ALICE)
        _post(c, a.id, [{"start": 0, "end": 5}], cookies=BOB)

        assert c.delete(f"/api/files/{a.id}/progress", cookies=ALICE).status_code == 204

        assert _segments(c, a.id, ALICE)["segments"] == []
        assert _segments(c, b.id, ALICE)["segments"] == [_seg(0, 5.0)]
        assert _segments(c, a.id, BOB)["segments"] == [_seg(0, 5.0)]
        assert c.get(f"/api/files/{a.id}/progress", cookies=ALICE).json() == {
            "position": 0,
            "duration": 0,
        }

    def test_delete_removes_rows_when_no_watch_history_row_exists_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        _post(c, file.id, [{"start": 0, "end": 10}])
        assert c.delete(f"/api/files/{file.id}/progress", cookies=ALICE).status_code == 204
        assert _segments(c, file.id)["segments"] == []
        assert _row_count(db) == 0

    @pytest.mark.parametrize(
        "table",
        ["played_segments", "watch_history"],
    )
    def test_a_failed_delete_is_500_and_removes_neither_spec_core_026(self, client, table):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        c.post(f"/api/files/{file.id}/progress", json={"position": 30.0, "duration": 120.0}, cookies=ALICE)
        _post(c, file.id, [{"start": 0, "end": 10}])
        db.execute(text(
            f"CREATE TRIGGER fail_delete BEFORE DELETE ON {table} "
            "BEGIN SELECT RAISE(ABORT, 'injected'); END"
        ))
        db.commit()

        quiet = TestClient(c.app, raise_server_exceptions=False)
        res = quiet.delete(f"/api/files/{file.id}/progress", cookies=ALICE)
        assert res.status_code == 500

        db.expire_all()
        assert db.execute(text("SELECT COUNT(*) FROM watch_history")).scalar() == 1
        assert _row_count(db, file.id) == 2


class TestLifecycle:
    def test_hard_delete_removes_the_files_rows_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        a = _seed_file(db, drive_dir, filename="a.mp4")
        b = _seed_file(db, drive_dir, filename="b.mp4")
        a_id = a.id
        _post(c, a_id, [{"start": 0, "end": 10}])
        _post(c, b.id, [{"start": 0, "end": 5}])
        assert _row_count(db, a_id) == 2

        assert c.delete(f"/api/files/{a_id}").status_code == 200
        assert c.delete(f"/api/files/{a_id}/purge").status_code == 200

        assert _row_count(db, a_id) == 0
        assert _segments(c, b.id)["segments"] == [_seg(0, 5.0)]

    def test_trash_then_restore_keeps_the_rows_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        _post(c, file.id, [{"start": 12, "end": 47.5}])
        before = _segments(c, file.id)

        assert c.delete(f"/api/files/{file.id}").status_code == 200
        assert _get(c, file.id).status_code == 404
        assert c.post(f"/api/files/{file.id}/restore").status_code == 200

        assert _segments(c, file.id) == before

    def test_missing_then_recovery_keeps_the_rows_spec_core_026(self, client):
        from app.services.scanner import _scan_and_register

        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        _post(c, file.id, [{"start": 12, "end": 47.5}])
        before = _segments(c, file.id)

        target = drive_dir / "旅行" / "test.mp4"
        held = target.read_bytes()
        target.unlink()
        _scan_and_register(db, TEST_DRIVE)
        assert _get(c, file.id).status_code == 404

        target.write_bytes(held)
        _scan_and_register(db, TEST_DRIVE)

        assert _segments(c, file.id) == before

    def test_rename_and_move_keep_the_rows_spec_core_026(self, client):
        c, db, drive_dir, _ = client
        file = _seed_file(db, drive_dir)
        _post(c, file.id, [{"start": 12, "end": 47.5}])
        before = _segments(c, file.id)
        assert before["segments"]

        res = c.put(f"/api/files/{file.id}/rename", json={"new_filename": "renamed.mp4"})
        assert res.status_code == 200
        assert _segments(c, file.id) == before

        (drive_dir / "料理").mkdir(exist_ok=True)
        res = c.put(f"/api/files/{file.id}/move", json={"target_folder_path": "料理"})
        assert res.status_code == 200
        assert _segments(c, file.id) == before
