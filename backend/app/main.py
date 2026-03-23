import asyncio
import logging

from fastapi import FastAPI, HTTPException

from app.database import init_db
from app.routers import categories, tags, videos
from app.schemas import ScanResponse
from app.services.scanner import scan_videos_directory

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Video Share API")

app.include_router(videos.router)
app.include_router(categories.router)
app.include_router(tags.router)


@app.on_event("startup")
async def startup():
    init_db()
    logger.info("Database initialized")
    asyncio.create_task(scan_videos_directory())
    logger.info("Background scan started")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/scan", response_model=ScanResponse)
async def trigger_scan():
    try:
        result = await scan_videos_directory()
        return ScanResponse(**result)
    except RuntimeError:
        raise HTTPException(status_code=409, detail="Scan already in progress")
