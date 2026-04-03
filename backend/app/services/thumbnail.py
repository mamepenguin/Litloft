import json
import logging
import subprocess
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


SCALE_FILTER = (
    "scale=320:180:force_original_aspect_ratio=decrease,"
    "pad=320:180:(ow-iw)/2:(oh-ih)/2"
)

SEEK_MIN = 2.0
SEEK_MAX = 60.0
SHORT_VIDEO_THRESHOLD = 10.0
INTRO_SKIP_RATIO = 0.1


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


def generate_thumbnail(video_path: str, output_path: str) -> bool:
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    duration = get_video_duration(video_path)
    seek = _calculate_seek_time(duration)
    seek_str = str(seek)

    # Primary: thumbnail filter (picks most representative frame)
    primary_vf = f"thumbnail=300,{SCALE_FILTER}"
    if _run_ffmpeg_thumbnail(video_path, output_path, seek_str, primary_vf):
        return True

    # Fallback: simple seek (original method)
    logger.warning("Thumbnail filter failed for %s, falling back to seek", video_path)
    fallback_seek = "0" if duration is None or duration < 5 else "5"
    return _run_ffmpeg_thumbnail(video_path, output_path, fallback_seek, SCALE_FILTER)


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
                "scale=320:180:force_original_aspect_ratio=decrease,"
                "pad=320:180:(ow-iw)/2:(oh-ih)/2",
                "-q:v", "2",
                "-y",
                output_path,
            ],
            capture_output=True,
            text=True,
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
            oriented.thumbnail((320, 180))

            thumb_w, thumb_h = oriented.size
            canvas = Image.new("RGB", (320, 180), (0, 0, 0))
            offset_x = (320 - thumb_w) // 2
            offset_y = (180 - thumb_h) // 2
            canvas.paste(oriented, (offset_x, offset_y))
            canvas.save(output_path, format="JPEG", quality=85, exif=b"")

        return output.exists()
    except Exception as e:
        logger.error("Pillow HEIC thumbnail failed for %s: %s", image_path, e)
        return False
