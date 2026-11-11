from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import check_drive_access, get_unlocked_groups
from app.database import get_db
from app.schemas import (
    InboxCountResponse,
    InboxDoneRequest,
    InboxDoneResponse,
    InboxItemResponse,
    InboxListResponse,
    InboxNeighborsResponse,
    InboxUndoRequest,
    InboxUndoResponse,
    file_to_response,
)
from app.services import inbox as inbox_service

router = APIRouter(prefix="/api/drives", tags=["inbox"])


@router.get("/{drive_name}/inbox", response_model=InboxListResponse)
def list_inbox(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    before: str | None = None,
    limit: int = Query(100, ge=1, le=100),
):
    check_drive_access(drive_name, unlocked_groups)
    cursor = None
    if before is not None:
        try:
            cursor = inbox_service.decode_cursor(before)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid cursor") from None
    rows, next_cursor, open_count = inbox_service.list_page(
        db, drive_name, limit=limit, before=cursor
    )
    return InboxListResponse(
        items=[
            InboxItemResponse(
                file=file_to_response(file),
                arrived_at=inbox_service.to_wire(row.arrived_at),
                source=row.source,
                source_i18n_key=row.source_i18n_key,
            )
            for row, file in rows
        ],
        next=next_cursor,
        open_count=open_count,
    )


@router.get("/{drive_name}/inbox/count", response_model=InboxCountResponse)
def count_inbox(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    check_drive_access(drive_name, unlocked_groups)
    return InboxCountResponse(open=inbox_service.count_open(db, drive_name))


@router.post("/{drive_name}/inbox/done", response_model=InboxDoneResponse)
async def mark_inbox_done(
    drive_name: str,
    body: InboxDoneRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    check_drive_access(drive_name, unlocked_groups)
    done, done_at = inbox_service.mark_done(
        db, drive_name, file_ids=body.file_ids, up_to=body.up_to
    )
    db.commit()
    if done:
        await inbox_service.notify(drive_name)
    return InboxDoneResponse(done=done, done_at=inbox_service.to_wire(done_at))


@router.post("/{drive_name}/inbox/undo", response_model=InboxUndoResponse)
async def undo_inbox_done(
    drive_name: str,
    body: InboxUndoRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    check_drive_access(drive_name, unlocked_groups)
    reopened = inbox_service.undo(db, drive_name, body.done_at)
    db.commit()
    if reopened:
        await inbox_service.notify(drive_name)
    return InboxUndoResponse(reopened=reopened)


@router.get(
    "/{drive_name}/inbox/{file_id}/neighbors",
    response_model=InboxNeighborsResponse,
)
def inbox_neighbors(
    drive_name: str,
    file_id: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    check_drive_access(drive_name, unlocked_groups)
    prev_id, next_id, position, total = inbox_service.neighbors(
        db, drive_name, file_id
    )
    return InboxNeighborsResponse(
        prev_id=prev_id,
        next_id=next_id,
        position=position,
        total=total,
    )
