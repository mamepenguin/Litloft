import time
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, Request, Response
from sqlalchemy.orm import Session

from app.auth import check_drive_access, get_nickname, get_unlocked_groups, get_viewer_id
from app.database import get_db
from app.models import Comment, File, active_file_filter
from app.schemas import (
    CommentCreateRequest,
    CommentResponse,
    CommentUpdateRequest,
    CommentsListResponse,
)

router = APIRouter(prefix="/api/files", tags=["comments"])

FileId = Annotated[str, PathParam(min_length=12, max_length=12, pattern=r"^[A-Za-z0-9_-]+$")]
CommentId = Annotated[str, PathParam(min_length=12, max_length=12, pattern=r"^[A-Za-z0-9_-]+$")]

# Rate limiting for comment creation: max 10 comments per 60 seconds per IP
_COMMENT_RATE_WINDOW = 60  # seconds
_COMMENT_RATE_MAX = 10
_comment_timestamps: dict[str, list[float]] = {}

# Maximum comments per file
_MAX_COMMENTS_PER_FILE = 500


def _check_comment_rate_limit(client_ip: str) -> None:
    now = time.monotonic()
    timestamps = _comment_timestamps.get(client_ip, [])
    timestamps = [t for t in timestamps if now - t < _COMMENT_RATE_WINDOW]
    if len(timestamps) >= _COMMENT_RATE_MAX:
        raise HTTPException(status_code=429, detail="Too many comments, try again later")
    timestamps.append(now)
    _comment_timestamps[client_ip] = timestamps


def _get_file_or_404(
    db: Session, file_id: str, unlocked_groups: list[str]
) -> File:
    file = db.query(File).filter(File.id == file_id, active_file_filter()).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    check_drive_access(file.drive, unlocked_groups)
    return file


def _comment_to_response(comment: Comment, viewer_id: str | None) -> CommentResponse:
    is_mine = (
        comment.viewer_id is not None
        and viewer_id is not None
        and comment.viewer_id == viewer_id
    )
    return CommentResponse(
        id=comment.id,
        nickname=comment.nickname,
        body=comment.body,
        is_mine=is_mine,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.get("/{file_id}/comments", response_model=CommentsListResponse)
async def list_comments(
    file_id: FileId,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    viewer_id: Annotated[str | None, Depends(get_viewer_id)],
):
    _get_file_or_404(db, file_id, unlocked_groups)

    comments = (
        db.query(Comment)
        .filter(Comment.file_id == file_id)
        .order_by(Comment.created_at.asc(), Comment.id.asc())
        .all()
    )

    return CommentsListResponse(
        comments=[_comment_to_response(c, viewer_id) for c in comments],
        total=len(comments),
    )


@router.post("/{file_id}/comments", response_model=CommentResponse, status_code=201)
async def create_comment(
    file_id: FileId,
    body: CommentCreateRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    viewer_id: Annotated[str | None, Depends(get_viewer_id)],
    nickname: Annotated[str | None, Depends(get_nickname)],
):
    if viewer_id is None:
        raise HTTPException(
            status_code=401,
            detail="Profile required to post comments",
        )

    client_ip = request.client.host if request.client else "unknown"
    _check_comment_rate_limit(client_ip)

    _get_file_or_404(db, file_id, unlocked_groups)

    comment_count = (
        db.query(Comment).filter(Comment.file_id == file_id).count()
    )
    if comment_count >= _MAX_COMMENTS_PER_FILE:
        raise HTTPException(
            status_code=422,
            detail="Maximum comments reached for this file",
        )

    now = datetime.now(UTC)
    comment = Comment(
        file_id=file_id,
        viewer_id=viewer_id,
        nickname=nickname,
        body=body.body,
        created_at=now,
        updated_at=now,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return _comment_to_response(comment, viewer_id)


@router.put("/{file_id}/comments/{comment_id}", response_model=CommentResponse)
async def update_comment(
    file_id: FileId,
    comment_id: CommentId,
    body: CommentUpdateRequest,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    viewer_id: Annotated[str | None, Depends(get_viewer_id)],
):
    _get_file_or_404(db, file_id, unlocked_groups)

    comment = (
        db.query(Comment)
        .filter(Comment.id == comment_id, Comment.file_id == file_id)
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    if comment.viewer_id is None or viewer_id is None or comment.viewer_id != viewer_id:
        raise HTTPException(status_code=403, detail="Cannot edit this comment")

    comment.body = body.body
    comment.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(comment)

    return _comment_to_response(comment, viewer_id)


@router.delete("/{file_id}/comments/{comment_id}", status_code=204)
async def delete_comment(
    file_id: FileId,
    comment_id: CommentId,
    db: Annotated[Session, Depends(get_db)],
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)],
    viewer_id: Annotated[str | None, Depends(get_viewer_id)],
):
    _get_file_or_404(db, file_id, unlocked_groups)

    comment = (
        db.query(Comment)
        .filter(Comment.id == comment_id, Comment.file_id == file_id)
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    if comment.viewer_id is None or viewer_id is None or comment.viewer_id != viewer_id:
        raise HTTPException(status_code=403, detail="Cannot delete this comment")

    db.delete(comment)
    db.commit()

    return Response(status_code=204)
