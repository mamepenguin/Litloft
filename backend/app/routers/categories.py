from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Video
from app.schemas import CategoryResponse

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryResponse])
async def list_categories(
    db: Annotated[Session, Depends(get_db)],
):
    results = (
        db.query(Video.category, func.count(Video.id).label("count"))
        .group_by(Video.category)
        .order_by(Video.category)
        .all()
    )
    return [CategoryResponse(name=name, count=count) for name, count in results]
