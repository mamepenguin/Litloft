from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Tag, video_tags
from app.schemas import TagResponse

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("", response_model=list[TagResponse])
async def list_tags(
    db: Annotated[Session, Depends(get_db)],
):
    results = (
        db.query(Tag.name, func.count(video_tags.c.video_id).label("count"))
        .outerjoin(video_tags)
        .group_by(Tag.id)
        .order_by(Tag.name)
        .all()
    )
    return [TagResponse(name=name, count=count) for name, count in results]
