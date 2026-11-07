from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth import check_drive_access, get_unlocked_groups, get_viewer_id
from app.database import get_db
from app.models import File, Highlight, active_file_filter
from app.nanoid import generate_nanoid
from app.schemas import HighlightCreateRequest, HighlightResponse

router = APIRouter(prefix="/api/files", tags=["highlights"])

FileId = Annotated[str, PathParam(min_length=12, max_length=12, pattern=r"^[A-Za-z0-9_-]+$")]

HIGHLIGHTS_PER_FILE = 500

# The duplicate check, the 500 cap and the insert are one statement so two
# concurrent identical saves see each other: a count read before a separate
# insert lets both pass the cap and both create a row.
_INSERT_HIGHLIGHT = text("""
    INSERT INTO highlights (id, viewer_id, file_id, page, quote, prefix, suffix, created_at)
    SELECT :id, :viewer_id, :file_id, :page, :quote, :prefix, :suffix, :created_at
    WHERE NOT EXISTS (
        SELECT 1 FROM highlights
        WHERE viewer_id = :viewer_id
          AND file_id = :file_id
          AND page IS :page
          AND quote = :quote
          AND prefix = :prefix
          AND suffix = :suffix
    )
    AND (
        SELECT COUNT(*) FROM highlights
        WHERE viewer_id = :viewer_id AND file_id = :file_id
    ) < :limit
""")


def _get_file_or_404(
    db: Session, file_id: str, unlocked_groups: list[str]
) -> File:
    file = db.query(File).filter(File.id == file_id, active_file_filter()).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    check_drive_access(file.drive, unlocked_groups)
    return file


def _find_duplicate(
    db: Session, viewer_id: str, file_id: str, body: HighlightCreateRequest
) -> Highlight | None:
    return (
        db.query(Highlight)
        .filter(
            Highlight.viewer_id == viewer_id,
            Highlight.file_id == file_id,
            Highlight.page == body.page,
            Highlight.quote == body.quote,
            Highlight.prefix == body.prefix,
            Highlight.suffix == body.suffix,
        )
        .first()
    )


@router.get("/{file_id}/highlights", response_model=list[HighlightResponse])
def list_highlights(
    file_id: FileId,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    viewer_id: Annotated[str | None, Depends(get_viewer_id)],
):
    _get_file_or_404(db, file_id, unlocked_groups)

    if viewer_id is None:
        return []

    return (
        db.query(Highlight)
        .filter(Highlight.viewer_id == viewer_id, Highlight.file_id == file_id)
        .order_by(Highlight.created_at.asc(), Highlight.id.asc())
        .all()
    )


@router.post("/{file_id}/highlights", response_model=HighlightResponse, status_code=201)
def create_highlight(
    file_id: FileId,
    body: HighlightCreateRequest,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    viewer_id: Annotated[str | None, Depends(get_viewer_id)],
):
    file = _get_file_or_404(db, file_id, unlocked_groups)

    if viewer_id is None:
        raise HTTPException(
            status_code=401, detail="Profile required to save highlights"
        )

    if file.mime_type == "application/pdf":
        if body.page is None or body.page < 1:
            raise HTTPException(
                status_code=422, detail="page must be a positive integer for a PDF"
            )
    elif body.page is not None:
        raise HTTPException(
            status_code=422, detail="page is only valid for a PDF"
        )

    now = datetime.now(UTC)
    highlight_id = generate_nanoid()
    result = db.execute(
        _INSERT_HIGHLIGHT,
        {
            "id": highlight_id,
            "viewer_id": viewer_id,
            "file_id": file_id,
            "page": body.page,
            "quote": body.quote,
            "prefix": body.prefix,
            "suffix": body.suffix,
            "created_at": now,
            "limit": HIGHLIGHTS_PER_FILE,
        },
    )

    if result.rowcount:
        db.commit()
        return HighlightResponse(
            id=highlight_id,
            page=body.page,
            quote=body.quote,
            prefix=body.prefix,
            suffix=body.suffix,
            created_at=now,
        )

    db.rollback()
    existing = _find_duplicate(db, viewer_id, file_id, body)
    if existing:
        response.status_code = 200
        return HighlightResponse.model_validate(existing)

    raise HTTPException(
        status_code=409, detail="Highlight limit reached for this file"
    )


@router.delete("/{file_id}/highlights/{highlight_id}", status_code=204)
def delete_highlight(
    file_id: FileId,
    highlight_id: str,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    viewer_id: Annotated[str | None, Depends(get_viewer_id)],
):
    _get_file_or_404(db, file_id, unlocked_groups)

    if viewer_id is None:
        return Response(status_code=204)

    db.query(Highlight).filter(
        Highlight.id == highlight_id,
        Highlight.file_id == file_id,
        Highlight.viewer_id == viewer_id,
    ).delete(synchronize_session=False)
    db.commit()

    return Response(status_code=204)
