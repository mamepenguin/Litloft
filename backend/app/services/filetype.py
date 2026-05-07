import mimetypes
from pathlib import Path

_CATEGORY_MAP = {
    "video": "video",
    "image": "image",
    "audio": "audio",
    "application/pdf": "document",
    "text": "document",
}

_SUBTITLE_EXTENSIONS = frozenset({".srt", ".vtt"})

_ARCHIVE_MIMES = frozenset({
    "application/zip",
    "application/x-zip-compressed",
})

_DOCUMENT_MIMES = frozenset({
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
})

# Mime → file_type override for vendor wrapper formats whose major
# component (``application``) doesn't reflect what the file actually
# contains. ``.loft`` is the media_import addon's link wrapper for
# media that can't be downloaded; today every registered provider
# (youtube / vimeo / soundcloud) wraps a video, so .loft is treated
# as ``video`` for search-time file_type filtering. If a future
# provider wraps audio / image, add the per-provider dispatch here
# (peek into the .loft JSON for ``provider`` and look it up).
_MIME_TYPE_OVERRIDES = {
    "application/vnd.litloft.loft+json": "video",
}

_EXTRA_MIMES = {
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".webm": "video/webm",
    # Phase 2F: Linux Docker's mimetypes DB lacks .m4a / .opus
    # entries (hako BDffxf4IyuwzRiZDnZuBZ + A-gF1mK3kDjRjS_dfuq1B).
    # ``audio/mp4`` is the IANA-registered MIME for AAC-in-MP4 audio
    # — choosing it over Apple's ``audio/m4a`` / ``audio/x-m4a``
    # de-facto values keeps macOS and Linux registrations identical
    # (macOS ``mimetypes.guess_type`` already returns ``audio/mp4``).
    ".m4a": "audio/mp4",
    ".opus": "audio/opus",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".doc": "application/msword",
    ".xls": "application/vnd.ms-excel",
    ".ppt": "application/vnd.ms-powerpoint",
    ".zip": "application/zip",
    ".loft": "application/vnd.litloft.loft+json",
}


def classify(filename: str) -> tuple[str, str]:
    ext = Path(filename).suffix.lower()

    if ext in _SUBTITLE_EXTENSIONS:
        mime = "text/vtt" if ext == ".vtt" else "application/x-subrip"
        return ("subtitle", mime)

    mime, _ = mimetypes.guess_type(filename)
    if mime is None:
        mime = _EXTRA_MIMES.get(ext, "application/octet-stream")

    if mime in _ARCHIVE_MIMES:
        return ("archive", mime)

    if mime in _DOCUMENT_MIMES:
        return ("document", mime)

    if mime in _MIME_TYPE_OVERRIDES:
        return (_MIME_TYPE_OVERRIDES[mime], mime)

    major = mime.split("/")[0]
    file_type = _CATEGORY_MAP.get(major, "other")

    return (file_type, mime)


def is_hidden(path: Path, base_dir: Path) -> bool:
    try:
        relative = path.relative_to(base_dir)
    except ValueError:
        return True
    return any(part.startswith(".") for part in relative.parts)
