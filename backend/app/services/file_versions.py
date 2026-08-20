import difflib
import hmac
import zlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.models import FileVersion
from app.services.content_write import compute_content_etag

FILE_VERSION_COLLAPSE_WINDOW = timedelta(minutes=5)
FILE_VERSION_MAX_ROWS = 200
FILE_VERSION_MAX_BODY_BYTES = 1 * 1024 * 1024
FILE_VERSION_DIFF_MAX_LINES = 20_000
FILE_VERSION_DIFF_MAX_LINE_PAIRS = 4_000_000


class FileVersionReadError(RuntimeError):
    pass


class FileVersionCorruptError(FileVersionReadError):
    pass


class FileVersionBodyTooLargeError(FileVersionReadError):
    pass


VersionRecordAction = Literal["created", "collapsed", "promoted", "unchanged"]
VersionDiffKind = Literal["add", "del", "context"]


@dataclass(frozen=True)
class VersionRecordResult:
    row: FileVersion
    action: VersionRecordAction


@dataclass(frozen=True)
class VersionDiffLine:
    kind: VersionDiffKind
    text: str


def _body(row: FileVersion | None) -> str:
    if row is None:
        return ""
    decompressor = zlib.decompressobj()
    try:
        body = decompressor.decompress(
            row.content_z, FILE_VERSION_MAX_BODY_BYTES + 1
        )
        if len(body) > FILE_VERSION_MAX_BODY_BYTES or decompressor.unconsumed_tail:
            raise FileVersionBodyTooLargeError("version body exceeds size limit")
        body += decompressor.flush(
            FILE_VERSION_MAX_BODY_BYTES + 1 - len(body)
        )
    except FileVersionBodyTooLargeError:
        raise
    except zlib.error as exc:
        raise FileVersionCorruptError("invalid compressed version body") from exc

    if len(body) > FILE_VERSION_MAX_BODY_BYTES:
        raise FileVersionBodyTooLargeError("version body exceeds size limit")
    if not decompressor.eof or decompressor.unused_data:
        raise FileVersionCorruptError("incomplete or trailing compressed data")
    if len(body) != row.size_bytes:
        raise FileVersionCorruptError("version body size mismatch")
    if not hmac.compare_digest(compute_content_etag(body), row.etag):
        raise FileVersionCorruptError("version body ETag mismatch")
    try:
        return body.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise FileVersionCorruptError("version body is not UTF-8") from exc


def _use_linear_diff(before_lines: list[str], after_lines: list[str]) -> bool:
    return (
        len(before_lines) + len(after_lines) > FILE_VERSION_DIFF_MAX_LINES
        or len(before_lines) * len(after_lines) > FILE_VERSION_DIFF_MAX_LINE_PAIRS
    )


def _linear_diff(
    before_lines: list[str],
    after_lines: list[str],
) -> list[VersionDiffLine]:
    return [
        *(VersionDiffLine(kind="del", text=line) for line in before_lines),
        *(VersionDiffLine(kind="add", text=line) for line in after_lines),
    ]


def _structured_diff(
    before_lines: list[str], after_lines: list[str]
) -> list[VersionDiffLine]:
    raw_lines = iter(difflib.unified_diff(before_lines, after_lines))
    # unified_diff emits exactly two file headers before any hunk lines.
    # Consume those by position so user content beginning with ---/+++ is safe.
    next(raw_lines, None)
    next(raw_lines, None)

    lines: list[VersionDiffLine] = []
    for line in raw_lines:
        if line.startswith("@@"):
            continue
        marker = line[:1]
        kind: VersionDiffKind
        if marker == "+":
            kind = "add"
        elif marker == "-":
            kind = "del"
        else:
            kind = "context"
        lines.append(VersionDiffLine(kind=kind, text=line[1:]))
    return lines


def _line_counts(before: str, after: str) -> tuple[int, int]:
    before_lines = before.splitlines(keepends=True)
    after_lines = after.splitlines(keepends=True)
    if _use_linear_diff(before_lines, after_lines):
        return len(after_lines), len(before_lines)
    added = 0
    removed = 0
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(
        None, before_lines, after_lines
    ).get_opcodes():
        if tag in {"insert", "replace"}:
            added += j2 - j1
        if tag in {"delete", "replace"}:
            removed += i2 - i1
    return added, removed


def _older_than(db: Session, row: FileVersion) -> FileVersion | None:
    return (
        db.query(FileVersion)
        .filter(
            FileVersion.file_id == row.file_id,
            or_(
                FileVersion.created_at < row.created_at,
                and_(
                    FileVersion.created_at == row.created_at,
                    FileVersion.id < row.id,
                ),
            ),
        )
        .order_by(FileVersion.created_at.desc(), FileVersion.id.desc())
        .first()
    )


def _newer_than(db: Session, row: FileVersion) -> FileVersion | None:
    return (
        db.query(FileVersion)
        .filter(
            FileVersion.file_id == row.file_id,
            or_(
                FileVersion.created_at > row.created_at,
                and_(
                    FileVersion.created_at == row.created_at,
                    FileVersion.id > row.id,
                ),
            ),
        )
        .order_by(FileVersion.created_at.asc(), FileVersion.id.asc())
        .first()
    )


def _set_counts(row: FileVersion, predecessor: FileVersion | None) -> None:
    row.lines_added, row.lines_removed = _line_counts(
        _body(predecessor), _body(row)
    )


def _apply_cap(db: Session, file_id: str) -> None:
    count = (
        db.query(func.count(FileVersion.id))
        .filter(FileVersion.file_id == file_id)
        .scalar()
        or 0
    )
    excess = max(0, count - FILE_VERSION_MAX_ROWS)
    if not excess:
        return

    victims = (
        db.query(FileVersion)
        .filter(FileVersion.file_id == file_id, FileVersion.kind == "auto")
        .order_by(FileVersion.created_at.asc(), FileVersion.id.asc())
        .limit(excess)
        .all()
    )
    for victim in victims:
        successor = _newer_than(db, victim)
        db.delete(victim)
        db.flush()
        if successor is not None:
            _set_counts(successor, _older_than(db, successor))
            db.flush()


def record_version(
    db: Session,
    *,
    file_id: str,
    body: bytes,
    kind: str,
    viewer_id: str | None,
    nickname: str | None,
) -> FileVersion:
    return record_version_with_action(
        db,
        file_id=file_id,
        body=body,
        kind=kind,
        viewer_id=viewer_id,
        nickname=nickname,
    ).row


def record_version_with_action(
    db: Session,
    *,
    file_id: str,
    body: bytes,
    kind: str,
    viewer_id: str | None,
    nickname: str | None,
) -> VersionRecordResult:
    if kind not in {"auto", "explicit"}:
        raise ValueError("kind must be 'auto' or 'explicit'")

    body.decode("utf-8")
    now = datetime.now(UTC)
    latest = (
        db.query(FileVersion)
        .filter(FileVersion.file_id == file_id)
        .order_by(FileVersion.created_at.desc(), FileVersion.id.desc())
        .first()
    )
    latest_created = None
    if latest is not None:
        latest_created = latest.created_at
        if latest_created.tzinfo is None:
            latest_created = latest_created.replace(tzinfo=UTC)

    compressed = zlib.compress(body)
    etag = compute_content_etag(body)

    if (
        kind == "explicit"
        and latest is not None
        and hmac.compare_digest(latest.etag, etag)
    ):
        if latest.kind == "auto":
            latest.kind = "explicit"
            latest.viewer_id = viewer_id
            latest.nickname = nickname
            latest.created_at = now
            db.flush()
            return VersionRecordResult(row=latest, action="promoted")
        return VersionRecordResult(row=latest, action="unchanged")

    should_collapse = (
        latest is not None
        and latest.kind == "auto"
        and kind == "auto"
        and latest.viewer_id == viewer_id
        and now - latest_created <= FILE_VERSION_COLLAPSE_WINDOW
    )
    if should_collapse:
        predecessor = _older_than(db, latest)
        latest.content_z = compressed
        latest.size_bytes = len(body)
        latest.etag = etag
        latest.nickname = nickname
        latest.created_at = now
        _set_counts(latest, predecessor)
        db.flush()
        return VersionRecordResult(row=latest, action="collapsed")

    row = FileVersion(
        file_id=file_id,
        viewer_id=viewer_id,
        nickname=nickname,
        kind=kind,
        content_z=compressed,
        size_bytes=len(body),
        etag=etag,
        created_at=now,
    )
    db.add(row)
    db.flush()
    _set_counts(row, latest)
    db.flush()
    _apply_cap(db, file_id)
    return VersionRecordResult(row=row, action="created")


def list_versions(
    db: Session, *, file_id: str, limit: int, offset: int
) -> tuple[list[FileVersion], int]:
    query = db.query(FileVersion).filter(FileVersion.file_id == file_id)
    total = query.count()
    rows = (
        query.order_by(FileVersion.created_at.desc(), FileVersion.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return rows, total


def get_version_body(
    db: Session, *, file_id: str, version_id: int
) -> tuple[FileVersion, str] | None:
    row = (
        db.query(FileVersion)
        .filter(FileVersion.file_id == file_id, FileVersion.id == version_id)
        .first()
    )
    if row is None:
        return None
    return row, _body(row)


def diff_version(
    db: Session, *, file_id: str, version_id: int
) -> tuple[FileVersion, list[VersionDiffLine], int, int] | None:
    result = get_version_body(db, file_id=file_id, version_id=version_id)
    if result is None:
        return None
    row, content = result
    predecessor = _older_than(db, row)
    before = _body(predecessor)
    before_lines = before.splitlines(keepends=True)
    content_lines = content.splitlines(keepends=True)
    if _use_linear_diff(before_lines, content_lines):
        lines_added = len(content_lines)
        lines_removed = len(before_lines)
        lines = _linear_diff(before_lines, content_lines)
    else:
        lines_added, lines_removed = _line_counts(before, content)
        lines = _structured_diff(before_lines, content_lines)
    return row, lines, lines_added, lines_removed
