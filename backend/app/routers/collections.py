from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import app.config as config
from app.auth import check_drive_access, get_unlocked_groups
from app.database import get_db
from app.models import Collection, CollectionItem, File, active_file_filter
from app.schemas import (
    CollectionCreateRequest,
    CollectionDetailResponse,
    CollectionItemAddRequest,
    CollectionItemReorderRequest,
    CollectionItemResponse,
    CollectionSummaryResponse,
    CollectionUpdateRequest,
    file_to_response,
)

router = APIRouter(prefix="/api/drives", tags=["collections"])


def _validate_drive(drive_name: str, unlocked_groups: list[str]) -> None:
    if drive_name not in config.get_drive_names():
        raise HTTPException(status_code=404, detail=f"Drive not found: {drive_name}")
    check_drive_access(drive_name, unlocked_groups)


def _get_collection_or_404(
    db: Session, collection_id: str, drive_name: str
) -> Collection:
    collection = (
        db.query(Collection)
        .filter(Collection.id == collection_id, Collection.drive == drive_name)
        .first()
    )
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    return collection


def _to_summary(collection: Collection) -> CollectionSummaryResponse:
    sorted_items = sorted(collection.items, key=lambda i: i.position)
    return CollectionSummaryResponse(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        drive=collection.drive,
        item_count=len(sorted_items),
        first_file_id=sorted_items[0].file_id if sorted_items else None,
        created_at=collection.created_at,
        updated_at=collection.updated_at,
    )


def _to_detail(collection: Collection) -> CollectionDetailResponse:
    # Items for trashed (deleted_at) or missing (missing_since) files are
    # intentionally kept in the response so the UI can grey them out and
    # the user can still see the collection history. Frontend reads
    # ``deleted_at`` / ``missing_since`` on each file to adjust rendering.
    return CollectionDetailResponse(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        drive=collection.drive,
        items=[
            CollectionItemResponse(
                id=item.id,
                position=item.position,
                file=file_to_response(item.file),
            )
            for item in sorted(collection.items, key=lambda i: i.position)
        ],
        created_at=collection.created_at,
        updated_at=collection.updated_at,
    )


# === Collection CRUD ===


@router.get(
    "/{drive_name}/collections",
    response_model=list[CollectionSummaryResponse],
)
def list_collections(
    drive_name: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    collections = (
        db.query(Collection)
        .filter(Collection.drive == drive_name)
        .order_by(Collection.updated_at.desc())
        .all()
    )
    return [_to_summary(c) for c in collections]


@router.post(
    "/{drive_name}/collections",
    response_model=CollectionSummaryResponse,
    status_code=201,
)
def create_collection(
    drive_name: str,
    body: CollectionCreateRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)

    existing = (
        db.query(Collection)
        .filter(Collection.drive == drive_name, Collection.name == body.name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Collection name already exists")

    collection = Collection(
        drive=drive_name, name=body.name, description=body.description
    )
    db.add(collection)
    db.commit()
    db.refresh(collection)
    return _to_summary(collection)


@router.get(
    "/{drive_name}/collections/{collection_id}",
    response_model=CollectionDetailResponse,
)
def get_collection(
    drive_name: str,
    collection_id: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    collection = _get_collection_or_404(db, collection_id, drive_name)
    return _to_detail(collection)


@router.put(
    "/{drive_name}/collections/{collection_id}",
    response_model=CollectionSummaryResponse,
)
def update_collection(
    drive_name: str,
    collection_id: str,
    body: CollectionUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    collection = _get_collection_or_404(db, collection_id, drive_name)

    if body.name is not None and body.name != collection.name:
        existing = (
            db.query(Collection)
            .filter(
                Collection.drive == drive_name,
                Collection.name == body.name,
                Collection.id != collection_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=409, detail="Collection name already exists"
            )
        collection.name = body.name

    if "description" in body.model_fields_set:
        collection.description = body.description

    db.commit()
    db.refresh(collection)
    return _to_summary(collection)


@router.delete(
    "/{drive_name}/collections/{collection_id}", status_code=204
)
def delete_collection(
    drive_name: str,
    collection_id: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    collection = _get_collection_or_404(db, collection_id, drive_name)
    db.delete(collection)
    db.commit()


# === Collection Items ===


@router.post(
    "/{drive_name}/collections/{collection_id}/items",
    response_model=CollectionDetailResponse,
)
def add_collection_items(
    drive_name: str,
    collection_id: str,
    body: CollectionItemAddRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    collection = _get_collection_or_404(db, collection_id, drive_name)

    files = (
        db.query(File)
        .filter(File.id.in_(body.file_ids), active_file_filter())
        .all()
    )
    file_map = {f.id: f for f in files}

    for fid in body.file_ids:
        if fid not in file_map:
            raise HTTPException(status_code=404, detail=f"File not found: {fid}")
        if file_map[fid].drive != drive_name:
            raise HTTPException(
                status_code=400,
                detail=f"File {fid} belongs to a different drive",
            )

    existing_file_ids = {item.file_id for item in collection.items}
    max_position = max((item.position for item in collection.items), default=-1)

    for fid in body.file_ids:
        if fid in existing_file_ids:
            continue
        max_position += 1
        db.add(CollectionItem(
            collection_id=collection.id,
            file_id=fid,
            position=max_position,
        ))

    db.commit()
    db.refresh(collection)
    return _to_detail(collection)


@router.delete(
    "/{drive_name}/collections/{collection_id}/items/{item_id}",
    status_code=204,
)
def remove_collection_item(
    drive_name: str,
    collection_id: str,
    item_id: int,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    _get_collection_or_404(db, collection_id, drive_name)

    item = (
        db.query(CollectionItem)
        .filter(
            CollectionItem.id == item_id,
            CollectionItem.collection_id == collection_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Collection item not found")

    db.delete(item)
    db.commit()


@router.put(
    "/{drive_name}/collections/{collection_id}/items/reorder",
    response_model=CollectionDetailResponse,
)
def reorder_collection_items(
    drive_name: str,
    collection_id: str,
    body: CollectionItemReorderRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    _validate_drive(drive_name, unlocked_groups)
    collection = _get_collection_or_404(db, collection_id, drive_name)

    current_ids = {item.id for item in collection.items}
    requested_ids = set(body.item_ids)

    if current_ids != requested_ids:
        raise HTTPException(
            status_code=409,
            detail="Item IDs do not match current collection items",
        )

    item_map = {item.id: item for item in collection.items}
    for position, item_id in enumerate(body.item_ids):
        item_map[item_id].position = position

    db.commit()
    db.refresh(collection)
    return _to_detail(collection)
