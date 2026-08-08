"""Markdown first-image extraction and local thumbnail projection.

This module is deliberately network-free. External image localization lives in
the admin import service; normal scans and content writes only project an
already-local ``loft://`` image into a Markdown-owned thumbnail cache.
"""
from __future__ import annotations

import os
import re
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from sqlalchemy.orm import Session

import app.config as config
from app.models import File, active_file_filter
from app.services.thumbnail import generate_image_thumbnail

ImageSyntax = Literal["inline", "reference", "html"]

_FENCE_RE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
_RAW_IMG_RE = re.compile(r"<img(?:\s|/?>)", re.IGNORECASE)
_LOFT_IMAGE_RE = re.compile(
    r"^loft://([A-Za-z0-9_-]{12})(?:[?#][^\s]*)?$"
)
_ESCAPED_PUNCTUATION_RE = re.compile(r"\\([!\"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])")


@dataclass(frozen=True)
class FirstMarkdownImage:
    syntax: ImageSyntax
    url: str | None
    destination_start: int | None
    destination_end: int | None


def _mask_range(chars: list[str], start: int, end: int) -> None:
    for index in range(start, end):
        if chars[index] not in "\r\n":
            chars[index] = " "


def _frontmatter_end(content: str) -> int:
    offset = 1 if content.startswith("\ufeff") else 0
    if not content.startswith("---", offset):
        return offset
    first_end = content.find("\n", offset)
    if first_end < 0 or content[offset:first_end].rstrip("\r") != "---":
        return offset
    cursor = first_end + 1
    while cursor < len(content):
        line_end = content.find("\n", cursor)
        if line_end < 0:
            line_end = len(content)
        line = content[cursor:line_end].rstrip("\r")
        if line in {"---", "..."}:
            return min(line_end + 1, len(content))
        cursor = line_end + 1
    return offset


def _mask_non_rendered_regions(content: str) -> str:
    chars = list(content)
    frontmatter_end = _frontmatter_end(content)
    if frontmatter_end:
        _mask_range(chars, 0, frontmatter_end)

    fence_char: str | None = None
    fence_len = 0
    cursor = frontmatter_end
    while cursor < len(content):
        line_end = content.find("\n", cursor)
        if line_end < 0:
            line_end = len(content)
        line = content[cursor:line_end]
        match = _FENCE_RE.match(line)
        if fence_char is None and match:
            marker = match.group(1)
            fence_char = marker[0]
            fence_len = len(marker)
            _mask_range(chars, cursor, min(line_end + 1, len(content)))
        elif fence_char is not None:
            _mask_range(chars, cursor, min(line_end + 1, len(content)))
            stripped = line.lstrip(" ")
            marker_len = len(stripped) - len(stripped.lstrip(fence_char))
            if len(line) - len(stripped) <= 3 and marker_len >= fence_len:
                fence_char = None
                fence_len = 0
        cursor = line_end + 1

    masked = "".join(chars)
    cursor = 0
    while True:
        start = masked.find("<!--", cursor)
        if start < 0:
            break
        end = masked.find("-->", start + 4)
        end = len(masked) if end < 0 else end + 3
        _mask_range(chars, start, end)
        masked = "".join(chars)
        cursor = end

    masked = "".join(chars)
    cursor = 0
    while cursor < len(masked):
        if masked[cursor] != "`":
            cursor += 1
            continue
        run_end = cursor + 1
        while run_end < len(masked) and masked[run_end] == "`":
            run_end += 1
        marker = masked[cursor:run_end]
        close = masked.find(marker, run_end)
        if close < 0:
            cursor = run_end
            continue
        end = close + len(marker)
        _mask_range(chars, cursor, end)
        masked = "".join(chars)
        cursor = end

    return "".join(chars)


def _is_escaped(content: str, index: int) -> bool:
    backslashes = 0
    cursor = index - 1
    while cursor >= 0 and content[cursor] == "\\":
        backslashes += 1
        cursor -= 1
    return backslashes % 2 == 1


def _find_alt_close(content: str, start: int) -> int | None:
    depth = 1
    cursor = start
    while cursor < len(content):
        char = content[cursor]
        if char == "\\":
            cursor += 2
            continue
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return cursor
        cursor += 1
    return None


def _find_link_close(content: str, start: int) -> int | None:
    cursor = start
    quote: str | None = None
    while cursor < len(content):
        char = content[cursor]
        if char == "\\":
            cursor += 2
            continue
        if quote is not None:
            if char == quote:
                quote = None
            cursor += 1
            continue
        if char in {'"', "'"}:
            quote = char
        elif char == ")":
            return cursor
        cursor += 1
    return None


def _parse_inline_destination(
    content: str, open_paren: int
) -> tuple[str, int, int] | None:
    cursor = open_paren + 1
    while cursor < len(content) and content[cursor].isspace():
        cursor += 1
    if cursor >= len(content):
        return None

    if content[cursor] == "<":
        destination_start = cursor + 1
        cursor = destination_start
        while cursor < len(content):
            if content[cursor] == "\\":
                cursor += 2
                continue
            if content[cursor] == ">":
                destination_end = cursor
                if _find_link_close(content, cursor + 1) is None:
                    return None
                raw = content[destination_start:destination_end]
                return (
                    _ESCAPED_PUNCTUATION_RE.sub(r"\1", raw),
                    destination_start,
                    destination_end,
                )
            if content[cursor] in "\r\n":
                return None
            cursor += 1
        return None

    destination_start = cursor
    nested_parentheses = 0
    while cursor < len(content):
        char = content[cursor]
        if char == "\\":
            cursor += 2
            continue
        if char == "(":
            nested_parentheses += 1
        elif char == ")":
            if nested_parentheses == 0:
                destination_end = cursor
                raw = content[destination_start:destination_end]
                return (
                    _ESCAPED_PUNCTUATION_RE.sub(r"\1", raw),
                    destination_start,
                    destination_end,
                )
            nested_parentheses -= 1
        elif char.isspace() and nested_parentheses == 0:
            destination_end = cursor
            if _find_link_close(content, cursor) is None:
                return None
            raw = content[destination_start:destination_end]
            return (
                _ESCAPED_PUNCTUATION_RE.sub(r"\1", raw),
                destination_start,
                destination_end,
            )
        cursor += 1
    return None


def find_first_markdown_image(content: str) -> FirstMarkdownImage | None:
    """Return the first rendered image in the initial supported syntax set."""
    masked = _mask_non_rendered_regions(content)
    cursor = 0
    while cursor < len(masked):
        html_match = _RAW_IMG_RE.match(masked, cursor)
        if html_match:
            return FirstMarkdownImage("html", None, None, None)

        if (
            masked.startswith("![", cursor)
            and not _is_escaped(masked, cursor)
        ):
            alt_close = _find_alt_close(masked, cursor + 2)
            if alt_close is None:
                cursor += 2
                continue
            link_cursor = alt_close + 1
            while link_cursor < len(masked) and masked[link_cursor].isspace():
                link_cursor += 1
            if link_cursor < len(masked) and masked[link_cursor] == "(":
                parsed = _parse_inline_destination(content, link_cursor)
                if parsed is not None:
                    url, start, end = parsed
                    return FirstMarkdownImage("inline", url, start, end)
            elif link_cursor < len(masked) and masked[link_cursor] == "[":
                return FirstMarkdownImage("reference", None, None, None)
            cursor = alt_close + 1
            continue
        cursor += 1
    return None


def replace_image_destination(
    content: str, image: FirstMarkdownImage, destination: str
) -> str:
    if (
        image.syntax != "inline"
        or image.destination_start is None
        or image.destination_end is None
    ):
        raise ValueError("Image syntax does not have a replaceable destination")
    return (
        content[:image.destination_start]
        + destination
        + content[image.destination_end:]
    )


def _resolve_within(base: Path, relative: str) -> Path | None:
    base_resolved = base.resolve()
    candidate = (base / relative).resolve()
    try:
        candidate.relative_to(base_resolved)
    except ValueError:
        return None
    return candidate


def _cleanup_empty_parents(directory: Path, stop_at: Path) -> None:
    current = directory
    while current != stop_at and current.is_dir():
        try:
            current.rmdir()
        except OSError:
            break
        current = current.parent


def _delete_thumbnail(relative: str | None) -> None:
    if not relative:
        return
    path = _resolve_within(config.THUMBNAILS_DIR, relative)
    if path is None:
        return
    try:
        path.unlink(missing_ok=True)
        _cleanup_empty_parents(path.parent, config.THUMBNAILS_DIR.resolve())
    except OSError:
        return


def _clear_projection(file: File) -> bool:
    if file.thumbnail_path is None:
        return False
    old = file.thumbnail_path
    file.thumbnail_path = None
    _delete_thumbnail(old)
    return True


def _atomic_copy(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{destination.stem}.", suffix=".jpg", dir=destination.parent
    )
    os.close(fd)
    try:
        shutil.copyfile(source, tmp_name)
        os.replace(tmp_name, destination)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def _generate_atomic(source: Path, destination: Path) -> bool:
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{destination.stem}.", suffix=".jpg", dir=destination.parent
    )
    os.close(fd)
    try:
        if not generate_image_thumbnail(str(source), tmp_name):
            return False
        os.replace(tmp_name, destination)
        return True
    finally:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass


def project_markdown_thumbnail(
    db: Session,
    markdown_file: File,
    content: str,
) -> bool:
    """Project the first local image into a Markdown-owned JPEG cache.

    Returns True when the ORM path or cache bytes changed. The caller owns the
    transaction boundary.
    """
    is_markdown = (
        (markdown_file.mime_type or "") == "text/markdown"
        or markdown_file.filename.lower().endswith(".md")
    )
    if not is_markdown:
        return False

    image = find_first_markdown_image(content)
    match = (
        _LOFT_IMAGE_RE.fullmatch(image.url)
        if image is not None and image.syntax == "inline" and image.url
        else None
    )
    if match is None:
        return _clear_projection(markdown_file)

    source_id = match.group(1)
    source = (
        db.query(File)
        .filter(
            File.id == source_id,
            File.drive == markdown_file.drive,
            File.file_type == "image",
            active_file_filter(),
        )
        .first()
    )
    if source is None:
        return _clear_projection(markdown_file)

    drive_path = config.get_drive_path(markdown_file.drive)
    source_file = _resolve_within(drive_path, source.file_path)
    if source_file is None or not source_file.is_file():
        return _clear_projection(markdown_file)

    expected_rel = (
        f"{markdown_file.drive}/.markdown/"
        f"{markdown_file.id}-{source.id}.jpg"
    )
    destination = _resolve_within(config.THUMBNAILS_DIR, expected_rel)
    if destination is None:
        return _clear_projection(markdown_file)

    cache_changed = False
    source_thumbnail = (
        _resolve_within(config.THUMBNAILS_DIR, source.thumbnail_path)
        if source.thumbnail_path
        else None
    )
    try:
        if source_thumbnail is not None and source_thumbnail.is_file():
            if (
                not destination.exists()
                or source_thumbnail.stat().st_mtime_ns
                > destination.stat().st_mtime_ns
            ):
                _atomic_copy(source_thumbnail, destination)
                cache_changed = True
        elif not destination.exists():
            if not _generate_atomic(source_file, destination):
                return _clear_projection(markdown_file)
            cache_changed = True
    except OSError:
        return _clear_projection(markdown_file)

    old_rel = markdown_file.thumbnail_path
    path_changed = old_rel != expected_rel
    markdown_file.thumbnail_path = expected_rel
    if old_rel and old_rel != expected_rel:
        _delete_thumbnail(old_rel)
    return path_changed or cache_changed
