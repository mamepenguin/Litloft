"""Which video owns a sidecar subtitle (SPEC-CORE-184 I1)."""
import pytest

from tests.subtitle_sidecar_helpers import (
    SRT,
    languages,
    retire,
    seed,
    sidecar,
    subtitles,
)


class TestLongestStemOwnership:
    """SPEC-CORE-184 I1: a longer adjacent stem takes the sidecar away."""

    def test_a_bare_track_belongs_to_the_longer_stem_only(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir, "movie.mp4")
        ja = seed(db, drive_dir, "movie.ja.mp4")
        sidecar(drive_dir, "a", "movie.ja.srt", SRT.encode())

        assert subtitles(c, movie.id) == []
        assert languages(c, ja.id) == [""]

    def test_the_shorter_stem_does_not_serve_a_longer_stems_track(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir, "movie.mp4")
        ja = seed(db, drive_dir, "movie.ja.mp4")
        sidecar(drive_dir, "a", "movie.ja.srt", SRT.encode())

        assert c.get(f"/api/files/{movie.id}/subtitles/0").status_code == 404
        served = c.get(f"/api/files/{ja.id}/subtitles/0")
        assert served.status_code == 200
        assert "hello" in served.text


class TestSameStemOwners:
    """SPEC-CORE-184 I1: rows with one stem share the track, and say so."""

    def test_both_same_stem_videos_list_and_serve_the_shared_track(self, client):
        c, db, drive_dir, _ = client
        mp4 = seed(db, drive_dir, "movie.mp4")
        mkv = seed(db, drive_dir, "movie.mkv", mime="video/x-matroska")
        sidecar(drive_dir, "a", "movie.srt", SRT.encode())

        for row in (mp4, mkv):
            assert languages(c, row.id) == [""]
            served = c.get(f"/api/files/{row.id}/subtitles/0")
            assert served.status_code == 200

    def test_a_listed_track_reports_its_name_owners_and_version(self, client):
        c, db, drive_dir, _ = client
        mp4 = seed(db, drive_dir, "movie.mp4")
        seed(db, drive_dir, "movie.mkv", mime="video/x-matroska")
        sidecar(drive_dir, "a", "movie.srt", SRT.encode())
        mtime = (drive_dir / "a" / "movie.srt").stat().st_mtime_ns

        [track] = subtitles(c, mp4.id)

        assert track["filename"] == "movie.srt"
        assert track["shared_with"] == 1
        assert track["version"] == str(mtime)


class TestRetiredRow:
    """SPEC-CORE-184 I1: a row retired by a path conflict owns nothing."""

    def test_a_retired_longer_stem_row_does_not_take_the_track(self, client):
        c, db, drive_dir, _ = client
        movie = seed(db, drive_dir, "movie.mp4")
        ghost = retire(db, seed(db, drive_dir, "movie.ja.mp4"))
        assert ghost.file_path.startswith("__missing_")
        sidecar(drive_dir, "a", "movie.ja.srt", SRT.encode())

        assert languages(c, movie.id) == ["ja"]


@pytest.mark.parametrize(
    ("name", "language"),
    [("movie.srt", ""), ("movie.en.srt", "en"), ("movie.ja.vtt", "ja")],
)
def test_a_single_track_is_listed_for_its_own_stem(client, name, language):
    """SPEC-CORE-184 I1: a track whose stem is the video's is owned and listed."""
    c, db, drive_dir, _ = client
    movie = seed(db, drive_dir, "movie.mp4")
    sidecar(drive_dir, "a", name, SRT.encode())

    assert languages(c, movie.id) == [language]
