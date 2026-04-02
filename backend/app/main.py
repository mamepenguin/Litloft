import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import init_db
from app.auth import init_jwt_secret, load_passwords
from app.routers import auth, drives, files, playlists, progress, uploads, ws
from app.services.scanner import scan_all_drives
from app.services.upload import cleanup_abandoned_uploads
from app.services.ws import set_event_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("Database initialized")
    load_passwords()
    init_jwt_secret()
    logger.info("Auth initialized")
    set_event_loop(asyncio.get_running_loop())
    cleanup_abandoned_uploads()
    asyncio.create_task(scan_all_drives())
    logger.info("Background scan started for all drives")
    yield


app = FastAPI(title="Video Share API", lifespan=lifespan)

app.include_router(auth.router)
app.include_router(files.router)
app.include_router(drives.router)
app.include_router(uploads.router)
app.include_router(playlists.router)
app.include_router(progress.router)
app.include_router(ws.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
