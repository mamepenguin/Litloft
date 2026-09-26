import hashlib
import io
import zipfile
from unittest.mock import patch

import pytest
from PIL import Image

from app.services import thumbnail as thumbnail_service
from app.services.thumbnail import generate_epub_thumbnail, get_thumbnail_generator

CONTAINER = (
    '<?xml version="1.0"?>'
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
    '<rootfiles><rootfile full-path="{opf}" media-type="application/oebps-package+xml"/>'
    "</rootfiles></container>"
)


def opf(manifest: str, metadata: str = "") -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<package xmlns="http://www.idpf.org/2007/opf" version="3.0">'
        f'<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">{metadata}</metadata>'
        f"<manifest>{manifest}</manifest><spine/></package>"
    )


def image_bytes(fmt="PNG", size=(600, 900), color=(200, 30, 30), mode="RGB") -> bytes:
    buf = io.BytesIO()
    Image.new(mode, size, color).save(buf, format=fmt)
    return buf.getvalue()


def make_epub(path, entries: dict, container_opf="OEBPS/content.opf", compress=zipfile.ZIP_DEFLATED):
    with zipfile.ZipFile(path, "w", compression=compress) as z:
        z.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        if "META-INF/container.xml" not in entries:
            z.writestr("META-INF/container.xml", CONTAINER.format(opf=container_opf))
        for name, data in entries.items():
            z.writestr(name, data)
    return path


class _Cp932Name(zipfile.ZipInfo):
    """Written the way Japanese Windows writes a name: raw CP932, no UTF-8 flag."""

    def _encodeFilenameFlags(self):
        return self.filename.encode("cp437"), self.flag_bits


EPUB3_COVER = opf('<item id="c" href="images/cover.png" media-type="image/png" properties="cover-image"/>')


def epub3(tmp_path, cover=None, name="book.epub"):
    return make_epub(
        tmp_path / name,
        {"OEBPS/content.opf": EPUB3_COVER, "OEBPS/images/cover.png": cover or image_bytes()},
    )


def generate(tmp_path, epub) -> Image.Image | None:
    out = tmp_path / "thumb.jpg"
    if not generate_epub_thumbnail(str(epub), str(out)):
        assert not out.exists()
        return None
    return Image.open(out)


class TestRouting:
    def test_epub_documents_get_the_epub_generator(self):
        assert get_thumbnail_generator("document", "application/epub+zip") is generate_epub_thumbnail


class TestCoverDiscovery:
    def test_epub3_cover_image_property(self, tmp_path):
        thumb = generate(tmp_path, epub3(tmp_path))
        assert thumb is not None
        assert thumb.format == "JPEG"
        assert thumb.size == (320, 180)

    def test_epub2_meta_cover(self, tmp_path):
        epub = make_epub(tmp_path / "b.epub", {
            "OEBPS/content.opf": opf(
                '<item id="cov" href="c.jpg" media-type="image/jpeg"/>',
                '<meta name="cover" content="cov"/>',
            ),
            "OEBPS/c.jpg": image_bytes("JPEG"),
        })
        assert generate(tmp_path, epub) is not None

    def test_epub3_property_wins_over_epub2_meta(self, tmp_path):
        epub = make_epub(tmp_path / "b.epub", {
            "OEBPS/content.opf": opf(
                '<item id="old" href="old.png" media-type="image/png"/>'
                '<item id="new" href="new.png" media-type="image/png" properties="cover-image"/>',
                '<meta name="cover" content="old"/>',
            ),
            "OEBPS/old.png": image_bytes(color=(0, 0, 255)),
            "OEBPS/new.png": image_bytes(color=(255, 0, 0)),
        })
        thumb = generate(tmp_path, epub).convert("RGB")
        r, g, b = thumb.getpixel((160, 90))
        assert r > 200 and b < 60

    def test_no_cover_declared(self, tmp_path):
        epub = make_epub(tmp_path / "b.epub", {
            "OEBPS/content.opf": opf('<item id="x" href="x.png" media-type="image/png"/>'),
            "OEBPS/x.png": image_bytes(),
        })
        assert generate(tmp_path, epub) is None

    def test_cover_meta_pointing_at_a_missing_id(self, tmp_path):
        epub = make_epub(tmp_path / "b.epub", {
            "OEBPS/content.opf": opf("", '<meta name="cover" content="nope"/>'),
        })
        assert generate(tmp_path, epub) is None

    def test_declared_cover_missing_from_the_zip(self, tmp_path):
        epub = make_epub(tmp_path / "b.epub", {"OEBPS/content.opf": EPUB3_COVER})
        assert generate(tmp_path, epub) is None

    def test_href_with_fragment_and_percent_encoded_space(self, tmp_path):
        epub = make_epub(tmp_path / "b.epub", {
            "OEBPS/content.opf": opf(
                '<item id="c" href="my%20images/cover.png#frag" media-type="image/png" properties="cover-image"/>'
            ),
            "OEBPS/my images/cover.png": image_bytes(),
        })
        assert generate(tmp_path, epub) is not None

    def test_href_resolved_against_opf_directory_with_dot_segment(self, tmp_path):
        epub = make_epub(tmp_path / "b.epub", {
            "OEBPS/pkg/content.opf": opf(
                '<item id="c" href="../img/cover.png" media-type="image/png" properties="cover-image"/>'
            ),
            "OEBPS/img/cover.png": image_bytes(),
        }, container_opf="OEBPS/pkg/content.opf")
        assert generate(tmp_path, epub) is not None

    def test_opf_at_zip_root(self, tmp_path):
        epub = make_epub(tmp_path / "b.epub", {
            "content.opf": opf('<item id="c" href="cover.png" media-type="image/png" properties="cover-image"/>'),
            "cover.png": image_bytes(),
        }, container_opf="content.opf")
        assert generate(tmp_path, epub) is not None

    def test_shift_jis_entry_name_is_found(self, tmp_path):
        name_sjis = "表紙.png".encode("cp932").decode("cp437")
        path = tmp_path / "b.epub"
        with zipfile.ZipFile(path, "w") as z:
            z.writestr("META-INF/container.xml", CONTAINER.format(opf="content.opf"))
            z.writestr("content.opf", opf(
                '<item id="c" href="%E8%A1%A8%E7%B4%99.png" media-type="image/png" properties="cover-image"/>'
            ))
            z.writestr(_Cp932Name(name_sjis), image_bytes())
        with zipfile.ZipFile(path) as z:
            assert all(i.flag_bits & 0x800 == 0 for i in z.infolist())
        assert generate(tmp_path, path) is not None

    @pytest.mark.parametrize("fmt", ["JPEG", "PNG", "GIF", "WEBP"])
    def test_each_allowed_raster_format(self, tmp_path, fmt):
        assert generate(tmp_path, epub3(tmp_path, image_bytes(fmt))) is not None


class TestOutput:
    def test_portrait_cover_is_letterboxed_on_white(self, tmp_path):
        thumb = generate(tmp_path, epub3(tmp_path, image_bytes(size=(600, 900)))).convert("RGB")
        assert thumb.size == (320, 180)
        assert thumb.getpixel((5, 90)) == (255, 255, 255)
        assert thumb.getpixel((314, 90)) == (255, 255, 255)
        r, g, b = thumb.getpixel((160, 90))
        assert r > 150 and g < 90

    def test_transparent_cover_is_composited_on_white(self, tmp_path):
        cover = image_bytes("PNG", size=(320, 180), color=(0, 0, 0, 0), mode="RGBA")
        thumb = generate(tmp_path, epub3(tmp_path, cover)).convert("RGB")
        assert thumb.getpixel((160, 90)) == (255, 255, 255)


def _sha(path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _hostile(tmp_path, name, entries, container_opf="OEBPS/content.opf"):
    return make_epub(tmp_path / name, entries, container_opf=container_opf)


def hostile_books(tmp_path):
    png = image_bytes()
    bomb = b"\0" * (11 * 1024 * 1024)
    return {
        "doctype_opf": _hostile(tmp_path, "a.epub", {
            "OEBPS/content.opf": EPUB3_COVER.replace(
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<?xml version="1.0"?><!DOCTYPE package [<!ENTITY x "y">]>',
            ),
            "OEBPS/images/cover.png": png,
        }),
        "utf16_doctype_opf": _hostile(tmp_path, "a16.epub", {
            "OEBPS/content.opf": (
                '<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE package [<!ENTITY x "y">]>'
                + EPUB3_COVER.split("?>", 1)[1]
            ).encode("utf-16"),
            "OEBPS/images/cover.png": png,
        }),
        "doctype_container": _hostile(tmp_path, "b.epub", {
            "META-INF/container.xml": '<?xml version="1.0"?><!DOCTYPE c SYSTEM "file:///etc/passwd">'
            + CONTAINER.format(opf="OEBPS/content.opf").split("?>", 1)[1],
            "OEBPS/content.opf": EPUB3_COVER,
            "OEBPS/images/cover.png": png,
        }),
        "bad_xml": _hostile(tmp_path, "c.epub", {"OEBPS/content.opf": "<package><manifest>"}),
        "no_container": _hostile(tmp_path, "d.epub", {
            "META-INF/container.xml": "",
            "OEBPS/content.opf": EPUB3_COVER,
        }),
        "dotdot_href": _hostile(tmp_path, "e.epub", {
            "OEBPS/content.opf": opf('<item id="c" href="../../secret.png" media-type="image/png" properties="cover-image"/>'),
            "../secret.png": png,
        }),
        "encoded_dotdot_href": _hostile(tmp_path, "f.epub", {
            "OEBPS/content.opf": opf('<item id="c" href="%2e%2e/%2e%2e/secret.png" media-type="image/png" properties="cover-image"/>'),
            "../secret.png": png,
        }),
        "absolute_href": _hostile(tmp_path, "g.epub", {
            "OEBPS/content.opf": opf('<item id="c" href="/etc/cover.png" media-type="image/png" properties="cover-image"/>'),
            "/etc/cover.png": png,
        }),
        "url_href": _hostile(tmp_path, "g2.epub", {
            "OEBPS/content.opf": opf('<item id="c" href="http://127.0.0.1/c.png" media-type="image/png" properties="cover-image"/>'),
        }),
        "escaping_opf_path": _hostile(tmp_path, "h.epub", {
            "../content.opf": EPUB3_COVER,
            "../images/cover.png": png,
        }, container_opf="../content.opf"),
        "oversized_opf": _hostile(tmp_path, "i.epub", {
            "OEBPS/content.opf": EPUB3_COVER.replace("<spine/>", "<spine/>" + " " * (1024 * 1024 + 1)),
            "OEBPS/images/cover.png": png,
        }),
        "bomb_cover": _hostile(tmp_path, "j.epub", {
            "OEBPS/content.opf": EPUB3_COVER,
            "OEBPS/images/cover.png": bomb,
        }),
        "svg_cover": _hostile(tmp_path, "k.epub", {
            "OEBPS/content.opf": opf('<item id="c" href="c.svg" media-type="image/svg+xml" properties="cover-image"/>'),
            "OEBPS/c.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
        }),
        "svg_bytes_under_png_name": _hostile(tmp_path, "k2.epub", {
            "OEBPS/content.opf": EPUB3_COVER,
            "OEBPS/images/cover.png": '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
        }),
        "bmp_cover": _hostile(tmp_path, "k3.epub", {
            "OEBPS/content.opf": EPUB3_COVER,
            "OEBPS/images/cover.png": image_bytes("BMP"),
        }),
        "huge_pixel_cover": _hostile(tmp_path, "l.epub", {
            "OEBPS/content.opf": EPUB3_COVER,
            "OEBPS/images/cover.png": image_bytes("PNG", size=(8000, 5001), color=0, mode="1"),
        }),
        "truncated_cover": _hostile(tmp_path, "m.epub", {
            "OEBPS/content.opf": EPUB3_COVER,
            "OEBPS/images/cover.png": png[: len(png) // 2],
        }),
    }


HOSTILE = [
    "doctype_opf", "utf16_doctype_opf", "doctype_container", "bad_xml",
    "no_container", "dotdot_href", "encoded_dotdot_href", "absolute_href",
    "url_href", "escaping_opf_path", "oversized_opf", "bomb_cover",
    "svg_cover", "svg_bytes_under_png_name", "bmp_cover", "huge_pixel_cover",
    "truncated_cover",
]


class TestHostileBooks:
    def test_the_declared_set_is_the_generated_set(self, tmp_path):
        assert sorted(hostile_books(tmp_path)) == sorted(HOSTILE)

    @pytest.mark.parametrize("case", HOSTILE)
    def test_yields_no_thumbnail_and_leaves_the_file_alone(self, tmp_path, case):
        epub = hostile_books(tmp_path)[case]
        before = _sha(epub)
        with patch.object(thumbnail_service.subprocess, "run") as run:
            assert generate(tmp_path, epub) is None
        run.assert_not_called()
        assert _sha(epub) == before

    def test_not_a_zip(self, tmp_path):
        path = tmp_path / "x.epub"
        path.write_bytes(b"not a zip at all")
        assert generate(tmp_path, path) is None

    def test_missing_file(self, tmp_path):
        assert generate(tmp_path, tmp_path / "absent.epub") is None

    def test_cover_just_under_the_byte_cap_is_read(self, tmp_path):
        cover = image_bytes()
        padded = cover + b"\0" * (10 * 1024 * 1024 - len(cover))
        assert generate(tmp_path, epub3(tmp_path, padded)) is not None

    def test_cover_one_byte_over_the_byte_cap_is_refused(self, tmp_path):
        cover = image_bytes()
        padded = cover + b"\0" * (10 * 1024 * 1024 - len(cover) + 1)
        assert generate(tmp_path, epub3(tmp_path, padded)) is None

    def test_cover_at_the_pixel_cap_is_read(self, tmp_path):
        cover = image_bytes("PNG", size=(8000, 5000), color=0, mode="1")
        assert generate(tmp_path, epub3(tmp_path, cover)) is not None

    def test_a_valid_cover_never_reaches_ffmpeg(self, tmp_path):
        with patch.object(thumbnail_service.subprocess, "run") as run:
            assert generate(tmp_path, epub3(tmp_path)) is not None
        run.assert_not_called()


class TestScan:
    def _drive(self, tmp_path, monkeypatch):
        import json

        import app.config as config

        drive_dir = tmp_path / "drive"
        drive_dir.mkdir()
        drives_json = tmp_path / "drives.json"
        drives_json.write_text(json.dumps([{"name": "test-drive", "path": str(drive_dir)}]))
        monkeypatch.setattr(config, "DRIVES_CONFIG", drives_json)
        monkeypatch.setattr(config, "_drives_cache", None)
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        monkeypatch.setattr(config, "DATA_DIR", data_dir)
        monkeypatch.setattr(config, "THUMBNAILS_DIR", data_dir / "thumbnails")
        return drive_dir

    def test_a_row_registered_before_epub_was_known_is_reclassified_with_a_cover(
        self, tmp_path, db_session, monkeypatch
    ):
        import app.config as config
        from app.models import File
        from app.services import scanner as scanner_module

        drive_dir = self._drive(tmp_path, monkeypatch)
        epub3(drive_dir)
        db_session.add(File(
            filename="book.epub", title="book", drive="test-drive", folder_path="",
            file_path="book.epub", file_size=(drive_dir / "book.epub").stat().st_size,
            file_type="other", mime_type="application/octet-stream",
        ))
        db_session.commit()

        scanner_module._scan_and_register(db_session, "test-drive")
        db_session.commit()

        record = db_session.query(File).filter(File.file_path == "book.epub").one()
        assert (record.file_type, record.mime_type) == ("document", "application/epub+zip")
        with Image.open(config.THUMBNAILS_DIR / record.thumbnail_path) as thumb:
            assert thumb.size == (320, 180)

    def test_a_hostile_book_is_registered_without_a_thumbnail(
        self, tmp_path, db_session, monkeypatch
    ):
        from app.models import File
        from app.services.scanner import register_single_file

        drive_dir = self._drive(tmp_path, monkeypatch)
        book = hostile_books(drive_dir)["doctype_opf"]
        before = _sha(book)

        file_id = register_single_file(db_session, "test-drive", book)
        db_session.commit()

        record = db_session.query(File).filter(File.id == file_id).one()
        assert (record.file_type, record.mime_type) == ("document", "application/epub+zip")
        assert record.thumbnail_path is None
        assert record.missing_since is None and record.deleted_at is None
        assert _sha(book) == before
