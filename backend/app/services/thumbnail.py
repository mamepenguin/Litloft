import json
import logging
import math
import os
import subprocess
import tempfile
from collections import Counter
from pathlib import Path

logger = logging.getLogger(__name__)


def get_video_duration(video_path: str) -> float | None:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "quiet",
                "-show_format",
                "-print_format", "json",
                video_path,
            ],
            capture_output=True,
            text=True,
            errors="replace",
            check=False,
            timeout=30,
        )
        if result.returncode != 0:
            logger.error("ffprobe failed for %s: %s", video_path, result.stderr)
            return None

        data = json.loads(result.stdout)
        duration_str = data.get("format", {}).get("duration")
        if duration_str is None:
            return None
        return float(duration_str)
    except (subprocess.TimeoutExpired, json.JSONDecodeError, ValueError) as e:
        logger.error("Failed to get duration for %s: %s", video_path, e)
        return None


def get_media_chapters(media_path: str) -> list[dict] | None:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "quiet",
                "-show_chapters",
                "-print_format", "json",
                media_path,
            ],
            capture_output=True,
            text=True,
            errors="replace",
            check=False,
            timeout=30,
        )
        if result.returncode != 0:
            logger.error("ffprobe chapters failed for %s: %s", media_path, result.stderr)
            return None

        data = json.loads(result.stdout)
        # Extraction only — where ffprobe keeps each part. Filtering,
        # coercion and ordering are the rules every producer shares and
        # live in ``chapters.normalise_chapters``; importing it here
        # would close a cycle, so the caller composes the two.
        return [
            {
                "start_time": chapter.get("start_time"),
                "end_time": chapter.get("end_time"),
                "title": (chapter.get("tags") or {}).get("title"),
            }
            for chapter in data.get("chapters", []) or []
        ]
    except (
        OSError,
        subprocess.TimeoutExpired,
        json.JSONDecodeError,
        AttributeError,
        TypeError,
        ValueError,
    ) as error:
        logger.error("Failed to get chapters for %s: %s", media_path, error)
        return None


# Recognized ISO BMFF / QuickTime container format names reported by
# ffprobe. We only trust a stream sniff when the format is one of these
# — random binaries that happen to parse partially can otherwise produce
# spurious audio-stream hits.
_MP4_FAMILY_FORMATS = frozenset({
    "mov,mp4,m4a,3gp,3g2,mj2",
    "mp4",
    "m4a",
    "mov",
    "isom",
})


def probe_stream_kinds(media_path: str) -> dict | None:
    """Return ``{"video": bool, "audio": bool, "format": str}`` or None
    on probe failure.

    Returning None means ffprobe could not parse the file at all (treat
    as unknown — callers should not draw conclusions about content).
    """
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "quiet",
                "-show_entries", "format=format_name:stream=codec_type",
                "-print_format", "json",
                media_path,
            ],
            capture_output=True,
            text=True,
            errors="replace",
            check=False,
            timeout=30,
        )
        if result.returncode != 0:
            logger.error("ffprobe streams failed for %s: %s", media_path, result.stderr)
            return None

        data = json.loads(result.stdout)
        format_name = (data.get("format", {}) or {}).get("format_name", "") or ""
        streams = data.get("streams", []) or []
        kinds = {s.get("codec_type") for s in streams}
        return {
            "video": "video" in kinds,
            "audio": "audio" in kinds,
            "format": format_name,
        }
    except (subprocess.TimeoutExpired, json.JSONDecodeError, ValueError) as e:
        logger.error("Failed to probe streams for %s: %s", media_path, e)
        return None


def is_recognized_mp4_family(format_name: str) -> bool:
    """Return True when ffprobe identified an MP4/M4A/MOV-family container."""
    return format_name in _MP4_FAMILY_FORMATS


def has_video_stream(media_path: str) -> bool | None:
    """Return True if the container holds at least one video stream.

    Returns None on probe failure.
    """
    info = probe_stream_kinds(media_path)
    if info is None:
        return None
    return info["video"]


CANDIDATE_SCALE_FILTER = "scale=320:180:force_original_aspect_ratio=decrease"
SCALE_FILTER = f"{CANDIDATE_SCALE_FILTER},pad=320:180:(ow-iw)/2:(oh-ih)/2"

# The longest edge a picture thumbnail is allowed, in either direction.
#
# A picture keeps its own proportions and is not padded onto a frame, so
# the box is square and only one of the two edges reaches it. 320 is the
# same number the video frame uses for its width, so a landscape picture
# is stored at exactly the size it was before.
IMAGE_THUMBNAIL_BOX = 320

SEEK_MIN = 2.0
SEEK_MAX = 60.0
SHORT_VIDEO_THRESHOLD = 10.0
INTRO_SKIP_RATIO = 0.1
DOMINANT_COLOR_THRESHOLD = 0.5
COLOR_BUCKET_SIZE = 16
COLOR_TOLERANCE = 20
MAX_THUMBNAIL_CANDIDATES = 6
MAX_CANDIDATE_SEEK_STEP = 10.0
VIDEO_THUMBNAIL_JPEG_QUALITY = 95


def _calculate_seek_time(duration: float | None) -> float:
    """Calculate seek time to skip intros (10% of duration, min 2s, max 60s)."""
    if duration is None or duration < SHORT_VIDEO_THRESHOLD:
        return 0.0
    return min(max(duration * INTRO_SKIP_RATIO, SEEK_MIN), SEEK_MAX)


def _run_ffmpeg_thumbnail(
    video_path: str, output_path: str, seek_time: str, vf_filter: str
) -> bool:
    """Run ffmpeg with the given filter and return True if output was created."""
    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-ss", seek_time,
                "-i", video_path,
                "-vf", vf_filter,
                "-frames:v", "1",
                "-q:v", "2",
                "-y",
                output_path,
            ],
            capture_output=True,
            text=True,
            errors="replace",
            check=False,
            timeout=60,
        )
        if result.returncode != 0:
            logger.error(
                "ffmpeg thumbnail failed for %s: %s", video_path, result.stderr
            )
            return False
        return Path(output_path).exists()
    except subprocess.TimeoutExpired:
        logger.error("ffmpeg timeout for %s", video_path)
        return False


def _dominant_color_ratio(image_path: str | Path) -> float | None:
    """Return the share of pixels close to the candidate's dominant color.

    Coarse buckets locate the dominant color despite compression noise. The
    second pass counts nearby buckets too, so colors on a bucket boundary are
    not treated as unrelated. ``None`` keeps image-analysis failures fail-open.
    """
    from PIL import Image

    try:
        with Image.open(image_path) as source:
            pixels = list(source.convert("RGB").getdata())
    except (OSError, ValueError) as error:
        logger.warning(
            "Could not analyze thumbnail candidate %s: %s", image_path, error
        )
        return None

    if not pixels:
        return None

    buckets = Counter(
        (red // COLOR_BUCKET_SIZE, green // COLOR_BUCKET_SIZE, blue // COLOR_BUCKET_SIZE)
        for red, green, blue in pixels
    )
    dominant_bucket, _ = buckets.most_common(1)[0]
    dominant_pixels = [
        pixel
        for pixel in pixels
        if tuple(channel // COLOR_BUCKET_SIZE for channel in pixel) == dominant_bucket
    ]
    dominant_color = tuple(
        sum(pixel[channel] for pixel in dominant_pixels) / len(dominant_pixels)
        for channel in range(3)
    )
    near_dominant = sum(
        1
        for pixel in pixels
        if max(
            abs(pixel[channel] - dominant_color[channel]) for channel in range(3)
        )
        <= COLOR_TOLERANCE
    )
    return near_dominant / len(pixels)


def _candidate_seek_times(duration: float | None, initial_seek: float) -> list[float]:
    if duration is None:
        step = MAX_CANDIDATE_SEEK_STEP
    else:
        step = min(
            MAX_CANDIDATE_SEEK_STEP,
            max(1.0, duration / MAX_THUMBNAIL_CANDIDATES),
        )

    times: list[float] = []
    for index in range(MAX_THUMBNAIL_CANDIDATES):
        seek = initial_seek + (step * index)
        if duration is not None and seek >= duration:
            break
        times.append(seek)
    return times or [initial_seek]


def _finalize_video_thumbnail(candidate_path: str | Path, output_path: str) -> bool:
    """Pad a content-only candidate to the public 320x180 JPEG format."""
    from PIL import Image

    try:
        with Image.open(candidate_path) as source:
            candidate = source.convert("RGB")
            candidate.thumbnail((320, 180), Image.Resampling.LANCZOS)
            canvas = Image.new("RGB", (320, 180), (0, 0, 0))
            canvas.paste(
                candidate,
                ((320 - candidate.width) // 2, (180 - candidate.height) // 2),
            )
            canvas.save(
                output_path,
                format="JPEG",
                quality=VIDEO_THUMBNAIL_JPEG_QUALITY,
            )
        return Path(output_path).exists()
    except (OSError, ValueError) as error:
        logger.error("Could not finalize thumbnail %s: %s", output_path, error)
        return False


def generate_thumbnail(video_path: str, output_path: str) -> bool:
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    duration = get_video_duration(video_path)
    initial_seek = _calculate_seek_time(duration)
    candidate_paths: list[Path] = []
    best_candidate: tuple[float, Path] | None = None

    # Analyze before padding so portrait and ultrawide videos are not rejected
    # merely because their generated 320x180 thumbnails contain black bars.
    candidate_vf = f"thumbnail=300,{CANDIDATE_SCALE_FILTER}"
    try:
        for seek in _candidate_seek_times(duration, initial_seek):
            with tempfile.NamedTemporaryFile(
                prefix=f".{output.stem}-candidate-",
                suffix=".jpg",
                dir=output.parent,
                delete=False,
            ) as temporary:
                candidate_path = Path(temporary.name)
            candidate_path.unlink(missing_ok=True)
            candidate_paths.append(candidate_path)

            if not _run_ffmpeg_thumbnail(
                video_path,
                str(candidate_path),
                str(seek),
                candidate_vf,
            ):
                break

            dominant_ratio = _dominant_color_ratio(candidate_path)
            if dominant_ratio is None or dominant_ratio < DOMINANT_COLOR_THRESHOLD:
                if _finalize_video_thumbnail(candidate_path, output_path):
                    return True
                break

            if best_candidate is None or dominant_ratio < best_candidate[0]:
                best_candidate = (dominant_ratio, candidate_path)
            logger.debug(
                "Rejected uniform thumbnail candidate for %s at %.1fs (ratio %.3f)",
                video_path,
                seek,
                dominant_ratio,
            )

        # Some videos are intentionally near-monochrome. Keep the least-uniform
        # candidate rather than leaving those videos without a thumbnail.
        if best_candidate is not None and _finalize_video_thumbnail(
            best_candidate[1], output_path
        ):
            return True
    finally:
        for candidate_path in candidate_paths:
            candidate_path.unlink(missing_ok=True)

    # Fallback: simple seek (original method)
    logger.warning("Thumbnail filter failed for %s, falling back to seek", video_path)
    fallback_seek = "0" if duration is None or duration < 5 else "5"
    return _run_ffmpeg_thumbnail(video_path, output_path, fallback_seek, SCALE_FILTER)


def image_scale_filter(box: int = IMAGE_THUMBNAIL_BOX) -> str:
    """Fit a picture inside a square box without padding or upscaling.

    ``min(box,iw)`` rather than a bare ``box``: ``decrease`` fits the
    picture inside whatever box it is given, and a box larger than the
    source is still a box it will grow into. Taking the minimum on each
    edge first makes the box no larger than the picture, so a small
    picture is stored at its own size.
    """
    return (
        f"scale='min({box},iw)':'min({box},ih)'"
        ":force_original_aspect_ratio=decrease"
    )


def _round_like_scale(value: float) -> int:
    """``scale`` rounds a half up, away from zero; Python rounds it to even.

    The difference shows on every source whose fitted edge lands on a
    half — 640x361 is one — and it is not cosmetic here: the caller
    below decides from this number whether a stored thumbnail is the one
    the generator would produce today.
    """
    return math.floor(value + 0.5)


def image_thumbnail_size(
    width: int, height: int, box: int = IMAGE_THUMBNAIL_BOX
) -> tuple[int, int] | None:
    """The size the generators produce for a source of this size.

    A second implementation of what ffmpeg and Pillow are asked to do,
    so a caller can ask what a thumbnail *should* measure without opening
    one. `test_thumbnail.py` runs the three against each other, because a
    drift between them is what makes the migration read a thumbnail as
    the wrong generation.

    The box is taken against the source on each edge before the factor is
    formed, which is what keeps a small picture at its own size. A factor
    that rounds an edge to zero leaves that edge alone: ``scale`` reads a
    computed 0 as "keep the input", and the prediction has to say what
    the generator does rather than what the geometry would.
    """
    if width <= 0 or height <= 0:
        return None
    factor = min(min(box, width) / width, min(box, height) / height)
    return (
        _round_like_scale(width * factor) or width,
        _round_like_scale(height * factor) or height,
    )


def generate_image_thumbnail(image_path: str, output_path: str) -> bool:
    from app.services.heic import is_heic_file

    if is_heic_file(image_path):
        return _generate_heic_thumbnail(image_path, output_path)

    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-i", image_path,
                "-frames:v", "1",
                "-vf",
                image_scale_filter(),
                "-q:v", "2",
                "-y",
                output_path,
            ],
            capture_output=True,
            text=True,
            errors="replace",
            check=False,
            timeout=30,
        )
        if result.returncode != 0:
            logger.error(
                "ffmpeg image thumbnail failed for %s: %s", image_path, result.stderr
            )
            return False

        return output.exists()
    except subprocess.TimeoutExpired:
        logger.error("ffmpeg timeout for image %s", image_path)
        return False


def generate_pdf_thumbnail(pdf_path: str, output_path: str) -> bool:
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    try:
        import fitz  # PyMuPDF
        from PIL import Image

        doc = fitz.open(pdf_path)
        if len(doc) == 0:
            return False

        page = doc[0]
        mat = fitz.Matrix(1.5, 1.5)
        pix = page.get_pixmap(matrix=mat)

        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        img.thumbnail((320, 180))

        # A page keeps its frame, where a picture does not.
        #
        # The white is the page's own margin continued to the edge of the
        # card, and it is what makes a first page read as a page. Fitting
        # the sheet to its own proportions instead would leave the card
        # cropping a portrait page to 16:9, which is a band of body text
        # with no edges in it — recognisable as neither the document nor
        # a picture of one.
        thumb_w, thumb_h = img.size
        canvas = Image.new("RGB", (320, 180), (255, 255, 255))
        canvas.paste(img, ((320 - thumb_w) // 2, (180 - thumb_h) // 2))
        canvas.save(output_path, format="JPEG", quality=85)

        return output.exists()
    except Exception as e:
        logger.error("PDF thumbnail failed for %s: %s", pdf_path, e)
        return False


def write_thumbnail_atomically(generator, source: str, destination: str) -> bool:
    """Generate into a sibling temporary file, then rename it into place.

    A destination that already exists is one the thumbnail endpoint is
    serving, and every generator here writes its output incrementally —
    ffmpeg truncates the file and fills it, Pillow the same — so a reader
    arriving mid-write is served a partial JPEG or an empty one. `rename`
    within a directory is atomic, so a reader sees one file or the other
    and never a file being written.

    Conventions: "Atomic file writes: write to `.tmp` then `os.replace()`".
    """
    target = Path(destination)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{target.stem}.", suffix=".jpg", dir=target.parent
    )
    os.close(fd)
    try:
        if not generator(source, tmp_name):
            return False
        os.replace(tmp_name, destination)
        return True
    finally:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass


def get_thumbnail_generator(file_type: str, mime_type: str | None):
    """Return the thumbnail generator for this file type, or None if not thumbnailable."""
    from app.services.filetype import LOFT_MIME_TYPE

    if mime_type == LOFT_MIME_TYPE:
        return None
    if file_type == "video":
        return generate_thumbnail
    if file_type == "image":
        return generate_image_thumbnail
    if file_type == "document" and mime_type == "application/pdf":
        return generate_pdf_thumbnail
    return None


def _generate_heic_thumbnail(image_path: str, output_path: str) -> bool:
    """Generate a thumbnail from a HEIC/HEIF image using Pillow."""
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    try:
        from PIL import Image, ImageOps

        # pillow_heif opener is registered at module load in heic.py
        from app.services import heic  # noqa: F401 — ensures registration

        with Image.open(image_path) as img:
            oriented = ImageOps.exif_transpose(img)
            # Resized to a size that is computed, not to ``thumbnail``'s
            # own fit. `Image.thumbnail` picks the integer that best
            # preserves the ratio and breaks ties downwards, which is a
            # third rounding rule beside ffmpeg's and this module's — so
            # the same picture came out a pixel narrower as HEIC than as
            # JPEG, and the migration's prediction was right for only one
            # of them.
            target = image_thumbnail_size(*oriented.size)
            if target is not None and target != oriented.size:
                oriented = oriented.resize(target, Image.Resampling.LANCZOS)
            oriented.convert("RGB").save(
                output_path, format="JPEG", quality=85, exif=b""
            )

        return output.exists()
    except Exception as e:
        logger.error("Pillow HEIC thumbnail failed for %s: %s", image_path, e)
        return False
