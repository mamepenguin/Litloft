from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.auth import check_drive_access, get_unlocked_groups
from app.database import get_db
from app.schemas import (
    ChunkResponse,
    FileResponse,
    UploadInitRequest,
    UploadInitResponse,
    file_to_response,
)
from app.services import upload as upload_service

router = APIRouter(prefix="/api/drives", tags=["uploads"])


def _validate_session_drive(upload_id: str, drive_name: str) -> None:
    session = upload_service.get_session(upload_id)
    if session.drive != drive_name:
        raise HTTPException(status_code=404, detail="Upload session not found")


@router.post("/{drive_name}/upload/init", response_model=UploadInitResponse)
async def init_upload(
    drive_name: str,
    body: UploadInitRequest,
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    check_drive_access(drive_name, unlocked_groups)
    session = upload_service.init_upload(
        drive=drive_name,
        filename=body.filename,
        file_size=body.file_size,
        folder_path=body.folder_path,
        chunk_size=body.chunk_size,
    )
    return UploadInitResponse(
        upload_id=session.upload_id,
        chunk_size=session.chunk_size,
        total_chunks=session.total_chunks,
    )


@router.post("/{drive_name}/upload/{upload_id}/chunk", response_model=ChunkResponse)
async def upload_chunk(
    drive_name: str,
    upload_id: str,
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    chunk_index: int = Form(...),
    chunk: UploadFile = File(...),
):
    check_drive_access(drive_name, unlocked_groups)
    _validate_session_drive(upload_id, drive_name)
    data = await chunk.read()
    session = upload_service.receive_chunk(upload_id, chunk_index, data)
    return ChunkResponse(
        chunk_index=chunk_index,
        received_chunks=len(session.received_chunks),
        total_chunks=session.total_chunks,
    )


@router.post("/{drive_name}/upload/{upload_id}/complete", response_model=FileResponse)
async def complete_upload(
    drive_name: str,
    upload_id: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    check_drive_access(drive_name, unlocked_groups)
    _validate_session_drive(upload_id, drive_name)
    file_record = upload_service.complete_upload(upload_id, db)
    return file_to_response(file_record)


@router.delete("/{drive_name}/upload/{upload_id}")
async def cancel_upload(
    drive_name: str,
    upload_id: str,
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
):
    check_drive_access(drive_name, unlocked_groups)
    _validate_session_drive(upload_id, drive_name)
    upload_service.cancel_upload(upload_id)
    return {"status": "cancelled"}
