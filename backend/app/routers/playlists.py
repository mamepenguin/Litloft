from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

import app.config as config
from app.auth import check_drive_access, get_unlocked_groups
from app.database import get_db
from app.models import File, Playlist, PlaylistItem
from app.schemas import (
    PlaylistCreateRequest,
    PlaylistDetailResponse,
    PlaylistItemAddRequest,
    PlaylistItemReorderRequest,
    PlaylistItemResponse,
    PlaylistSummaryResponse,
    PlaylistUpdateRequest,
    file_to_response,
)

router = APIRouter(prefix="/api/drives", tags=["playlists"])


def _validate_drive(drive_name: str, unlocked_groups: list[str]) -> None:
    if drive_name not in config.get_drive_names():
        raise HTTPException(status_code=404, detail=f"Drive not found: {drive_name}")
    check_drive_access(drive_name, unlocked_groups)


def _get_playlist_or_404(
    db: Session, playlist_id: str, drive_name: str
) -> Playlist:
    playlist = (
        db.query(Playlist)
        .filter(Playlist.id == playlist_id, Playlist.drive == drive_name)
        .first()
    )
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return playlist


def _to_summary(playlist: Playlist) -> PlaylistSummaryResponse:
    sorted_items = sorted(playlist.items, key=lambda i: i.position)
    return PlaylistSummaryResponse(
        id=playlist.id,
        name=playlist.name,
        drive=playlist.drive,
        item_count=len(sorted_items),
        first_file_id=sorted_items[0].file_id if sorted_items else None,
        created_at=playlist.created_at,
        updated_at=playlist.updated_at,
    )


def _to_detail(playlist: Playlist) -> PlaylistDetailResponse:
    return PlaylistDetailResponse(
        id=playlist.id,
        name=playlist.name,
        drive=playlist.drive,
        items=[
            PlaylistItemResponse(
                id=item.id,
                position=item.position,
                file=file_to_response(item.file),
            )
            for item in sorted(playlist.items, key=lambda i: i.position)
        ],
        created_at=playlist.created_at,
        updated_at=playlist.updated_at,
    )


# === Playlist CRUD ===


@router.get("/{drive_name}/playlists", response_model=list[PlaylistSummaryResponse])
async def list_playlists(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    playlists = (
        db.query(Playlist)
        .filter(Playlist.drive == drive_name)
        .order_by(Playlist.updated_at.desc())
        .all()
    )
    return [_to_summary(p) for p in playlists]


@router.post(
    "/{drive_name}/playlists",
    response_model=PlaylistSummaryResponse,
    status_code=201,
)
async def create_playlist(
    drive_name: str,
    body: PlaylistCreateRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)

    existing = (
        db.query(Playlist)
        .filter(Playlist.drive == drive_name, Playlist.name == body.name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Playlist name already exists")

    playlist = Playlist(drive=drive_name, name=body.name)
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return _to_summary(playlist)


@router.get(
    "/{drive_name}/playlists/{playlist_id}",
    response_model=PlaylistDetailResponse,
)
async def get_playlist(
    drive_name: str,
    playlist_id: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    playlist = _get_playlist_or_404(db, playlist_id, drive_name)
    return _to_detail(playlist)


@router.put(
    "/{drive_name}/playlists/{playlist_id}",
    response_model=PlaylistSummaryResponse,
)
async def update_playlist(
    drive_name: str,
    playlist_id: str,
    body: PlaylistUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    playlist = _get_playlist_or_404(db, playlist_id, drive_name)

    if body.name != playlist.name:
        existing = (
            db.query(Playlist)
            .filter(
                Playlist.drive == drive_name,
                Playlist.name == body.name,
                Playlist.id != playlist_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Playlist name already exists")

    playlist.name = body.name
    db.commit()
    db.refresh(playlist)
    return _to_summary(playlist)


@router.delete("/{drive_name}/playlists/{playlist_id}", status_code=204)
async def delete_playlist(
    drive_name: str,
    playlist_id: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    playlist = _get_playlist_or_404(db, playlist_id, drive_name)
    db.delete(playlist)
    db.commit()


# === Playlist Items ===


@router.post(
    "/{drive_name}/playlists/{playlist_id}/items",
    response_model=PlaylistDetailResponse,
)
async def add_playlist_items(
    drive_name: str,
    playlist_id: str,
    body: PlaylistItemAddRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    playlist = _get_playlist_or_404(db, playlist_id, drive_name)

    files = db.query(File).filter(File.id.in_(body.file_ids)).all()
    file_map = {f.id: f for f in files}

    for fid in body.file_ids:
        if fid not in file_map:
            raise HTTPException(status_code=404, detail=f"File not found: {fid}")
        if file_map[fid].drive != drive_name:
            raise HTTPException(
                status_code=400,
                detail=f"File {fid} belongs to a different drive",
            )

    existing_file_ids = {item.file_id for item in playlist.items}
    max_position = max((item.position for item in playlist.items), default=-1)

    for fid in body.file_ids:
        if fid in existing_file_ids:
            continue
        max_position += 1
        db.add(PlaylistItem(
            playlist_id=playlist.id,
            file_id=fid,
            position=max_position,
        ))

    db.commit()
    db.refresh(playlist)
    return _to_detail(playlist)


@router.delete(
    "/{drive_name}/playlists/{playlist_id}/items/{item_id}",
    status_code=204,
)
async def remove_playlist_item(
    drive_name: str,
    playlist_id: str,
    item_id: int,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    _get_playlist_or_404(db, playlist_id, drive_name)

    item = (
        db.query(PlaylistItem)
        .filter(PlaylistItem.id == item_id, PlaylistItem.playlist_id == playlist_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Playlist item not found")

    db.delete(item)
    db.commit()


@router.put(
    "/{drive_name}/playlists/{playlist_id}/items/reorder",
    response_model=PlaylistDetailResponse,
)
async def reorder_playlist_items(
    drive_name: str,
    playlist_id: str,
    body: PlaylistItemReorderRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    playlist = _get_playlist_or_404(db, playlist_id, drive_name)

    current_ids = {item.id for item in playlist.items}
    requested_ids = set(body.item_ids)

    if current_ids != requested_ids:
        raise HTTPException(
            status_code=409,
            detail="Item IDs do not match current playlist items",
        )

    item_map = {item.id: item for item in playlist.items}
    for position, item_id in enumerate(body.item_ids):
        item_map[item_id].position = position

    db.commit()
    db.refresh(playlist)
    return _to_detail(playlist)
