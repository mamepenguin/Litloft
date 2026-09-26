import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_SUBTITLE_EXTENSIONS = frozenset({".srt", ".vtt"})

DEFAULT_CLASSIFICATION = ("other", "application/octet-stream")

LOFT_MIME_TYPE = "application/vnd.litloft.loft+json"

# What Litloft does with a file, and what its bytes are, for every extension
# this project has decided about. An extension absent from it is
# ``DEFAULT_CLASSIFICATION``.
#
# This table is consulted first and last. ``mimetypes`` is not: it reads a
# table the host may or may not carry, so the same file was filed differently
# on a developer's machine and in the container — 889 of 1003 extensions gave a
# different answer and 193 changed bucket, measured in one image with and
# without ``/etc/mime.types``.
#
# The pair is two separate facts. ``file_type`` is what the listing, the
# filters and the viewers branch on; the mime is what the bytes are, and what
# the text-write and addon-read allowlists read. They are allowed to disagree:
# a source file is text that is not a document.
_EXTENSION_TABLE: dict[str, tuple[str, str]] = {
    # --- video (13) ---
    # The media_import addon's wrapper for media it cannot download. Its bytes
    # are a small JSON pointer, and it is filed as video because the player and
    # the listing branch on that — `is_probeable_media` is what keeps ffprobe
    # away from it. A future provider wrapping audio or an image needs a
    # per-provider lookup here, not a second table.
    ".loft": ("video", LOFT_MIME_TYPE),
    ".avi": ("video", "video/x-msvideo"),
    ".m1v": ("video", "video/mpeg"),
    ".mkv": ("video", "video/x-matroska"),
    ".mov": ("video", "video/quicktime"),
    ".movie": ("video", "video/x-sgi-movie"),
    ".mp4": ("video", "video/mp4"),
    ".mpa": ("video", "video/mpeg"),
    ".mpe": ("video", "video/mpeg"),
    ".mpeg": ("video", "video/mpeg"),
    ".mpg": ("video", "video/mpeg"),
    ".qt": ("video", "video/quicktime"),
    ".webm": ("video", "video/webm"),
    ".m2ts": ("video", "video/mp2t"),

    # --- image (23) ---
    ".avif": ("image", "image/avif"),
    ".bmp": ("image", "image/bmp"),
    ".gif": ("image", "image/gif"),
    ".heic": ("image", "image/heic"),
    ".heif": ("image", "image/heif"),
    ".ico": ("image", "image/vnd.microsoft.icon"),
    ".ief": ("image", "image/ief"),
    ".jpe": ("image", "image/jpeg"),
    ".jpeg": ("image", "image/jpeg"),
    ".jpg": ("image", "image/jpeg"),
    ".pbm": ("image", "image/x-portable-bitmap"),
    ".pgm": ("image", "image/x-portable-graymap"),
    ".webp": ("image", "image/webp"),
    ".png": ("image", "image/png"),
    ".pnm": ("image", "image/x-portable-anymap"),
    ".ppm": ("image", "image/x-portable-pixmap"),
    ".ras": ("image", "image/x-cmu-raster"),
    ".rgb": ("image", "image/x-rgb"),
    ".svg": ("image", "image/svg+xml"),
    ".tif": ("image", "image/tiff"),
    ".tiff": ("image", "image/tiff"),
    ".xbm": ("image", "image/x-xbitmap"),
    ".xpm": ("image", "image/x-xpixmap"),
    ".xwd": ("image", "image/x-xwindowdump"),

    # --- audio (21) ---
    ".3g2": ("audio", "audio/3gpp2"),
    ".3gp": ("audio", "audio/3gpp"),
    ".3gpp": ("audio", "audio/3gpp"),
    ".3gpp2": ("audio", "audio/3gpp2"),
    ".aac": ("audio", "audio/aac"),
    ".adts": ("audio", "audio/aac"),
    ".aif": ("audio", "audio/x-aiff"),
    ".aifc": ("audio", "audio/x-aiff"),
    ".aiff": ("audio", "audio/x-aiff"),
    ".ass": ("audio", "audio/aac"),
    ".au": ("audio", "audio/basic"),
    ".flac": ("audio", "audio/flac"),
    ".loas": ("audio", "audio/aac"),
    ".m4a": ("audio", "audio/mp4"),
    ".mp2": ("audio", "audio/mpeg"),
    ".mp3": ("audio", "audio/mpeg"),
    ".ogg": ("audio", "audio/ogg"),
    ".opus": ("audio", "audio/opus"),
    ".ra": ("audio", "audio/x-pn-realaudio"),
    ".snd": ("audio", "audio/basic"),
    ".wav": ("audio", "audio/x-wav"),

    # Prose in minimal markup. `.rst` was a document of its own; `.adoc` and
    # `.org` had no row at all.
    ".org": ("document", "application/octet-stream"),
    ".rst": ("document", "text/x-rst"),

    # --- document (39) ---
    ".csv": ("document", "text/csv"),
    ".doc": ("document", "application/msword"),
    ".docx": ("document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ".dot": ("document", "application/msword"),
    ".epub": ("document", "application/epub+zip"),
    ".etx": ("document", "text/x-setext"),
    ".htm": ("document", "text/html"),
    ".html": ("document", "text/html"),
    ".markdown": ("document", "text/markdown"),
    ".md": ("document", "text/markdown"),
    ".pdf": ("document", "application/pdf"),
    ".pot": ("document", "application/vnd.ms-powerpoint"),
    ".ppa": ("document", "application/vnd.ms-powerpoint"),
    ".pps": ("document", "application/vnd.ms-powerpoint"),
    ".ppt": ("document", "application/vnd.ms-powerpoint"),
    ".pptx": ("document", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    ".pwz": ("document", "application/vnd.ms-powerpoint"),
    ".rtx": ("document", "text/richtext"),
    ".tsv": ("document", "text/tab-separated-values"),
    ".txt": ("document", "text/plain"),
    ".wiz": ("document", "application/msword"),
    ".xlb": ("document", "application/vnd.ms-excel"),
    ".xls": ("document", "application/vnd.ms-excel"),
    ".xlsx": ("document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),

    # Source, configuration and shell: text a machine reads.
    #
    # The mime each row carries is the one it carried before, including the
    # rows that had none. The content-write allowlist and the addon read
    # allowlist are keyed on the mime, and the second of those serves a
    # protected drive without a drive-unlock check, so widening it is a
    # security decision and not a side effect of naming a bucket.
    ".adoc": ("other", "application/octet-stream"),
    ".bat": ("other", "text/plain"),
    ".c": ("other", "text/plain"),
    ".cc": ("other", "application/octet-stream"),
    ".cfg": ("other", "application/octet-stream"),
    ".conf": ("other", "application/octet-stream"),
    ".cpp": ("other", "application/octet-stream"),
    ".cs": ("other", "application/octet-stream"),
    ".css": ("other", "text/css"),
    ".cts": ("other", "application/octet-stream"),
    ".cxx": ("other", "application/octet-stream"),
    ".dart": ("other", "application/octet-stream"),
    ".ex": ("other", "application/octet-stream"),
    ".exs": ("other", "application/octet-stream"),
    ".go": ("other", "application/octet-stream"),
    ".gradle": ("other", "application/octet-stream"),
    ".graphql": ("other", "application/octet-stream"),
    ".h": ("other", "text/plain"),
    ".hpp": ("other", "application/octet-stream"),
    ".ini": ("other", "application/octet-stream"),
    ".java": ("other", "application/octet-stream"),
    ".js": ("other", "text/javascript"),
    ".json": ("other", "application/json"),
    ".jsx": ("other", "application/octet-stream"),
    ".kt": ("other", "application/octet-stream"),
    ".kts": ("other", "application/octet-stream"),
    ".ksh": ("other", "text/plain"),
    ".lua": ("other", "application/octet-stream"),
    ".mjs": ("other", "text/javascript"),
    # Also names an AVCHD stream; settled as the TypeScript module it
    # shares a family with. `.m2ts` is only ever AVCHD.
    ".mts": ("other", "application/octet-stream"),
    ".n3": ("other", "text/n3"),
    ".php": ("other", "application/octet-stream"),
    ".pl": ("other", "text/plain"),
    ".proto": ("other", "application/octet-stream"),
    ".py": ("other", "text/x-python"),
    ".r": ("other", "application/octet-stream"),
    ".rb": ("other", "application/octet-stream"),
    ".rs": ("other", "application/octet-stream"),
    ".scala": ("other", "application/octet-stream"),
    ".sgm": ("other", "text/x-sgml"),
    ".sgml": ("other", "text/x-sgml"),
    ".sql": ("other", "application/octet-stream"),
    ".svelte": ("other", "application/octet-stream"),
    ".swift": ("other", "application/octet-stream"),
    ".tf": ("other", "application/octet-stream"),
    ".tfvars": ("other", "application/octet-stream"),
    ".toml": ("other", "application/octet-stream"),
    ".ts": ("other", "application/octet-stream"),
    ".tsx": ("other", "application/octet-stream"),
    ".vcf": ("other", "text/x-vcard"),
    ".vue": ("other", "application/octet-stream"),
    ".xml": ("other", "text/xml"),
    ".yaml": ("other", "application/octet-stream"),
    ".yml": ("other", "application/octet-stream"),
    ".zsh": ("other", "application/octet-stream"),

    # --- archive (1) ---
    ".zip": ("archive", "application/zip"),

    # --- other (55) ---
    ".ai": ("other", "application/postscript"),
    ".bcpio": ("other", "application/x-bcpio"),
    ".cdf": ("other", "application/x-netcdf"),
    ".cpio": ("other", "application/x-cpio"),
    ".csh": ("other", "application/x-csh"),
    ".dvi": ("other", "application/x-dvi"),
    ".eml": ("other", "message/rfc822"),
    ".eps": ("other", "application/postscript"),
    ".gtar": ("other", "application/x-gtar"),
    ".h5": ("other", "application/x-hdf5"),
    ".hdf": ("other", "application/x-hdf"),
    ".latex": ("other", "application/x-latex"),
    ".m3u": ("other", "application/vnd.apple.mpegurl"),
    ".m3u8": ("other", "application/vnd.apple.mpegurl"),
    ".man": ("other", "application/x-troff-man"),
    ".me": ("other", "application/x-troff-me"),
    ".mht": ("other", "message/rfc822"),
    ".mhtml": ("other", "message/rfc822"),
    ".mif": ("other", "application/x-mif"),
    ".ms": ("other", "application/x-troff-ms"),
    ".nc": ("other", "application/x-netcdf"),
    ".nq": ("other", "application/n-quads"),
    ".nt": ("other", "application/n-triples"),
    ".nws": ("other", "message/rfc822"),
    ".oda": ("other", "application/oda"),
    ".p12": ("other", "application/x-pkcs12"),
    ".p7c": ("other", "application/pkcs7-mime"),
    ".pfx": ("other", "application/x-pkcs12"),
    ".ps": ("other", "application/postscript"),
    ".pyc": ("other", "application/x-python-code"),
    ".pyo": ("other", "application/x-python-code"),
    ".ram": ("other", "application/x-pn-realaudio"),
    ".rdf": ("other", "application/xml"),
    ".roff": ("other", "application/x-troff"),
    ".sh": ("other", "application/x-sh"),
    ".shar": ("other", "application/x-shar"),
    ".src": ("other", "application/x-wais-source"),
    ".sv4cpio": ("other", "application/x-sv4cpio"),
    ".sv4crc": ("other", "application/x-sv4crc"),
    ".swf": ("other", "application/x-shockwave-flash"),
    ".t": ("other", "application/x-troff"),
    ".tar": ("other", "application/x-tar"),
    ".tcl": ("other", "application/x-tcl"),
    ".tex": ("other", "application/x-tex"),
    ".texi": ("other", "application/x-texinfo"),
    ".texinfo": ("other", "application/x-texinfo"),
    ".tr": ("other", "application/x-troff"),
    ".trig": ("other", "application/trig"),
    ".ustar": ("other", "application/x-ustar"),
    ".wasm": ("other", "application/wasm"),
    ".webmanifest": ("other", "application/manifest+json"),
    ".wsdl": ("other", "application/xml"),
    ".xpdl": ("other", "application/xml"),
    ".xsl": ("other", "application/xml"),
}





def classify(filename: str) -> tuple[str, str]:
    ext = Path(filename).suffix.lower()

    if ext in _SUBTITLE_EXTENSIONS:
        mime = "text/vtt" if ext == ".vtt" else "application/x-subrip"
        return ("subtitle", mime)

    return _EXTENSION_TABLE.get(ext, DEFAULT_CLASSIFICATION)


def is_probeable_media(file_type: str, mime_type: str) -> bool:
    """Whether ffprobe can read this file's own bytes: a ``.loft`` is a
    pointer to media held elsewhere, not media."""
    return file_type in ("video", "audio") and mime_type != LOFT_MIME_TYPE


# Containers that frequently wrap audio-only payloads despite a
# "video/*" mime guess from the extension. Apple's iTunes ALAC/AAC-LC
# downloads sometimes ship with a ``.mp4`` extension instead of
# ``.m4a``; ``.mov`` containers can also
# be audio-only. When ffprobe confirms zero video streams we downgrade
# the classification so the UI shows the file as audio and cloud STT
# providers don't reject it as a malformed video.
_SNIFF_AUDIO_DOWNGRADE = {
    "video/mp4": "audio/mp4",
    "video/quicktime": "audio/mp4",
}


def refine_classification_with_probe(
    file_path: Path,
    file_type: str,
    mime_type: str,
) -> tuple[str, str]:
    """Sniff media containers that may be audio-only and downgrade if so.

    Conservative: only downgrades when ffprobe finds ``audio`` streams
    and no ``video`` streams. Probe failures and zero-stream files (e.g.
    truncated or non-media binaries written with a ``.mp4`` extension)
    leave the classification unchanged so existing video records keep
    their thumbnail / duration pipeline.
    """
    target_mime = _SNIFF_AUDIO_DOWNGRADE.get(mime_type)
    if target_mime is None:
        return (file_type, mime_type)

    from app.services.thumbnail import is_recognized_mp4_family, probe_stream_kinds

    info = probe_stream_kinds(str(file_path))
    if (
        info is not None
        and is_recognized_mp4_family(info["format"])
        and not info["video"]
        and info["audio"]
    ):
        logger.info(
            "Audio-only container detected: %s (%s -> %s)",
            file_path.name, mime_type, target_mime,
        )
        return ("audio", target_mime)
    return (file_type, mime_type)


def is_hidden(path: Path, base_dir: Path) -> bool:
    try:
        relative = path.relative_to(base_dir)
    except ValueError:
        return True
    return any(part.startswith(".") for part in relative.parts)
