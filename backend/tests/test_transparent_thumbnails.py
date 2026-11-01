"""SPEC-CORE-006: a picture whose source carries transparency gets a WebP
thumbnail with alpha, served under the type its bytes are.
"""

import io
import json
import logging
import os
import subprocess
from datetime import UTC, datetime
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

import app.config as config
from app.models import File
from app.services import scanner as scanner_module
from app.services.scanner import register_single_file
from app.services.thumbnail import (
    generate_image_thumbnail,
    image_scale_filter,
    image_thumbnail_size,
)

from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"

CLEAR = (0, 0, 0, 0)
INK = (200, 30, 30, 255)


# --- sources ---------------------------------------------------------------


def _centre_box(size):
    w, h = size
    return (w // 4, h // 4, w * 3 // 4, h * 3 // 4)


def _rgba_png(path, size=(640, 480)):
    image = Image.new("RGBA", size, CLEAR)
    ImageDraw.Draw(image).rectangle(_centre_box(size), fill=INK)
    image.save(path, format="PNG")


def _la_png(path, size=(640, 480)):
    image = Image.new("LA", size, (0, 0))
    ImageDraw.Draw(image).rectangle(_centre_box(size), fill=(200, 255))
    image.save(path, format="PNG")


def _palette(image):
    image.putpalette([0, 0, 0, 200, 30, 30] + [0, 0, 0] * 254)
    return image


def _palette_trns_png(path, size=(640, 480)):
    image = _palette(Image.new("P", size, 0))
    ImageDraw.Draw(image).rectangle(_centre_box(size), fill=1)
    image.save(path, format="PNG", transparency=0)


def _rgb_colour_key_png(path, size=(640, 480)):
    image = Image.new("RGB", size, (0, 0, 0))
    ImageDraw.Draw(image).rectangle(_centre_box(size), fill=INK[:3])
    image.save(path, format="PNG", transparency=(0, 0, 0))


def _grey_colour_key_png(path, size=(640, 480)):
    image = Image.new("L", size, 0)
    ImageDraw.Draw(image).rectangle(_centre_box(size), fill=200)
    image.save(path, format="PNG", transparency=0)


def _gif_transparent_index(path, size=(640, 480)):
    image = _palette(Image.new("P", size, 0))
    ImageDraw.Draw(image).rectangle(_centre_box(size), fill=1)
    image.save(path, format="GIF", transparency=0)


def _webp_alpha(path, size=(640, 480)):
    image = Image.new("RGBA", size, CLEAR)
    ImageDraw.Draw(image).rectangle(_centre_box(size), fill=INK)
    image.save(path, format="WEBP", lossless=True)


def _rgba_tiff(path, size=(640, 480)):
    image = Image.new("RGBA", size, CLEAR)
    ImageDraw.Draw(image).rectangle(_centre_box(size), fill=INK)
    image.save(path, format="TIFF")


def _rgba_ico(path, size=(256, 256)):
    image = Image.new("RGBA", size, CLEAR)
    ImageDraw.Draw(image).rectangle(_centre_box(size), fill=INK)
    image.save(path, format="ICO", sizes=[size])


def _opaque_png(path, size=(640, 480)):
    image = Image.new("RGB", size, (30, 90, 160))
    ImageDraw.Draw(image).rectangle(_centre_box(size), fill=INK[:3])
    image.save(path, format="PNG")


TRANSPARENT_SOURCES = [
    # (id, filename, builder, source size)
    ("rgba-png", "logo.png", _rgba_png, (640, 480)),
    ("la-png", "logo.png", _la_png, (640, 480)),
    ("palette-trns-png", "logo.png", _palette_trns_png, (640, 480)),
    ("rgb-colour-key-png", "logo.png", _rgb_colour_key_png, (640, 480)),
    ("grey-colour-key-png", "logo.png", _grey_colour_key_png, (640, 480)),
    ("gif-transparent-index", "logo.gif", _gif_transparent_index, (640, 480)),
    ("webp-alpha", "logo.webp", _webp_alpha, (640, 480)),
    ("rgba-tiff", "logo.tiff", _rgba_tiff, (640, 480)),
    ("ico", "logo.ico", _rgba_ico, (256, 256)),
]


# --- byte signatures -------------------------------------------------------


def _is_webp(data: bytes) -> bool:
    return data[:4] == b"RIFF" and data[8:12] == b"WEBP"


def _is_jpeg(data: bytes) -> bool:
    return data[:3] == b"\xff\xd8\xff"


def _signature(data: bytes) -> str:
    if _is_webp(data):
        return "webp"
    if _is_jpeg(data):
        return "jpeg"
    return repr(data[:12])


def _alpha_at(path, xy):
    with Image.open(path) as image:
        return image.convert("RGBA").getpixel(xy)[3]


# --- ffmpeg observation ----------------------------------------------------


def _watch_ffmpeg(monkeypatch, *, fail_webp=False, fail_all=False):
    """Record every ffmpeg command; optionally make some of them fail."""
    real = subprocess.run
    calls: list[list[str]] = []

    def run(cmd, *args, **kwargs):
        argv = [str(part) for part in cmd] if isinstance(cmd, (list, tuple)) else []
        if argv and os.path.basename(argv[0]) == "ffmpeg":
            calls.append(argv)
            if fail_all or (fail_webp and "libwebp" in argv):
                if kwargs.get("check"):
                    raise subprocess.CalledProcessError(1, cmd, "", "forced failure")
                return subprocess.CompletedProcess(cmd, 1, "", "forced failure")
        return real(cmd, *args, **kwargs)

    monkeypatch.setattr(subprocess, "run", run)
    return calls


def _is_webp_command(argv):
    return "libwebp" in argv or "webp" in argv


def _value_after(argv, flag):
    return argv[argv.index(flag) + 1]


def _has_pair(argv, flag, value):
    return any(
        argv[i] == flag and argv[i + 1] == value for i in range(len(argv) - 1)
    )


def _watch_pillow_opens(monkeypatch):
    real = Image.open
    opened: list[str] = []

    def recording_open(fp, *args, **kwargs):
        name = getattr(fp, "name", fp)
        opened.append(os.path.realpath(str(name)))
        return real(fp, *args, **kwargs)

    monkeypatch.setattr(Image, "open", recording_open)
    return opened


# --- generator -------------------------------------------------------------


class TestGeneratorFormatFollowsTheSource:

    @pytest.mark.parametrize(
        "filename,build,size",
        [row[1:] for row in TRANSPARENT_SOURCES],
        ids=[row[0] for row in TRANSPARENT_SOURCES],
    )
    def test_spec_core_006_a_transparent_source_gets_a_webp_with_alpha(
        self, filename, build, size, tmp_path
    ):
        source = tmp_path / filename
        build(source)
        output = tmp_path / "thumb.jpg"

        assert generate_image_thumbnail(str(source), str(output)) is True

        data = output.read_bytes()
        assert _signature(data) == "webp"
        expected = image_thumbnail_size(*size)
        with Image.open(output) as thumbnail:
            assert thumbnail.size == expected
        w, h = expected
        assert _alpha_at(output, (1, 1)) == 0
        assert _alpha_at(output, (w - 2, h - 2)) == 0
        assert _alpha_at(output, (w // 2, h // 2)) == 255

    def test_spec_core_006_an_rgba_source_with_no_clear_pixel_still_gets_a_webp(
        self, tmp_path
    ):
        source = tmp_path / "screenshot.png"
        Image.new("RGBA", (640, 480), (30, 90, 160, 255)).save(source)
        output = tmp_path / "thumb.jpg"

        assert generate_image_thumbnail(str(source), str(output)) is True
        assert _signature(output.read_bytes()) == "webp"

    def test_spec_core_006_an_animated_transparent_gif_gets_one_frame(
        self, tmp_path
    ):
        source = tmp_path / "spinner.gif"
        frames = []
        for offset in range(3):
            frame = _palette(Image.new("P", (640, 480), 0))
            ImageDraw.Draw(frame).rectangle(
                (100 + offset * 50, 100, 300 + offset * 50, 300), fill=1
            )
            frames.append(frame)
        frames[0].save(
            source,
            format="GIF",
            save_all=True,
            append_images=frames[1:],
            transparency=0,
            duration=100,
            loop=0,
            disposal=2,
        )
        output = tmp_path / "thumb.jpg"

        assert generate_image_thumbnail(str(source), str(output)) is True
        assert _signature(output.read_bytes()) == "webp"
        with Image.open(output) as thumbnail:
            assert getattr(thumbnail, "n_frames", 1) == 1

    def test_spec_core_006_opaque_keeps_todays_jpeg_command_transparent_gets_webp(
        self, tmp_path, monkeypatch
    ):
        opaque = tmp_path / "photo.png"
        _opaque_png(opaque)
        transparent = tmp_path / "logo.png"
        _rgba_png(transparent)
        opaque_out = tmp_path / "opaque.jpg"
        transparent_out = tmp_path / "transparent.jpg"
        calls = _watch_ffmpeg(monkeypatch)

        assert generate_image_thumbnail(str(opaque), str(opaque_out)) is True
        opaque_calls = list(calls)
        calls.clear()
        assert generate_image_thumbnail(str(transparent), str(transparent_out)) is True
        transparent_calls = list(calls)

        # Opaque: exactly the command the generator ran before this change.
        assert opaque_calls == [
            [
                "ffmpeg",
                "-i",
                str(opaque),
                "-frames:v",
                "1",
                "-vf",
                image_scale_filter(),
                "-q:v",
                "2",
                "-y",
                str(opaque_out),
            ]
        ]
        assert _signature(opaque_out.read_bytes()) == "jpeg"

        webp_calls = [c for c in transparent_calls if _is_webp_command(c)]
        assert len(webp_calls) == 1, transparent_calls
        webp = webp_calls[0]
        assert _value_after(webp, "-i") == str(transparent)
        assert _value_after(webp, "-vf") == image_scale_filter()
        assert _has_pair(webp, "-f", "webp")
        assert _has_pair(webp, "-c:v", "libwebp")
        assert _has_pair(webp, "-pix_fmt", "yuva420p")
        assert _has_pair(webp, "-quality", "85")
        assert _signature(transparent_out.read_bytes()) == "webp"


class TestGeneratorFallback:

    def test_spec_core_006_a_failed_webp_write_falls_back_to_jpeg_and_warns(
        self, tmp_path, monkeypatch, caplog
    ):
        source = tmp_path / "logo.png"
        _rgba_png(source)
        output = tmp_path / "thumb.jpg"
        calls = _watch_ffmpeg(monkeypatch, fail_webp=True)
        caplog.set_level(logging.WARNING)

        assert generate_image_thumbnail(str(source), str(output)) is True

        assert [_is_webp_command(c) for c in calls] == [True, False], calls
        assert _signature(output.read_bytes()) == "jpeg"
        warnings = [
            r.getMessage() for r in caplog.records if r.levelno == logging.WARNING
        ]
        assert any("logo.png" in message for message in warnings), warnings

    def test_spec_core_006_when_both_writes_fail_the_generator_returns_false(
        self, tmp_path, monkeypatch
    ):
        source = tmp_path / "logo.png"
        _rgba_png(source)
        output = tmp_path / "thumb.jpg"
        calls = _watch_ffmpeg(monkeypatch, fail_all=True)

        assert generate_image_thumbnail(str(source), str(output)) is False
        assert [_is_webp_command(c) for c in calls] == [True, False], calls


class TestTransparencyCheckNeverRaises:
    """The same source goes through the generator twice: once with Pillow
    unable to read it, once normally. Only the check differs between the
    two runs, so the formats show the check is what decides.
    """

    @pytest.mark.parametrize(
        "error",
        [OSError("cannot identify"), ValueError("bad header"), RuntimeError("other")],
        ids=["OSError", "ValueError", "anything-else"],
    )
    def test_spec_core_006_an_unreadable_header_means_jpeg(
        self, error, tmp_path, monkeypatch
    ):
        source = tmp_path / "logo.png"
        _rgba_png(source)
        blocked = tmp_path / "blocked.jpg"
        normal = tmp_path / "normal.jpg"

        def refuse(*_args, **_kwargs):
            raise error

        with monkeypatch.context() as patch:
            patch.setattr(Image, "open", refuse)
            assert generate_image_thumbnail(str(source), str(blocked)) is True
        assert _signature(blocked.read_bytes()) == "jpeg"

        assert generate_image_thumbnail(str(source), str(normal)) is True
        assert _signature(normal.read_bytes()) == "webp"

    def test_spec_core_006_a_decompression_bomb_means_jpeg(
        self, tmp_path, monkeypatch
    ):
        source = tmp_path / "logo.png"
        _rgba_png(source, size=(640, 480))
        blocked = tmp_path / "blocked.jpg"
        normal = tmp_path / "normal.jpg"

        with monkeypatch.context() as patch:
            # Pillow raises DecompressionBombError past twice this many pixels.
            patch.setattr(Image, "MAX_IMAGE_PIXELS", 1000)
            assert generate_image_thumbnail(str(source), str(blocked)) is True
        assert _signature(blocked.read_bytes()) == "jpeg"

        assert generate_image_thumbnail(str(source), str(normal)) is True
        assert _signature(normal.read_bytes()) == "webp"


# --- callers ---------------------------------------------------------------


def _scan_drive(tmp_path, monkeypatch):
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


def _row(db, name):
    db.expire_all()
    return db.query(File).filter(File.filename == name).one()


class TestCallersWriteWebpIntoTheJpgSlot:

    @pytest.mark.parametrize("path", ["per-file", "scan-pass-2"])
    def test_spec_core_006_registration_stores_a_webp_under_the_jpg_name(
        self, path, tmp_path, db_session, monkeypatch
    ):
        drive_dir = _scan_drive(tmp_path, monkeypatch)
        source = drive_dir / "icons" / "logo.png"
        source.parent.mkdir()
        _rgba_png(source)

        if path == "per-file":
            register_single_file(db_session, "test-drive", source)
        else:
            scanner_module._scan_and_register(db_session, "test-drive")
        db_session.commit()

        record = _row(db_session, "logo.png")
        assert record.thumbnail_path is not None
        assert record.thumbnail_path == f".by-id/{record.id}.jpg"
        stored = config.THUMBNAILS_DIR / record.thumbnail_path
        assert _signature(stored.read_bytes()) == "webp"
        assert _alpha_at(stored, (1, 1)) == 0

    def test_spec_core_006_an_upload_is_served_as_a_webp_with_alpha(self, client):
        c, db, drive_dir, data_dir = client
        buffer = io.BytesIO()
        image = Image.new("RGBA", (640, 480), CLEAR)
        ImageDraw.Draw(image).rectangle(_centre_box((640, 480)), fill=INK)
        image.save(buffer, format="PNG")
        payload = buffer.getvalue()

        res = c.post(
            f"/api/drives/{TEST_DRIVE}/upload/init",
            json={
                "filename": "logo.png",
                "file_size": len(payload),
                "folder_path": "",
                "chunk_size": len(payload),
            },
        )
        assert res.status_code == 200
        upload_id = res.json()["upload_id"]
        c.post(
            f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/chunk",
            data={"chunk_index": "0"},
            files={"chunk": ("chunk", io.BytesIO(payload), "image/png")},
        )
        assert c.post(
            f"/api/drives/{TEST_DRIVE}/upload/{upload_id}/complete"
        ).status_code == 200

        record = _row(db, "logo.png")
        assert record.thumbnail_path == f".by-id/{record.id}.jpg"
        res = c.get(f"/api/files/{record.id}/thumbnail")
        assert res.status_code == 200
        assert res.headers["content-type"].split(";")[0] == "image/webp"
        assert _signature(res.content) == "webp"
        assert _alpha_at(io.BytesIO(res.content), (1, 1)) == 0


# --- serving ---------------------------------------------------------------


def _video_row(db, drive_dir):
    import shutil

    shutil.copy(FIXTURES_DIR / "short_video.mp4", drive_dir / "clip.mp4")
    row = File(
        filename="clip.mp4",
        title="clip",
        drive=TEST_DRIVE,
        folder_path="",
        file_path="clip.mp4",
        file_size=(drive_dir / "clip.mp4").stat().st_size,
        file_type="video",
        mime_type="video/mp4",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _webp_bytes():
    buffer = io.BytesIO()
    Image.new("RGBA", (32, 32), CLEAR).save(buffer, format="WEBP")
    return buffer.getvalue()


def _png_bytes():
    buffer = io.BytesIO()
    Image.new("RGBA", (32, 32), CLEAR).save(buffer, format="PNG")
    return buffer.getvalue()


def _jpeg_bytes():
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32), (10, 20, 30)).save(buffer, format="JPEG")
    return buffer.getvalue()


class TestThumbnailContentTypeFollowsTheBytes:

    CASES = [
        # (case, stored bytes or None for the placeholder, expected type)
        ("webp", _webp_bytes, "image/webp"),
        ("png", _png_bytes, "image/png"),
        ("jpeg", _jpeg_bytes, "image/jpeg"),
        ("riff-but-not-webp", lambda: b"RIFF\x00\x00\x00\x00WAVEfmt ", "image/jpeg"),
        ("shorter-than-a-signature", lambda: b"RIFF\x00", "image/jpeg"),
        ("empty", lambda: b"", "image/jpeg"),
        ("placeholder", None, "image/jpeg"),
    ]

    def test_spec_core_006_content_type_is_read_from_the_stored_bytes(self, client):
        c, db, drive_dir, data_dir = client
        row = _video_row(db, drive_dir)
        thumb = data_dir / "thumbnails" / TEST_DRIVE / "t.jpg"
        thumb.parent.mkdir(parents=True, exist_ok=True)

        observed = {}
        for case, make, _expected in self.CASES:
            if make is None:
                row.thumbnail_path = None
            else:
                thumb.write_bytes(make())
                row.thumbnail_path = f"{TEST_DRIVE}/t.jpg"
            db.commit()
            res = c.get(f"/api/files/{row.id}/thumbnail")
            assert res.status_code == 200, case
            observed[case] = res.headers["content-type"].split(";")[0]

        assert observed == {case: expected for case, _m, expected in self.CASES}

    def test_spec_core_006_a_webp_thumbnail_revalidates_like_a_jpeg_one(self, client):
        c, db, drive_dir, data_dir = client
        row = _video_row(db, drive_dir)
        thumb = data_dir / "thumbnails" / TEST_DRIVE / "t.jpg"
        thumb.parent.mkdir(parents=True, exist_ok=True)
        thumb.write_bytes(_webp_bytes())
        row.thumbnail_path = f"{TEST_DRIVE}/t.jpg"
        db.commit()

        full = c.get(f"/api/files/{row.id}/thumbnail")
        assert full.status_code == 200
        assert full.headers["content-type"].split(";")[0] == "image/webp"
        assert full.headers["cache-control"] == "no-cache"
        assert full.content == thumb.read_bytes()

        res = c.get(
            f"/api/files/{row.id}/thumbnail",
            headers={"If-None-Match": full.headers["etag"]},
        )
        assert res.status_code == 304
        assert res.content == b""
        assert res.headers["etag"] == full.headers["etag"]
        assert res.headers["last-modified"] == full.headers["last-modified"]
        assert res.headers["cache-control"] == "no-cache"


# --- scan migration --------------------------------------------------------


def _old_jpeg(stored, source, *, size=None):
    """What an upgrade finds in the slot: the picture flattened to JPEG."""
    with Image.open(source) as image:
        box = size or image_thumbnail_size(*image.size)
        flat = image.convert("RGB").resize(box)
    stored.parent.mkdir(parents=True, exist_ok=True)
    flat.save(stored, format="JPEG", quality=90)


def _stored_webp(stored, source):
    with Image.open(source) as image:
        box = image_thumbnail_size(*image.size)
        shrunk = image.convert("RGBA").resize(box)
    stored.parent.mkdir(parents=True, exist_ok=True)
    shrunk.save(stored, format="WEBP")


def _snapshot(path):
    return path.read_bytes(), path.stat().st_mtime_ns


def _register(db, drive_dir, name, build):
    source = drive_dir / name
    source.parent.mkdir(parents=True, exist_ok=True)
    build(source)
    file_id = register_single_file(db, "test-drive", source)
    db.commit()
    record = db.query(File).filter(File.id == file_id).one()
    return source, record, config.THUMBNAILS_DIR / record.thumbnail_path


class TestScanReplacesJpegThumbnailsOfTransparentPictures:

    def test_spec_core_006_a_scan_turns_a_stored_jpeg_into_a_webp(
        self, tmp_path, db_session, monkeypatch, caplog
    ):
        drive_dir = _scan_drive(tmp_path, monkeypatch)
        source, record, stored = _register(db_session, drive_dir, "logo.png", _rgba_png)
        thumbnail_path = record.thumbnail_path
        _old_jpeg(stored, source)
        rows_before = db_session.query(File).count()
        caplog.set_level(logging.INFO)

        result = scanner_module._scan_and_register(db_session, "test-drive")
        db_session.commit()

        data = stored.read_bytes()
        assert _signature(data) == "webp"
        assert _alpha_at(stored, (1, 1)) == 0
        assert _row(db_session, "logo.png").thumbnail_path == thumbnail_path
        assert db_session.query(File).count() == rows_before
        assert result["updated"] == 1
        assert "Updated file" in caplog.text

    def test_spec_core_006_a_trashed_row_is_migrated_too(
        self, tmp_path, db_session, monkeypatch
    ):
        drive_dir = _scan_drive(tmp_path, monkeypatch)
        source, record, stored = _register(db_session, drive_dir, "logo.png", _rgba_png)
        _old_jpeg(stored, source)
        record.deleted_at = datetime.now(UTC)
        db_session.commit()

        scanner_module._scan_and_register(db_session, "test-drive")
        db_session.commit()

        assert _signature(stored.read_bytes()) == "webp"

    def test_spec_core_006_the_same_scan_leaves_every_other_thumbnail_alone(
        self, tmp_path, db_session, monkeypatch
    ):
        drive_dir = _scan_drive(tmp_path, monkeypatch)

        kept_source, _r, kept = _register(db_session, drive_dir, "kept.png", _rgba_png)
        _stored_webp(kept, kept_source)

        flat_webp_source, _r, flat_webp = _register(
            db_session, drive_dir, "flat_webp.png", _opaque_png
        )
        _stored_webp(flat_webp, flat_webp_source)

        flat_source, _r, flat = _register(db_session, drive_dir, "flat.png", _opaque_png)
        _old_jpeg(flat, flat_source)

        def jpeg_photo(path):
            Image.new("RGB", (640, 480), (30, 90, 160)).save(path, format="JPEG")

        photo_source, _r, photo = _register(db_session, drive_dir, "photo.jpg", jpeg_photo)

        import shutil

        shutil.copy(FIXTURES_DIR / "short_video.mp4", drive_dir / "clip.mp4")
        clip_id = register_single_file(db_session, "test-drive", drive_dir / "clip.mp4")
        db_session.commit()
        clip_row = db_session.query(File).filter(File.id == clip_id).one()
        clip = config.THUMBNAILS_DIR / clip_row.thumbnail_path

        untouched = {"kept": kept, "flat_webp": flat_webp, "flat": flat, "photo": photo, "clip": clip}

        heic_source = None
        try:
            import pillow_heif

            pillow_heif.register_heif_opener()

            def heic_with_alpha(path):
                image = Image.new("RGBA", (640, 480), CLEAR)
                ImageDraw.Draw(image).rectangle(_centre_box((640, 480)), fill=INK)
                image.save(path, format="HEIF")

            heic_source, _r, heic = _register(
                db_session, drive_dir, "logo.heic", heic_with_alpha
            )
            untouched["heic"] = heic
        except ImportError:
            pass

        migrating_source, _r, migrating = _register(
            db_session, drive_dir, "migrating.png", _rgba_png
        )
        _old_jpeg(migrating, migrating_source)

        before = {name: _snapshot(path) for name, path in untouched.items()}
        opened = _watch_pillow_opens(monkeypatch)

        scanner_module._scan_and_register(db_session, "test-drive")
        db_session.commit()

        after = {name: _snapshot(path) for name, path in untouched.items()}
        assert after == before
        assert _signature(flat_webp.read_bytes()) == "webp"
        never_opened = {os.path.realpath(str(kept_source)), os.path.realpath(str(photo_source))}
        assert never_opened.isdisjoint(opened), opened

        assert _signature(migrating.read_bytes()) == "webp"

    def test_spec_core_006_a_shared_slot_is_never_written(
        self, tmp_path, db_session, monkeypatch
    ):
        drive_dir = _scan_drive(tmp_path, monkeypatch)
        logo_png, png_row, slot = _register(db_session, drive_dir, "logo.png", _rgba_png)

        def same_size_jpeg(path):
            Image.new("RGB", (640, 480), (30, 90, 160)).save(path, format="JPEG")

        _src, jpg_row, _slot = _register(db_session, drive_dir, "logo.jpg", same_size_jpeg)
        jpg_row.thumbnail_path = png_row.thumbnail_path
        db_session.commit()
        _old_jpeg(slot, logo_png)

        other_source, _r, other = _register(db_session, drive_dir, "other.png", _rgba_png)
        _old_jpeg(other, other_source)

        before = _snapshot(slot)
        scanner_module._scan_and_register(db_session, "test-drive")
        db_session.commit()

        assert _snapshot(slot) == before
        assert _signature(other.read_bytes()) == "webp"

    def test_spec_core_006_a_failed_migration_changes_nothing_and_retries(
        self, tmp_path, db_session, monkeypatch, caplog
    ):
        drive_dir = _scan_drive(tmp_path, monkeypatch)

        def portrait(path):
            _rgba_png(path, size=(768, 1024))

        source, record, stored = _register(db_session, drive_dir, "logo.png", portrait)
        thumbnail_path = record.thumbnail_path
        # Letterboxed: if the letterbox migration ran on this row it would
        # rewrite the slot, which this row must not see once checks 1-4 pass.
        _old_jpeg(stored, source, size=(320, 180))
        before = _snapshot(stored)
        calls = _watch_ffmpeg(monkeypatch, fail_webp=True)
        caplog.set_level(logging.WARNING)

        result = scanner_module._scan_and_register(db_session, "test-drive")
        db_session.commit()
        first_scan = list(calls)

        assert _snapshot(stored) == before
        assert _row(db_session, "logo.png").thumbnail_path == thumbnail_path
        assert result["updated"] == 0
        assert [_is_webp_command(c) for c in first_scan] == [True], first_scan
        warnings = [
            r.getMessage() for r in caplog.records if r.levelno == logging.WARNING
        ]
        assert any("logo.png" in message for message in warnings), warnings

        calls.clear()
        scanner_module._scan_and_register(db_session, "test-drive")
        db_session.commit()

        assert [_is_webp_command(c) for c in calls] == [True], calls
        assert _snapshot(stored) == before


# --- Markdown projection ---------------------------------------------------


class TestMarkdownProjectionCarriesTheWebp:

    def test_spec_core_006_a_note_serves_its_pictures_webp_after_the_next_scan(
        self, client
    ):
        c, db, drive_dir, data_dir = client
        source = drive_dir / "photos" / "logo.png"
        source.parent.mkdir(parents=True)
        _rgba_png(source)
        picture_id = register_single_file(db, TEST_DRIVE, source)
        db.commit()
        picture = db.query(File).filter(File.id == picture_id).one()
        slot = data_dir / "thumbnails" / picture.thumbnail_path
        _old_jpeg(slot, source)

        (drive_dir / "notes.md").write_text(f"![logo](loft://{picture_id})\n")
        note = File(
            id="note123def45",
            filename="notes.md",
            title="notes",
            drive=TEST_DRIVE,
            folder_path="",
            file_path="notes.md",
            file_size=1,
            file_type="document",
            mime_type="text/markdown",
        )
        db.add(note)
        db.commit()

        scanner_module._scan_and_register(db, TEST_DRIVE)
        db.commit()
        scanner_module._scan_and_register(db, TEST_DRIVE)
        db.commit()

        res = c.get(f"/api/files/{note.id}/thumbnail")
        assert res.status_code == 200
        assert res.headers["content-type"].split(";")[0] == "image/webp"
        assert res.content == slot.read_bytes()
        assert _signature(res.content) == "webp"
