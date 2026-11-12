"""Shelves: a drive's files grouped by one classification (SPEC-CORE-056)."""

import logging
import unicodedata
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Integer, and_, case, cast, false, func, select, true
from sqlalchemy.orm import Session

from app.auth import get_unlocked_groups
from app.database import get_db
from app.models import File, Tag, WatchHistory, continue_desk_filter, file_tags
from app.routers.drives import (
    FileKindParam,
    _folder_subtree,
    _validate_drive,
    filtered_drive_files,
)
from app.routers.progress import get_viewer_id
from app.schemas import (
    ShelfItemResponse,
    ShelfResponse,
    ShelvesResponse,
    WatchProgressInfo,
    file_to_response,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/drives", tags=["drives"])

ShelfBy = Literal["all", "folder", "tag", "month", "duration", "watch"]

NO_TAG = "no_tag"
DURATION_KEYS = ("under_10m", "10_to_30m", "30m_plus")
WatchState = Literal["in_progress", "unwatched", "finished"]
WATCH_KEYS: tuple[WatchState, ...] = ("in_progress", "unwatched", "finished")
FIXED_KEYS = {"duration": DURATION_KEYS, "watch": WATCH_KEYS}

_UNDER_10M_SECONDS = 600
_UNDER_30M_SECONDS = 1800


def _folder_segment():
    slash = func.instr(File.folder_path, "/")
    return case(
        (slash > 0, func.substr(File.folder_path, 1, slash - 1)),
        else_=File.folder_path,
    )


def _duration_bucket():
    # Whole seconds, as the listing's `duration` filter compares them. No
    # bucket (NULL) for an unknown length rather than a guessed one.
    seconds = cast(File.duration, Integer)
    return case(
        (File.duration.is_(None), None),
        (File.duration <= 0, None),
        (seconds < _UNDER_10M_SECONDS, "under_10m"),
        (seconds < _UNDER_30M_SECONDS, "10_to_30m"),
        else_="30m_plus",
    )


def _watch_bucket():
    known = WatchHistory.duration > 0
    # Multiplied out so the 90% boundary involves no float rounding.
    finished = and_(
        known, WatchHistory.playback_position * 10 >= WatchHistory.duration * 9
    )
    started = and_(known, WatchHistory.playback_position > 0)
    return case(
        (finished, "finished"), (started, "in_progress"), else_="unwatched"
    )


def _drive_tag_links(drive: str):
    return (
        select(file_tags.c.file_id)
        .select_from(file_tags.join(Tag, Tag.id == file_tags.c.tag_id))
        .where(Tag.drive == drive)
    )


def _join_watch(query, viewer_id: str):
    return query.outerjoin(
        WatchHistory,
        and_(
            WatchHistory.file_id == File.id,
            WatchHistory.viewer_id == viewer_id,
        ),
    )


def _key_expr(by: str):
    if by == "folder":
        return _folder_segment()
    if by == "month":
        return func.strftime("%Y-%m", File.created_at)
    if by == "duration":
        return _duration_bucket()
    return _watch_bucket()


def _grouping(query, by: str, drive: str):
    """Join what the grouping needs and return ``(query, key expression)``."""
    if by != "tag":
        return query, _key_expr(by)
    names = (
        select(file_tags.c.file_id.label("file_id"), Tag.name.label("name"))
        .select_from(file_tags.join(Tag, Tag.id == file_tags.c.tag_id))
        .where(Tag.drive == drive)
        .subquery()
    )
    query = query.outerjoin(names, names.c.file_id == File.id)
    return query, func.coalesce(names.c.name, NO_TAG)


def _key_filter(by: str, key: str, drive: str):
    if by == "all":
        return true() if key == "all" else false()
    if by == "folder":
        if key == "":
            return File.folder_path == ""
        folder = unicodedata.normalize("NFC", key)
        if folder.endswith("/"):
            return File.folder_path == folder.rstrip("/")
        return _folder_subtree(folder)
    if by == "tag":
        if key == NO_TAG:
            return File.id.not_in(_drive_tag_links(drive))
        return File.id.in_(
            _drive_tag_links(drive).where(Tag.name == key)
        )
    if by == "duration" and key not in DURATION_KEYS:
        return false()
    if by == "watch" and key == "continue":
        return continue_desk_filter()
    return _key_expr(by) == key


def _order_shelves(by: str, counts: dict[str, int]) -> list[str]:
    if by in FIXED_KEYS:
        return [key for key in FIXED_KEYS[by] if counts.get(key)]
    if by == "month":
        return sorted(counts, reverse=True)
    ranked = sorted(
        (key for key in counts if key != NO_TAG or by != "tag"),
        key=lambda key: (-counts[key], key),
    )
    if by == "tag" and NO_TAG in counts:
        ranked.append(NO_TAG)
    return ranked


def _item_order(sort: str, order: str):
    if sort == "random":
        return [func.random()]
    descending = order == "desc"
    if sort == "last_played":
        played = WatchHistory.last_played_at
        return [
            played.is_(None),
            played.desc() if descending else played.asc(),
            File.id.desc() if descending else File.id.asc(),
        ]
    column = getattr(File, sort)
    return [
        column.desc() if descending else column.asc(),
        File.id.desc() if descending else File.id.asc(),
    ]


def _label(by: str, key: str) -> str:
    if by == "all" or by in FIXED_KEYS or (by == "tag" and key == NO_TAG):
        return ""
    if by == "folder":
        folder = key.rstrip("/")
        return folder.rsplit("/", 1)[-1] if folder else ""
    return key


def _item(file: File, progress: tuple[float, float] | None) -> ShelfItemResponse:
    item = ShelfItemResponse(**file_to_response(file).model_dump())
    if progress is not None:
        item.watch_progress = WatchProgressInfo(
            position=progress[0], duration=progress[1]
        )
    return item


def _progress_of(row) -> tuple[float, float] | None:
    position, duration = row[-2], row[-1]
    if position is None or duration is None:
        return None
    return position, duration


def _folder_base(counts: dict[str, int]) -> str:
    """The deepest folder every matching file lies under, with none at it."""
    base = ""
    while base not in counts:
        children = set()
        for folder in counts:
            if base:
                prefix = f"{base}/"
                if not folder.startswith(prefix):
                    return base
                children.add(folder[len(prefix):].split("/", 1)[0])
            else:
                children.add(folder.split("/", 1)[0])
        if len(children) != 1:
            return base
        segment = children.pop()
        base = f"{base}/{segment}" if base else segment
    return base


def _folder_shelf_key(base: str, folder: str) -> str:
    if folder == base:
        return f"{base}/" if base else ""
    rest = folder[len(base) + 1:] if base else folder
    segment = rest.split("/", 1)[0]
    return f"{base}/{segment}" if base else segment


def _folder_shelves(
    base_query, *, sort, order, per_shelf, shelf_limit, offset
) -> tuple[list[ShelfResponse], int, str]:
    """Child folders of the base, plus the files sitting in it.

    Grouped in Python over the stored folder paths: the base and the keys
    are NFC, and SQLite cannot normalise a column to compare against them.
    """
    grouped = (
        base_query.with_entities(
            File.folder_path, func.count(func.distinct(File.id))
        )
        .group_by(File.folder_path)
        .all()
    )
    counts: dict[str, int] = {}
    paths: dict[str, list[str]] = {}
    for folder, count in grouped:
        normalized = unicodedata.normalize("NFC", folder)
        counts[normalized] = counts.get(normalized, 0) + count
        paths.setdefault(normalized, []).append(folder)
    base = _folder_base(counts)

    shelf_counts: dict[str, int] = {}
    shelf_paths: dict[str, list[str]] = {}
    for folder in counts:
        key = _folder_shelf_key(base, folder)
        shelf_counts[key] = shelf_counts.get(key, 0) + counts[folder]
        shelf_paths.setdefault(key, []).extend(paths[folder])

    ordered = _order_shelves("folder", shelf_counts)
    shelves = [
        ShelfResponse(
            key=key,
            label=_label("folder", key),
            count=shelf_counts[key],
            items=[
                _item(file, None)
                for file in base_query.filter(File.folder_path.in_(shelf_paths[key]))
                .order_by(*_item_order(sort, order))
                .limit(per_shelf)
                .all()
            ],
        )
        for key in ordered[offset : offset + shelf_limit]
    ]
    return shelves, len(ordered), base


def _keyed_shelf(
    base,
    *,
    by,
    key,
    drive,
    sort,
    order,
    page,
    per_shelf,
) -> ShelfResponse:
    query = base.filter(_key_filter(by, key, drive))
    count = query.count()
    rows_query = query.order_by(*_item_order(sort, order))
    if by == "watch":
        rows_query = rows_query.add_columns(
            WatchHistory.playback_position, WatchHistory.duration
        )
    rows = (
        rows_query.offset((page - 1) * per_shelf).limit(per_shelf).all()
    )
    if by == "watch":
        items = [_item(row[0], _progress_of(row)) for row in rows]
    else:
        items = [_item(file, None) for file in rows]
    return ShelfResponse(
        key=key, label=_label(by, key), count=count, items=items
    )


def _unkeyed_shelves(
    base,
    *,
    by,
    drive,
    sort,
    order,
    per_shelf,
    shelf_limit,
    offset,
) -> tuple[list[ShelfResponse], int, str]:
    if by == "folder":
        return _folder_shelves(
            base,
            sort=sort,
            order=order,
            per_shelf=per_shelf,
            shelf_limit=shelf_limit,
            offset=offset,
        )
    grouped, key_expr = _grouping(base, by, drive)
    counts = dict(
        grouped.with_entities(key_expr, func.count(func.distinct(File.id)))
        .filter(key_expr.is_not(None))
        .group_by(key_expr)
        .all()
    )
    ordered = _order_shelves(by, counts)
    chosen = ordered[offset : offset + shelf_limit]
    if not chosen:
        return [], len(ordered), ""

    rank = func.row_number().over(
        partition_by=key_expr, order_by=_item_order(sort, order)
    )
    columns = [File.id.label("fid"), key_expr.label("shelf_key"), rank.label("rank")]
    if by == "watch":
        columns += [
            WatchHistory.playback_position.label("position"),
            WatchHistory.duration.label("duration"),
        ]
    ranked = (
        grouped.with_entities(*columns).filter(key_expr.in_(chosen)).subquery()
    )
    outer_columns = [File, ranked.c.shelf_key]
    if by == "watch":
        outer_columns += [ranked.c.position, ranked.c.duration]
    rows = (
        base.session.query(*outer_columns)
        .join(ranked, ranked.c.fid == File.id)
        .filter(ranked.c.rank <= per_shelf)
        .order_by(ranked.c.shelf_key, ranked.c.rank)
        .all()
    )
    items: dict[str, list[ShelfItemResponse]] = {key: [] for key in chosen}
    for row in rows:
        progress = _progress_of(row) if by == "watch" else None
        items[row[1]].append(_item(row[0], progress))
    shelves = [
        ShelfResponse(
            key=key, label=_label(by, key), count=counts[key], items=items[key]
        )
        for key in chosen
    ]
    return shelves, len(ordered), ""


@router.get("/{drive_name}/shelves", response_model=ShelvesResponse)
def list_drive_shelves(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    viewer_id: Annotated[str | None, Depends(get_viewer_id)],
    by: ShelfBy,
    key: str | None = Query(None),
    page: int | None = Query(None, ge=1),
    per_shelf: int = Query(5, ge=1, le=60),
    shelf_limit: int = Query(12, ge=1, le=24),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None, max_length=200),
    favorite: bool | None = None,
    liked: bool | None = None,
    tag: list[str] | None = Query(None),
    type: list[FileKindParam] | None = Query(None),
    folder: list[str] | None = Query(None),
    collection: list[str] | None = Query(None),
    ids: list[str] | None = Query(None),
    size: list[str] | None = Query(None),
    duration: list[str] | None = Query(None),
    watch: WatchState | None = Query(None),
    trust: str | None = Query(None, pattern="^(verified|unverified|unreviewed)$"),
    origin: Annotated[str | None, Query(min_length=1, max_length=32)] = None,
    exclude_origin: Annotated[str | None, Query(min_length=1, max_length=32)] = None,
    opened: bool | None = Query(None),
    sort: str = Query(
        "created_at",
        pattern="^(created_at|title|file_size|liked_at|updated_at|random|last_played)$",
    ),
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    """Group a drive's active files into shelves under the listing's filters."""
    _validate_drive(drive_name, unlocked_groups)
    if page is not None and key is None:
        raise HTTPException(status_code=422, detail="page requires key")
    if key == "" and by != "folder":
        raise HTTPException(status_code=422, detail="empty key requires by=folder")
    if sort == "last_played" and by != "watch":
        raise HTTPException(status_code=422, detail="last_played requires by=watch")
    if sort == "random" and key is not None and page is not None:
        raise HTTPException(status_code=422, detail="random cannot be paged")
    if ids is not None:
        if len(ids) > 60:
            raise HTTPException(status_code=422, detail="ids accepts at most 60 elements")
        if any(not file_id for file_id in ids):
            raise HTTPException(status_code=422, detail="ids cannot contain an empty element")
    if opened is not None and (
        by == "watch" or watch is not None or sort == "last_played"
    ):
        raise HTTPException(
            status_code=422,
            detail="opened cannot be combined with watch conditions",
        )
    if (
        by == "watch"
        or watch is not None
        or sort == "last_played"
        or opened is not None
    ) and viewer_id is None:
        raise HTTPException(status_code=400, detail="viewer_required")

    base, _ = filtered_drive_files(
        db,
        drive_name,
        search=search,
        favorite=favorite,
        liked=liked,
        tag=tag,
        type=type,
        folder=folder,
        collection=collection,
        size=size,
        duration=duration,
        trust=trust,
        origin=origin,
        exclude_origin=exclude_origin,
    )
    if ids is not None:
        base = base.filter(File.id.in_(ids))
    if opened is not None:
        # A row exists whatever its position, so the join is the whole answer.
        base = _join_watch(base, viewer_id)
        base = base.filter(
            WatchHistory.file_id.isnot(None)
            if opened
            else WatchHistory.file_id.is_(None)
        )
    if by == "watch" or watch is not None:
        base = _join_watch(base, viewer_id)
    if watch is not None:
        base = base.filter(_watch_bucket() == watch)
    try:
        if by == "all":
            shelf = _keyed_shelf(
                base,
                by=by,
                key="all" if key is None else key,
                drive=drive_name,
                sort=sort,
                order=order,
                page=page or 1,
                per_shelf=per_shelf,
            )
            return ShelvesResponse(by=by, shelves=[shelf], total_shelves=1)
        if key is not None:
            shelf = _keyed_shelf(
                base,
                by=by,
                key=key,
                drive=drive_name,
                sort=sort,
                order=order,
                page=page or 1,
                per_shelf=per_shelf,
            )
            return ShelvesResponse(by=by, shelves=[shelf], total_shelves=1)
        shelves, total, response_base = _unkeyed_shelves(
            base,
            by=by,
            drive=drive_name,
            sort=sort,
            order=order,
            per_shelf=per_shelf,
            shelf_limit=shelf_limit,
            offset=offset,
        )
    except Exception:
        logger.exception("Shelves failed: drive=%s by=%s", drive_name, by)
        raise
    return ShelvesResponse(
        by=by, shelves=shelves, total_shelves=total, base=response_base
    )
