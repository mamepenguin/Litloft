import os
from pathlib import Path


VIDEOS_DIR = Path(os.getenv("VIDEOS_DIR", "./videos"))
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
DATABASE_URL = f"sqlite:///{DATA_DIR}/videos.db"
THUMBNAILS_DIR = DATA_DIR / "thumbnails"
CHUNK_SIZE = 1024 * 1024  # 1MB for streaming
