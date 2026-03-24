import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import init_db
from app.routers import drives, videos
from app.services.scanner import scan_all_drives

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("Database initialized")
    asyncio.create_task(scan_all_drives())
    logger.info("Background scan started for all drives")
    yield


app = FastAPI(title="Video Share API", lifespan=lifespan)

app.include_router(videos.router)
app.include_router(drives.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
