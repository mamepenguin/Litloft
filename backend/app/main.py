import asyncio
import logging

from fastapi import FastAPI

from app.database import init_db
from app.services.scanner import scan_videos_directory

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Video Share API")


@app.on_event("startup")
async def startup():
    init_db()
    logger.info("Database initialized")
    asyncio.create_task(scan_videos_directory())
    logger.info("Background scan started")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
