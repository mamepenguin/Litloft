import logging
import os
import subprocess
import tempfile
from pathlib import Path

from app.services.thumbnail import get_video_duration

logger = logging.getLogger(__name__)

FRAME_COUNT = 8
FRAME_WIDTH = 320
FRAME_HEIGHT = 180


def _compute_timestamps(duration: float | None) -> list[float]:
    """Compute 8 timestamps for sprite sheet extraction.

    If duration is available and > 0, timestamps are evenly spaced
    at 0%, 12.5%, 25%, ... 87.5% of the duration.
    Otherwise, fall back to 0s, 1s, 2s, ... 7s.
    """
    if duration is not None and duration > 0:
        return [duration * i / FRAME_COUNT for i in range(FRAME_COUNT)]
    return [float(i) for i in range(FRAME_COUNT)]


def _extract_frame(video_path: str, timestamp: float, output_path: str) -> bool:
    """Extract a single frame at the given timestamp."""
    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-ss", str(timestamp),
                "-i", video_path,
                "-frames:v", "1",
                "-vf",
                f"scale={FRAME_WIDTH}:{FRAME_HEIGHT}:"
                "force_original_aspect_ratio=decrease,"
                f"pad={FRAME_WIDTH}:{FRAME_HEIGHT}:(ow-iw)/2:(oh-ih)/2",
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
            stderr_snippet = result.stderr.replace("\n", " ").replace("\r", "")[:500]
            logger.error(
                "ffmpeg frame extract failed at %.1fs for %s: %s",
                timestamp, video_path, stderr_snippet,
            )
            return False
        return Path(output_path).exists()
    except subprocess.TimeoutExpired:
        logger.error("ffmpeg timeout extracting frame at %.1fs for %s", timestamp, video_path)
        return False


def generate_preview_sprite(video_path: str, output_path: str) -> bool:
    """Generate an 8-frame horizontal sprite sheet (2560x180) from a video.

    Extracts 8 frames at evenly spaced intervals through the video,
    then tiles them horizontally into a single JPEG using Pillow.

    Returns True on success, False on failure.
    """
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    if not Path(video_path).exists():
        logger.error("Video file not found: %s", video_path)
        return False

    duration = get_video_duration(video_path)
    timestamps = _compute_timestamps(duration)

    try:
        from PIL import Image

        with tempfile.TemporaryDirectory() as tmpdir:
            frames: list[Image.Image] = []

            for i, ts in enumerate(timestamps):
                frame_path = str(Path(tmpdir) / f"frame_{i}.jpg")
                if not _extract_frame(video_path, ts, frame_path):
                    logger.error(
                        "Failed to extract frame %d at %.1fs for %s",
                        i, ts, video_path,
                    )
                    return False
                frames.append(Image.open(frame_path).copy())

            sprite = Image.new(
                "RGB",
                (FRAME_WIDTH * FRAME_COUNT, FRAME_HEIGHT),
                (0, 0, 0),
            )
            for i, frame in enumerate(frames):
                sprite.paste(frame, (i * FRAME_WIDTH, 0))

            tmp_output = output_path + ".tmp"
            sprite.save(tmp_output, format="JPEG", quality=85)
            os.replace(tmp_output, output_path)

            for frame in frames:
                frame.close()

        return output.exists()
    except Exception as e:
        logger.error("Failed to generate preview sprite for %s: %s", video_path, e)
        return False
