"""Subtitle detection and SRT-to-VTT conversion."""

import logging
import re
import shutil
import unicodedata
from pathlib import Path

logger = logging.getLogger(__name__)

_SUBTITLE_EXTENSIONS = frozenset({".srt", ".vtt"})

# Common language codes (ISO 639-1 subset)
_LANG_NAMES = {
    "ja": "Japanese",
    "en": "English",
    "zh": "Chinese",
    "ko": "Korean",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "pt": "Portuguese",
    "it": "Italian",
    "ru": "Russian",
    "ar": "Arabic",
    "th": "Thai",
    "vi": "Vietnamese",
    "jpn": "Japanese",
    "eng": "English",
    "chi": "Chinese",
    "kor": "Korean",
}


def is_subtitle_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in _SUBTITLE_EXTENSIONS


def _parse_subtitle_filename(video_stem: str, subtitle_path: Path) -> str | None:
    """Extract language from subtitle filename relative to the video.

    Patterns:
      video.srt           -> ""  (default/unknown)
      video.en.srt        -> "en"
      video.ja.vtt        -> "ja"
      video.eng.srt       -> "eng"
    """
    sub_ext = subtitle_path.suffix.lower()
    if sub_ext not in _SUBTITLE_EXTENSIONS:
        return None

    # Scanner stores DB paths in NFC, but iterdir() may yield NFD on
    # some filesystems (notably APFS). Normalize both sides so CJK
    # names with dakuten/handakuten compare equal.
    video_stem = unicodedata.normalize("NFC", video_stem)
    sub_stem = unicodedata.normalize("NFC", subtitle_path.stem)

    if sub_stem == video_stem:
        return ""

    if sub_stem.startswith(video_stem + "."):
        lang_part = sub_stem[len(video_stem) + 1:]
        if re.match(r"^[a-zA-Z]{2,3}$", lang_part):
            return lang_part.lower()

    return None


def detect_subtitles(video_file_path: str, drive_path: Path) -> list[dict]:
    """Detect subtitle files for a video in the same folder.

    Returns list of dicts: [{"path": "relative/path.srt", "language": "en", "format": "srt", "label": "English"}]
    """
    video_path = drive_path / video_file_path
    if not video_path.exists():
        return []

    video_dir = video_path.parent
    video_stem = video_path.stem

    subtitles = []
    try:
        for item in video_dir.iterdir():
            if not item.is_file():
                continue
            lang = _parse_subtitle_filename(video_stem, item)
            if lang is None:
                continue

            fmt = item.suffix.lower().lstrip(".")
            label = _LANG_NAMES.get(lang, lang.upper() if lang else "")

            subtitles.append({
                "path": unicodedata.normalize("NFC", str(item.relative_to(drive_path))),
                "language": lang,
                "format": fmt,
                "label": label,
            })
    except OSError:
        return []

    subtitles.sort(key=lambda s: (s["language"] != "", s["language"]))
    return subtitles


def move_sidecar_subtitles(old_video: Path, new_video: Path) -> None:
    """Move the subtitle files named after ``old_video`` to match ``new_video``.

    Runs after the video has moved, so the old directory is listed here rather
    than taken from the caller. Best effort: a failure is logged and never
    raised, and an existing destination is left alone with its source in place.
    """
    old_stem = unicodedata.normalize("NFC", old_video.stem)
    new_stem = new_video.stem
    if old_video.parent == new_video.parent and old_stem == unicodedata.normalize("NFC", new_stem):
        return

    try:
        sidecars = [
            item
            for item in old_video.parent.iterdir()
            if item.is_file() and _parse_subtitle_filename(old_stem, item) is not None
        ]
    except OSError:
        logger.exception("subtitle sidecars: could not list %s", old_video.parent)
        return

    for item in sidecars:
        name = unicodedata.normalize("NFC", item.name)
        target = new_video.parent / (new_stem + name[len(old_stem):])
        try:
            if target.exists():
                logger.warning(
                    "subtitle sidecar %s not moved: %s already exists", item, target
                )
                continue
            shutil.move(str(item), str(target))
        except Exception:
            logger.exception("subtitle sidecar %s could not move to %s", item, target)


def convert_srt_to_vtt(srt_content: str) -> str:
    """Convert SRT subtitle format to WebVTT format."""
    lines = srt_content.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    vtt_lines = ["WEBVTT", ""]

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        if re.match(r"^\d+$", line):
            i += 1
            continue

        # Convert timestamps: 00:01:23,456 --> 00:02:34,567
        if "-->" in line:
            vtt_lines.append(line.replace(",", "."))
            i += 1
            continue

        vtt_lines.append(lines[i].rstrip())
        i += 1

    return "\n".join(vtt_lines)
