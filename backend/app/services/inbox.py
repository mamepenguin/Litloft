"""Inbox rows: files that arrived on purpose and have not been dealt with."""

import base64
import binascii
import re
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, or_, select, update
from sqlalchemy.orm import Session

import app.services.ws as ws
from app.models import File, InboxItem, active_file_filter

UPLOAD_SOURCE = "upload"
UPLOAD_I18N_KEY = "inbox.sourceUpload"

RETENTION_DAYS = 30

_CURSOR_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def _naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def to_wire(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def parse_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return _naive_utc(parsed)


def encode_cursor(arrived_at: datetime, file_id: str) -> str:
    raw = f"{to_wire(arrived_at)}|{file_id}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, str]:
    if not _CURSOR_RE.fullmatch(cursor):
        raise ValueError("not a cursor")
    try:
        raw = base64.b64decode(
            cursor + "=" * (-len(cursor) % 4), altchars=b"-_", validate=True
        ).decode()
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
        raise ValueError("not a cursor") from exc
    timestamp, separator, file_id = raw.rpartition("|")
    if not separator or not file_id:
        raise ValueError("not a cursor")
    return parse_timestamp(timestamp), file_id


def record_arrival(
    db: Session,
    drive: str,
    file_id: str,
    source: str,
    source_i18n_key: str,
    *,
    now: datetime | None = None,
) -> None:
    arrived_at = now or datetime.now(UTC)
    row = (
        db.query(InboxItem)
        .filter(InboxItem.drive == drive, InboxItem.file_id == file_id)
        .first()
    )
    if row is None:
        db.add(
            InboxItem(
                drive=drive,
                file_id=file_id,
                arrived_at=arrived_at,
                source=source,
                source_i18n_key=source_i18n_key,
            )
        )
        return
    row.arrived_at = arrived_at
    row.source = source
    row.source_i18n_key = source_i18n_key
    row.done_at = None


def close(db: Session, drive: str, file_id: str, *, now: datetime | None = None) -> bool:
    return close_files(db, drive, [file_id], now=now)


def close_files(
    db: Session,
    drive: str,
    file_ids: list[str],
    *,
    now: datetime | None = None,
) -> bool:
    if not file_ids:
        return False
    done_at = now or datetime.now(UTC)
    result = db.execute(
        update(InboxItem)
        .where(
            InboxItem.drive == drive,
            InboxItem.file_id.in_(file_ids),
            InboxItem.done_at.is_(None),
        )
        .values(done_at=done_at)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount > 0


def remove(db: Session, drive: str, file_id: str) -> bool:
    deleted = (
        db.query(InboxItem)
        .filter(InboxItem.drive == drive, InboxItem.file_id == file_id)
        .delete(synchronize_session=False)
    )
    return deleted > 0


def _open_rows(db: Session, drive: str):
    return (
        db.query(InboxItem, File)
        .join(File, File.id == InboxItem.file_id)
        .filter(
            InboxItem.drive == drive,
            InboxItem.done_at.is_(None),
            File.drive == drive,
            active_file_filter(),
        )
    )


def _order(query):
    return query.order_by(InboxItem.arrived_at.desc(), InboxItem.file_id.desc())


def list_page(
    db: Session,
    drive: str,
    *,
    limit: int,
    before: tuple[datetime, str] | None,
) -> tuple[list[tuple[InboxItem, File]], str | None, int]:
    query = _open_rows(db, drive)
    if before is not None:
        arrived_at, file_id = before
        query = query.filter(
            or_(
                InboxItem.arrived_at < arrived_at,
                and_(
                    InboxItem.arrived_at == arrived_at,
                    InboxItem.file_id < file_id,
                ),
            )
        )
    rows = _order(query).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = (
        encode_cursor(rows[-1][0].arrived_at, rows[-1][0].file_id)
        if has_more and rows
        else None
    )
    return rows, next_cursor, count_open(db, drive)


def count_open(db: Session, drive: str) -> int:
    return _open_rows(db, drive).count()


def mark_done(
    db: Session,
    drive: str,
    *,
    file_ids: list[str] | None,
    up_to: datetime | None,
    now: datetime | None = None,
) -> tuple[int, datetime]:
    done_at = now or datetime.now(UTC)
    active_ids = select(File.id).where(
        File.drive == drive,
        active_file_filter(),
    )
    conditions = [
        InboxItem.drive == drive,
        InboxItem.done_at.is_(None),
        InboxItem.file_id.in_(active_ids),
    ]
    if file_ids is not None:
        conditions.append(InboxItem.file_id.in_(file_ids))
    else:
        conditions.append(InboxItem.arrived_at <= _naive_utc(up_to))
    result = db.execute(
        update(InboxItem)
        .where(*conditions)
        .values(done_at=done_at)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount, done_at


def undo(db: Session, drive: str, done_at: datetime) -> int:
    active_ids = select(File.id).where(
        File.drive == drive,
        active_file_filter(),
    )
    result = db.execute(
        update(InboxItem)
        .where(
            InboxItem.drive == drive,
            InboxItem.done_at == _naive_utc(done_at),
            InboxItem.file_id.in_(active_ids),
        )
        .values(done_at=None)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount


def neighbors(
    db: Session, drive: str, file_id: str
) -> tuple[str | None, str | None, int | None, int | None]:
    target = (
        db.query(InboxItem)
        .filter(InboxItem.drive == drive, InboxItem.file_id == file_id)
        .first()
    )
    if target is None:
        return None, None, None, None

    rows = _order(_open_rows(db, drive)).all()
    target_key = (_naive_utc(target.arrived_at), target.file_id)
    for index, (row, _file) in enumerate(rows):
        if row.file_id == file_id:
            return (
                rows[index - 1][0].file_id if index > 0 else None,
                rows[index + 1][0].file_id if index + 1 < len(rows) else None,
                index + 1,
                len(rows),
            )

    prev_id = None
    next_id = None
    for row, _file in rows:
        key = (_naive_utc(row.arrived_at), row.file_id)
        if key > target_key:
            if prev_id is None:
                prev_id = row.file_id
        elif key < target_key and next_id is None:
            next_id = row.file_id
    return prev_id, next_id, None, len(rows)


def purge_done_rows(now: datetime | None = None) -> int:
    from app import database

    cutoff = (now or datetime.now(UTC)) - timedelta(days=RETENTION_DAYS)
    db = database.SessionLocal()
    try:
        deleted = (
            db.query(InboxItem)
            .filter(
                InboxItem.done_at.isnot(None),
                InboxItem.done_at < cutoff,
            )
            .delete(synchronize_session=False)
        )
        db.commit()
        return deleted
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


async def notify(drive: str) -> None:
    await ws.manager.broadcast("inbox.updated", {"drive": drive}, drive=drive)


def notify_from_thread(drive: str) -> None:
    ws.broadcast_from_thread("inbox.updated", {"drive": drive}, drive=drive)
