"""One vocabulary, one classifier, for both surfaces that filter by kind.

Two filters used to answer "show me only X" with two different
implementations: the listing's ``?type=`` compared ``File.file_type``
directly, while the tree's ``?type_filter=`` ran a four-bucket
classifier that knew about markdown and PDF. A file could satisfy one
and not the other, and the one case where that is visible — a ``.md``
row whose ``mime_type`` never got recorded — landed on opposite sides
of each.

Both now go through ``_apply_kind_filter``. These tests hold the two
endpoints to the same answers, which is the only durable way to state
"there is one classifier": asserting it about the code would pass a
second copy that happened to agree today.

Spec: docs/superpowers/specs/2026-09-03-ui-redesign-p1-vocabulary.md item 1.
"""

from pathlib import Path

import pytest

from tests.conftest import TEST_DRIVE


def _add(db, drive_dir, *, filename: str, file_type: str, mime_type: str | None,
         folder_path: str = ""):
    from app.models import File

    d = drive_dir / folder_path if folder_path else drive_dir
    d.mkdir(parents=True, exist_ok=True)
    (d / filename).write_text("x")
    rel = f"{folder_path}/{filename}" if folder_path else filename

    f = File(
        filename=filename,
        title=Path(filename).stem,
        drive=TEST_DRIVE,
        folder_path=folder_path,
        file_path=rel,
        file_size=1,
        file_type=file_type,
        mime_type=mime_type,
    )
    db.add(f)
    db.commit()
    return f


def _listing_names(c, kind: str | None = None) -> set[str]:
    url = f"/api/drives/{TEST_DRIVE}/files?limit=100"
    if kind is not None:
        url += f"&type={kind}"
    res = c.get(url)
    assert res.status_code == 200, res.text
    return {item["filename"] for item in res.json()["data"]}


def _tree_names(c, kind: str | None = None, *, flat: bool = True) -> set[str]:
    url = f"/api/drives/{TEST_DRIVE}/folder-tree?flat=true" if flat \
        else f"/api/drives/{TEST_DRIVE}/folder-tree?root="
    if kind is not None:
        url += f"&type_filter={kind}"
    res = c.get(url)
    assert res.status_code == 200, res.text
    return {n["name"] for n in res.json() if n["kind"] == "file"}


def _recent_names(c, kind: str | None = None) -> set[str]:
    url = f"/api/drives/{TEST_DRIVE}/watch-history?filter=all&limit=50"
    if kind is not None:
        url += f"&type={kind}"
    res = c.get(url)
    assert res.status_code == 200, res.text
    return {item["filename"] for item in res.json()["data"]}


# The six top-level kinds plus the two that live under `document`.
ALL_KINDS = [
    "video", "image", "audio", "document", "archive", "other",
    "markdown", "pdf",
]


@pytest.fixture
def library(client):
    """One file of every kind, plus the rows that used to disagree."""
    c, db, drive_dir, _ = client
    _add(db, drive_dir, filename="movie.mp4", file_type="video", mime_type="video/mp4")
    _add(db, drive_dir, filename="pic.jpg", file_type="image", mime_type="image/jpeg")
    _add(db, drive_dir, filename="song.mp3", file_type="audio", mime_type="audio/mpeg")
    _add(db, drive_dir, filename="note.md", file_type="document", mime_type="text/markdown")
    _add(db, drive_dir, filename="doc.pdf", file_type="document", mime_type="application/pdf")
    _add(db, drive_dir, filename="sheet.xlsx", file_type="document",
         mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    _add(db, drive_dir, filename="bundle.zip", file_type="archive", mime_type="application/zip")
    _add(db, drive_dir, filename="blob.bin", file_type="other", mime_type="application/octet-stream")
    return c, db, drive_dir


class TestOneClassifier:
    @pytest.mark.parametrize("kind", ALL_KINDS)
    def test_listing_and_tree_agree(self, library, kind):
        c, _, _ = library
        assert _listing_names(c, kind) == _tree_names(c, kind)

    @pytest.mark.parametrize("kind", ALL_KINDS)
    def test_the_tree_agrees_with_itself_in_both_modes(self, library, kind):
        # The tree answers in two shapes — a flat whole-drive list and a
        # lazy one level at a time — and each builds its own query. Only
        # the flat one was covered, so the depth-1 path could have lost
        # the filter without this file noticing.
        c, _, _ = library
        assert _tree_names(c, kind, flat=False) == _tree_names(c, kind)

    def test_they_agree_on_a_markdown_row_with_no_recorded_mime(self, library):
        # The row this whole exercise is about. `classify()` always
        # records a mime today, but rows predating it — and rows written
        # by anything that skipped it — carry NULL, and the two filters
        # then put the same file on opposite sides.
        c, db, drive_dir = library
        _add(db, drive_dir, filename="legacy.md", file_type="document", mime_type=None)

        assert "legacy.md" in _listing_names(c, "markdown")
        assert _listing_names(c, "markdown") == _tree_names(c, "markdown")

    def test_they_agree_on_a_pdf_row_with_no_recorded_mime(self, library):
        c, db, drive_dir = library
        _add(db, drive_dir, filename="legacy.pdf", file_type="document", mime_type=None)

        assert "legacy.pdf" in _listing_names(c, "pdf")
        assert _listing_names(c, "pdf") == _tree_names(c, "pdf")

    def test_the_name_is_enough_even_when_the_column_disagrees(self, library):
        """The nested branch must not also require ``file_type == "document"``.

        A row with no recorded mime got its ``file_type`` from the same
        writer that skipped the mime, so it is exactly the row most
        likely to carry the wrong one. Demanding the column too would
        drop precisely the rows the extension fallback exists for —
        while the semantic index, which does not demand it, keeps
        returning them. That is the two-surfaces-disagree defect this
        whole item exists to end, reintroduced in the one direction that
        looks like a correction.

        ``addons/intelligence/tests/test_search_file_kind_filter.py``
        seeds the mirror of this row for the same reason.
        """
        c, db, drive_dir = library
        _add(db, drive_dir, filename="stray.md", file_type="other", mime_type=None)

        assert "stray.md" in _listing_names(c, "markdown")
        assert _listing_names(c, "markdown") == _tree_names(c, "markdown")


class TestTheRecentView:
    """Watch history narrows through the same classifier.

    It used to sift the fetched rows in the browser on ``file_type``
    alone, so choosing Markdown or PDF — values that column never holds
    — emptied the view no matter what was in the history.
    """

    @pytest.fixture
    def watched(self, library):
        """Every file in the library, watched by one viewer.

        Recorded through the progress endpoint rather than by inserting
        rows: the viewer id is derived from the `lit_viewer` cookie, so
        a hand-written row would belong to nobody.
        """
        c, db, _ = library
        from app.models import File

        for f in db.query(File).all():
            res = c.post(
                f"/api/files/{f.id}/progress",
                json={"position": 1.0, "duration": 100.0},
                cookies={"lit_viewer": "alice"},
            )
            assert res.status_code in (200, 204), res.text
        c.cookies.set("lit_viewer", "alice")
        return c

    def test_it_finds_markdown(self, watched):
        assert _recent_names(watched, "markdown") == {"note.md"}

    def test_it_finds_pdf(self, watched):
        assert _recent_names(watched, "pdf") == {"doc.pdf"}

    def test_it_agrees_with_the_listing(self, watched):
        for kind in ALL_KINDS:
            assert _recent_names(watched, kind) == _listing_names(watched, kind), kind

    def test_no_filter_returns_the_whole_history(self, watched):
        assert len(_recent_names(watched)) == 8


class TestTheVocabulary:
    def test_every_kind_selects_its_own_file(self, library):
        c, _, _ = library
        expected = {
            "video": "movie.mp4",
            "image": "pic.jpg",
            "audio": "song.mp3",
            "archive": "bundle.zip",
            "other": "blob.bin",
            "markdown": "note.md",
            "pdf": "doc.pdf",
        }
        for kind, filename in expected.items():
            assert _listing_names(c, kind) == {filename}, kind

    def test_document_holds_markdown_and_pdf_under_it(self, library):
        # The one nesting in the vocabulary: markdown and PDF are kinds
        # of document, so asking for documents must return them. A flat
        # taxonomy would make "document" mean "documents that are
        # neither markdown nor PDF", which is not what the word says.
        c, _, _ = library
        assert _listing_names(c, "document") == {"note.md", "doc.pdf", "sheet.xlsx"}

    def test_no_filter_returns_everything(self, library):
        c, _, _ = library
        assert len(_listing_names(c)) == 8

    def test_subtitle_is_not_offered_but_does_not_error(self, library):
        # `subtitle` is a `file_type` the scanner never registers as a
        # file row, and no UI offers it. Accepting it and returning
        # nothing is kinder than a 422 for a value the type still has.
        c, _, _ = library
        assert _listing_names(c, "subtitle") == set()

    def test_an_unknown_kind_is_rejected(self, library):
        c, _, _ = library
        res = c.get(f"/api/drives/{TEST_DRIVE}/files?type=nonsense")
        assert res.status_code == 422
