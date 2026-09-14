from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

from tests.conftest import TEST_DRIVE

# (filename, file_type, mime_type) as `classify()` records them in the
# runtime image; the `None` mime rows are ones written before it did.
SELECTED = [
    ("note.md", "document", "text/markdown"),
    ("long.markdown", "document", "text/markdown"),
    ("plain.txt", "document", "text/plain"),
    ("SHOUT.TXT", "document", "text/plain"),
    ("legacy.md", "document", None),
    ("old.markdown", "document", None),
]
NOT_SELECTED = [
    ("main.c", "document", "text/plain"),
    ("head.h", "document", "text/plain"),
    ("script.pl", "document", "text/plain"),
    ("guide.rst", "document", "text/x-rst"),
    ("table.csv", "document", "text/csv"),
    ("draft.mdown", "other", "application/octet-stream"),
    ("draft.mkd", "other", "application/octet-stream"),
    ("draft.text", "other", "application/octet-stream"),
    ("movie.mp4", "video", "video/mp4"),
]


def _add(db, drive_dir, filename, file_type, mime_type, folder="notes"):
    from app.models import File

    d = drive_dir / folder
    d.mkdir(parents=True, exist_ok=True)
    (d / filename).write_text("x")
    row = File(
        filename=filename,
        title=Path(filename).stem,
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=f"{folder}/{filename}",
        file_size=1,
        file_type=file_type,
        mime_type=mime_type,
    )
    db.add(row)
    db.commit()
    return row


@pytest.fixture
def library(client):
    c, db, drive_dir, _ = client
    for filename, file_type, mime in SELECTED + NOT_SELECTED:
        _add(db, drive_dir, filename, file_type, mime)
    return c, db, drive_dir


def _listing(c, kind):
    res = c.get(f"/api/drives/{TEST_DRIVE}/files?type={kind}&recursive=true&limit=100")
    assert res.status_code == 200, res.text
    return {item["filename"] for item in res.json()["data"]}


def _tree(c, kind, *, flat):
    url = (
        f"/api/drives/{TEST_DRIVE}/folder-tree?flat=true&include_files=true&type_filter={kind}"
        if flat
        else f"/api/drives/{TEST_DRIVE}/folder-tree?root=notes&include_files=true&type_filter={kind}"
    )
    res = c.get(url)
    assert res.status_code == 200, res.text
    return {n["name"] for n in res.json() if n["kind"] == "file"}


def _history(c, kind, limit=50):
    res = c.get(f"/api/drives/{TEST_DRIVE}/watch-history?filter=all&limit={limit}&type={kind}")
    assert res.status_code == 200, res.text
    return [item["filename"] for item in res.json()["data"]]


EXPECTED = {name for name, _, _ in SELECTED}


def test_text_selects_markdown_and_txt_and_nothing_else(library):
    c, _, _ = library
    assert _listing(c, "text") == EXPECTED
    assert _tree(c, "text", flat=True) == EXPECTED
    assert _tree(c, "text", flat=False) == EXPECTED


@pytest.mark.parametrize("kind", ["text", "markdown"])
def test_the_old_name_answers_as_text_on_every_surface(library, kind):
    c, _, _ = library
    assert _listing(c, kind) == EXPECTED
    assert _tree(c, kind, flat=True) == EXPECTED
    assert _tree(c, kind, flat=False) == EXPECTED


def test_document_still_holds_every_text_row(library):
    c, _, _ = library
    assert _listing(c, "document") == EXPECTED | {
        "main.c", "head.h", "script.pl", "guide.rst", "table.csv",
    }


def test_the_folder_card_counts_text_as_the_filter_selects_it(library):
    c, _, _ = library
    folder = c.get(f"/api/drives/{TEST_DRIVE}/folders").json()[0]
    assert folder["kind_counts"]["text"] == len(EXPECTED)
    assert "markdown" not in folder["kind_counts"]
    assert sum(folder["kind_counts"].values()) == folder["file_count"]


def test_a_folder_of_notes_is_described_as_text(client):
    c, db, drive_dir, _ = client
    for name in ("a.md", "b.txt", "c.markdown"):
        _add(db, drive_dir, name, "document", "text/plain" if name.endswith(".txt") else "text/markdown")
    _add(db, drive_dir, "clip.mp4", "video", "video/mp4")

    folder = c.get(f"/api/drives/{TEST_DRIVE}/folders").json()[0]

    assert folder["dominant_kind"] == "text"


@pytest.fixture
def viewed(client):
    """A text file opened (view-only) first, then newer video views."""
    c, db, drive_dir, _ = client
    note = _add(db, drive_dir, "note.md", "document", "text/markdown")
    res = c.post(f"/api/files/{note.id}/progress", json={}, cookies={"lit_viewer": "alice"})
    assert res.status_code in (200, 204), res.text
    for i in range(3):
        clip = _add(db, drive_dir, f"clip{i}.mp4", "video", "video/mp4")
        res = c.post(
            f"/api/files/{clip.id}/progress",
            json={"position": 1.0, "duration": 100.0},
            cookies={"lit_viewer": "alice"},
        )
        assert res.status_code in (200, 204), res.text
    c.cookies.set("lit_viewer", "alice")
    return c


@pytest.mark.parametrize("kind", ["text", "markdown"])
def test_history_finds_a_view_only_text_record_before_the_limit(viewed, kind):
    assert _history(viewed, kind, limit=1) == ["note.md"]


def test_an_unknown_kind_is_still_rejected(client):
    c, _, _, _ = client
    assert c.get(f"/api/drives/{TEST_DRIVE}/files?type=notes").status_code == 422
    assert c.get(f"/api/drives/{TEST_DRIVE}/folder-tree?type_filter=notes").status_code == 422
    assert c.get(f"/api/drives/{TEST_DRIVE}/watch-history?type=notes").status_code == 422


@pytest.mark.usefixtures("private_data_dir")
def test_saved_smart_folders_move_from_markdown_to_text(tmp_path):
    from app.database import Base, _migrate

    engine = create_engine(
        f"sqlite:///{tmp_path / 'migration.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for sf_id, file_type in (("sf1", "markdown"), ("sf2", "pdf"), ("sf3", None)):
            conn.execute(
                text(
                    "INSERT INTO smart_folders (id, drive, name, query, file_type, created_at) "
                    "VALUES (:id, 'd', :id, '', :ft, '2026-01-01T00:00:00')"
                ),
                {"id": sf_id, "ft": file_type},
            )

    _migrate(engine)
    _migrate(engine)

    with engine.connect() as conn:
        rows = dict(conn.execute(text("SELECT id, file_type FROM smart_folders")).fetchall())
    assert rows == {"sf1": "text", "sf2": "pdf", "sf3": None}
