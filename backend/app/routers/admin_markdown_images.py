from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.services.maintenance import MaintenanceBusyError
from app.services.markdown_image_import import (
    cancel_job,
    create_analysis,
    get_current_job,
    get_job,
    start_import,
)

router = APIRouter(
    prefix="/api/admin/markdown-images",
    tags=["admin-markdown-images"],
    dependencies=[Depends(require_admin)],
)


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    drive: str = Field(min_length=1, max_length=200)
    folder_path: str = Field(default="", max_length=2000)
    recursive: bool = True


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    analysis_id: str = Field(min_length=1, max_length=64)
    allowed_hosts: list[str] = Field(min_length=1, max_length=100)


@router.post("/analyses")
def analyse_markdown_images(
    request: AnalysisRequest,
    db: Annotated[Session, Depends(get_db)],
):
    try:
        analysis = create_analysis(
            db,
            request.drive,
            request.folder_path,
            request.recursive,
        )
    except ValueError as exc:
        code = str(exc)
        raise HTTPException(status_code=400, detail={"code": code}) from exc
    return {
        "analysis_id": analysis.analysis_id,
        "drive": analysis.drive,
        "folder_path": analysis.folder_path,
        "recursive": analysis.recursive,
        "expires_at": (analysis.created_at + timedelta(minutes=30)).isoformat(),
        "counts": analysis.counts,
        "host_counts": analysis.host_counts,
        "samples": analysis.samples,
    }


@router.post("/imports", status_code=status.HTTP_202_ACCEPTED)
async def start_markdown_image_import(request: ImportRequest):
    try:
        job = start_import(request.analysis_id, request.allowed_hosts)
    except MaintenanceBusyError as exc:
        raise HTTPException(
            status_code=409, detail={"code": "maintenance_busy", "message": str(exc)}
        ) from exc
    except ValueError as exc:
        code = str(exc)
        status_code = 404 if code == "analysis_not_found" else 400
        raise HTTPException(status_code=status_code, detail={"code": code}) from exc
    return job.public_dict()


@router.get("/imports/current")
def get_current_markdown_image_import():
    job = get_current_job()
    return {"job": job.public_dict() if job else None}


@router.get("/imports/{job_id}")
def get_markdown_image_import(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail={"code": "job_not_found"})
    return job.public_dict()


@router.post("/imports/{job_id}/cancel")
def cancel_markdown_image_import(job_id: str):
    job = cancel_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail={"code": "job_not_found"})
    return job.public_dict()
