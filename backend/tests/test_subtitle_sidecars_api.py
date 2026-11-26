"""The Subtitles list's add, replace and delete endpoints.

SPEC-CORE-185 I6, I7, I8, I20.
"""
from datetime import UTC, datetime

import pytest

from tests.conftest import TEST_DRIVE
from tests.subtitle_sidecar_helpers import (
    LOFT_MIME,
    SRT,
    TOO_LARGE,
    VTT,
    add_subtitle,
    delete_subtitle,
    detail,
    filenames,
    names,
    replace_subtitle,
    seed,
    sidecar,
    snapshot,
    upload_and_complete,
    upload_base,
)
from tests.test_target_drive_access import (  # noqa: F401  (fixture)
    LOCKED_DRIVE,
    OPEN_DRIVE,
    two_drives,
)

NOT_UTF8 = b"\xff\xfe\x00bad bytes"


class TestAdd:
    """SPEC-CORE-185 I6 (185.2): add writes beside the video, under its stem."""

    def test_the_answer_describes_the_track_it_wrote(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)

        res = add_subtitle(c, movie.id, SRT.encode(), "picked.srt", "ja")

        assert res.status_code == 201, res.text
        [track] = res.json()["subtitles"]
        mtime = (drive_dir / "a" / "movie.ja.srt").stat().st_mtime_ns
        assert track["filename"] == "movie.ja.srt"
        assert track["language"] == "ja"
        assert track["shared_with"] == 0
        assert track["version"] == str(mtime)

    def test_a_language_is_lowercased_in_the_file_name(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)

        res = add_subtitle(c, movie.id, SRT.encode(), "picked.srt", "JA")

        assert res.status_code == 201, res.text
        assert names(drive_dir, "a") == ["movie.ja.srt", "movie.mp4"]

    def test_a_bare_track_is_named_after_the_video(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)

        res = add_subtitle(c, movie.id, SRT.encode(), "picked.srt", "")

        assert res.status_code == 201, res.text
        assert names(drive_dir, "a") == ["movie.mp4", "movie.srt"]
        assert res.json()["subtitles"][0]["filename"] == "movie.srt"

    def test_the_listed_tracks_keep_the_bare_track_first(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)

        add_subtitle(c, movie.id, VTT.encode(), "picked.vtt", "ja")
        add_subtitle(c, movie.id, SRT.encode(), "picked.srt", "")

        assert filenames(c, movie.id) == ["movie.srt", "movie.ja.vtt"]


class TestLanguageRefusals:
    """SPEC-CORE-185 I6 (185.5): one track per language, codes validated."""

    @pytest.mark.parametrize("language", ["j", "abcd", "j1", "日本語"])
    def test_a_language_that_is_not_two_or_three_letters_is_400(
        self, client, language
    ):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)

        res = add_subtitle(c, movie.id, SRT.encode(), "picked.srt", language)

        assert res.status_code == 400
        assert detail(res)["code"] == "subtitle_language"
        assert names(drive_dir, "a") == ["movie.mp4"]

    @pytest.mark.parametrize(
        ("language", "filename"),
        [("ja", "picked.srt"), ("jpn", "picked.srt"),
         ("ja", "picked.vtt"), ("jpn", "picked.vtt")],
        ids=["ja", "jpn", "ja-vtt", "jpn-vtt"],
    )
    def test_a_taken_language_is_refused_whatever_its_spelling_or_format(
        self, client, language, filename
    ):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        sidecar(drive_dir, "a", "movie.ja.srt", b"already here")

        res = add_subtitle(c, movie.id, VTT.encode(), filename, language)

        assert res.status_code == 409
        assert detail(res)["code"] == "subtitle_language_taken"
        assert names(drive_dir, "a") == ["movie.ja.srt", "movie.mp4"]

    def test_an_extension_that_is_not_srt_or_vtt_is_400(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)

        res = add_subtitle(c, movie.id, b"not a subtitle", "picked.txt", "ja")

        assert res.status_code == 400
        assert detail(res)["code"] == "subtitle_extension"
        assert names(drive_dir, "a") == ["movie.mp4"]


class TestReplace:
    """SPEC-CORE-185 I6 / I7 (185.3): replace writes under the row's name."""

    def test_a_replaced_track_takes_the_picked_extension(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        sidecar(drive_dir, "a", "movie.ja.srt", b"old")

        res = replace_subtitle(c, movie.id, "movie.ja.srt", VTT.encode(), "picked.vtt")

        assert res.status_code == 200, res.text
        assert res.json()["sidecar_errors"] == []
        assert names(drive_dir, "a") == ["movie.ja.vtt", "movie.mp4"]
        assert (drive_dir / "a" / "movie.ja.vtt").read_bytes() == VTT.encode()
        assert res.json()["subtitles"][0]["filename"] == "movie.ja.vtt"

    def test_a_same_extension_replace_keeps_the_name(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        sidecar(drive_dir, "a", "movie.ja.srt", b"old")

        res = replace_subtitle(c, movie.id, "movie.ja.srt", SRT.encode(), "picked.srt")

        assert res.status_code == 200, res.text
        assert names(drive_dir, "a") == ["movie.ja.srt", "movie.mp4"]
        assert (drive_dir / "a" / "movie.ja.srt").read_bytes() == SRT.encode()

    def test_a_language_the_video_already_has_is_refused_without_touching_the_old(
        self, client
    ):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        sidecar(drive_dir, "a", "movie.ja.srt", b"old srt")
        sidecar(drive_dir, "a", "movie.ja.vtt", b"old vtt")
        before = snapshot(drive_dir / "a")

        res = replace_subtitle(c, movie.id, "movie.ja.srt", VTT.encode(), "picked.vtt")

        assert res.status_code == 409
        assert detail(res)["code"] == "subtitle_language_taken"
        assert snapshot(drive_dir / "a") == before

    @pytest.mark.parametrize("name", ["other.ja.srt", "../x.srt", "movie.en.srt"])
    def test_a_name_that_is_not_an_own_track_is_404(self, client, name):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        seed(db, drive_dir, "other.mp4")
        sidecar(drive_dir, "a", "other.ja.srt", b"other video's")
        sidecar(drive_dir, "a", "movie.ja.srt", b"mine")
        _assert_live(c, db, drive_dir, "put")
        before = snapshot(drive_dir / "a")

        res = replace_subtitle(c, movie.id, name, VTT.encode(), "picked.vtt")

        assert res.status_code == 404
        assert snapshot(drive_dir / "a") == before
        assert not (drive_dir / "x.srt").exists()


class TestDelete:
    """SPEC-CORE-185 I6 (185.4): delete removes exactly the named own track."""

    def test_delete_removes_the_named_file(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        sidecar(drive_dir, "a", "movie.ja.srt", b"mine")

        res = delete_subtitle(c, movie.id, "movie.ja.srt")

        assert res.status_code == 200, res.text
        assert names(drive_dir, "a") == ["movie.mp4"]
        assert res.json()["subtitles"] == []

    @pytest.mark.parametrize("name", ["other.ja.srt", "movie.en.srt", "../x.srt"])
    def test_a_name_that_is_not_an_own_track_is_404(self, client, name):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        seed(db, drive_dir, "other.mp4")
        sidecar(drive_dir, "a", "other.ja.srt", b"other video's")
        sidecar(drive_dir, "a", "movie.ja.srt", b"mine")
        _assert_live(c, db, drive_dir, "delete")
        before = snapshot(drive_dir / "a")

        res = delete_subtitle(c, movie.id, name)

        assert res.status_code == 404
        assert snapshot(drive_dir / "a") == before


def _seed_state(db, drive_dir, state):
    if state == "document":
        return seed(db, drive_dir, "note.md", file_type="document",
                    mime="text/markdown")
    if state == "loft":
        return seed(db, drive_dir, "show.loft", file_type="document", mime=LOFT_MIME)
    if state == "trashed":
        return seed(db, drive_dir, "movie.mp4", deleted_at=datetime.now(UTC))
    if state == "missing":
        return seed(db, drive_dir, "movie.mp4", missing_since=datetime.now(UTC),
                    write=False)
    raise AssertionError(state)


def _call(c, method, file_id, name="movie.srt"):
    if method == "post":
        return add_subtitle(c, file_id, SRT.encode(), "picked.srt", "ja")
    if method == "put":
        return replace_subtitle(c, file_id, name, VTT.encode(), "picked.vtt")
    return delete_subtitle(c, file_id, name)


def _assert_live(c, db, drive_dir, method, folder="a", drive=TEST_DRIVE):
    """A successful call on a plain active video, to prove the route exists."""
    live = seed(db, drive_dir, "live.mp4", folder, drive=drive)
    sidecar(drive_dir, folder, "live.srt", b"live")
    res = _call(c, method, live.id, "live.srt")
    assert res.status_code in (200, 201), res.text


@pytest.mark.parametrize("method", ["post", "put", "delete"])
class TestRowsWithoutASubtitlesList:
    """SPEC-CORE-185 I20: only an active video row has these endpoints."""

    @pytest.mark.parametrize("state", ["document", "loft", "trashed", "missing"])
    def test_a_non_video_trashed_or_missing_row_answers_404(
        self, client, method, state
    ):
        c, db, drive_dir, _ = client
        _assert_live(c, db, drive_dir, method)
        row = _seed_state(db, drive_dir, state)
        before = snapshot(drive_dir / "a")

        res = _call(c, method, row.id)

        assert res.status_code == 404
        assert snapshot(drive_dir / "a") == before


class TestLockedDrive:
    """SPEC-CORE-185 I20: a locked drive answers 404 for all three endpoints."""

    @pytest.mark.parametrize("method", ["post", "put", "delete"])
    def test_the_locked_drives_video_has_no_subtitles_endpoints(
        self, two_drives, method
    ):
        c, db, open_dir, locked_dir = two_drives
        _assert_live(c, db, open_dir, method, drive=OPEN_DRIVE)
        row = seed(db, locked_dir, "movie.mp4", drive=LOCKED_DRIVE)
        sidecar(locked_dir, "a", "movie.ja.srt", b"mine")
        before = snapshot(locked_dir / "a")

        assert _call(c, method, row.id).status_code == 404

        assert snapshot(locked_dir / "a") == before


class TestUploadChecks:
    """SPEC-CORE-185 I8: nothing too large or not UTF-8 lands on disk."""

    def test_an_add_over_the_limit_is_413(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)

        res = add_subtitle(c, movie.id, b"x" * TOO_LARGE, "picked.srt", "ja")

        assert res.status_code == 413
        assert detail(res)["code"] == "subtitle_too_large"
        assert names(drive_dir, "a") == ["movie.mp4"]

    def test_a_replace_over_the_limit_leaves_the_old_bytes(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        sidecar(drive_dir, "a", "movie.ja.srt", b"old")

        res = replace_subtitle(c, movie.id, "movie.ja.srt", b"x" * TOO_LARGE)

        assert res.status_code == 413
        assert detail(res)["code"] == "subtitle_too_large"
        assert (drive_dir / "a" / "movie.ja.srt").read_bytes() == b"old"

    def test_a_subtitle_upload_init_over_the_limit_is_413(self, client):
        c, db, drive_dir, _ = client
        seed(db, drive_dir)

        res = upload_base(c, TEST_DRIVE, "a", "movie.srt", TOO_LARGE)

        assert res.status_code == 413
        assert detail(res)["code"] == "subtitle_too_large"
        assert names(drive_dir, "a") == ["movie.mp4"]

    def test_a_subtitle_upload_init_on_a_taken_name_is_409(self, client):
        c, db, drive_dir, _ = client
        seed(db, drive_dir)
        sidecar(drive_dir, "a", "movie.srt", b"taken")

        res = upload_base(c, TEST_DRIVE, "a", "movie.srt", len(SRT))

        assert res.status_code == 409
        assert detail(res)["code"] == "subtitle_name_taken"

    @pytest.mark.parametrize("method", ["add", "replace"])
    def test_a_body_that_is_not_utf8_is_refused_and_nothing_is_written(
        self, client, method
    ):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        sidecar(drive_dir, "a", "movie.ja.srt", b"old")
        before = snapshot(drive_dir / "a")

        if method == "add":
            res = add_subtitle(c, movie.id, NOT_UTF8, "picked.srt", "en")
        else:
            res = replace_subtitle(c, movie.id, "movie.ja.srt", NOT_UTF8, "picked.srt")

        assert res.status_code == 400
        assert detail(res)["code"] == "subtitle_not_utf8"
        assert snapshot(drive_dir / "a") == before

    def test_a_utf8_bom_is_accepted(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir)
        body = b"\xef\xbb\xbf" + SRT.encode()

        res = add_subtitle(c, movie.id, body, "picked.srt", "ja")

        assert res.status_code == 201, res.text
        assert (drive_dir / "a" / "movie.ja.srt").exists()

    def test_upload_complete_refuses_not_utf8_and_leaves_no_file(self, client):
        c, _, drive_dir, _ = client

        res = upload_and_complete(c, TEST_DRIVE, "a", "movie.srt", NOT_UTF8)

        assert res.status_code == 400
        assert detail(res)["code"] == "subtitle_not_utf8"
        assert not (drive_dir / "a" / "movie.srt").exists()
