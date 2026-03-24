import logging
import re

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

logger = logging.getLogger(__name__)

from app.config import DATA_DIR, DATABASE_URL


class Base(DeclarativeBase):
    pass


engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _get_default_drive() -> str:
    try:
        import app.config as config
        drives = config.load_drives()
        if drives:
            name = drives[0]["name"]
            if not re.match(r"^[\w\s\-]+$", name, re.UNICODE):
                raise ValueError(f"Invalid drive name for migration: {name}")
            return name
    except (ValueError, TypeError):
        raise
    except Exception:
        pass
    return "default"


def _migrate(engine_) -> None:
    inspector = inspect(engine_)
    tables = inspector.get_table_names()
    if "videos" in tables:
        columns = {col["name"] for col in inspector.get_columns("videos")}
        with engine_.begin() as conn:
            if "likes" not in columns:
                logger.info("Migrating: adding 'likes' column to videos")
                conn.execute(text("ALTER TABLE videos ADD COLUMN likes INTEGER NOT NULL DEFAULT 0"))
            if "dislikes" not in columns:
                logger.info("Migrating: adding 'dislikes' column to videos")
                conn.execute(text("ALTER TABLE videos ADD COLUMN dislikes INTEGER NOT NULL DEFAULT 0"))
            if "is_favorite" not in columns:
                logger.info("Migrating: adding 'is_favorite' column to videos")
                conn.execute(text("ALTER TABLE videos ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT 0"))

            # Drive + folder_path migration
            if "drive" not in columns:
                default_drive = _get_default_drive()
                logger.info("Migrating: adding 'drive' column to videos (default: %s)", default_drive)
                conn.execute(text(
                    f"ALTER TABLE videos ADD COLUMN drive VARCHAR NOT NULL DEFAULT '{default_drive}'"
                ))
            if "category" in columns and "folder_path" not in columns:
                logger.info("Migrating: renaming 'category' to 'folder_path' in videos")
                conn.execute(text("ALTER TABLE videos RENAME COLUMN category TO folder_path"))

            # Create composite index if not exists
            indexes = {idx["name"] for idx in inspector.get_indexes("videos")}
            if "idx_videos_drive_folder_path" not in indexes:
                logger.info("Migrating: creating composite index idx_videos_drive_folder_path")
                conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_videos_drive_folder_path ON videos (drive, folder_path)"
                ))
            # Drop old category index if exists
            if "idx_videos_category" in indexes:
                logger.info("Migrating: dropping old idx_videos_category index")
                conn.execute(text("DROP INDEX IF EXISTS idx_videos_category"))

    # Create tags and video_tags tables if they don't exist
    for table_name in ("tags", "video_tags"):
        if table_name not in tables:
            logger.info("Migrating: creating '%s' table", table_name)
            Base.metadata.tables[table_name].create(bind=engine_, checkfirst=True)

    # Migrate tags table to add drive column
    if "tags" in tables:
        tag_columns = {col["name"] for col in inspector.get_columns("tags")}
        if "drive" not in tag_columns:
            default_drive = _get_default_drive()
            logger.info("Migrating: rebuilding 'tags' table with drive column")
            with engine_.begin() as conn:
                conn.execute(text("""
                    CREATE TABLE tags_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name VARCHAR NOT NULL,
                        drive VARCHAR NOT NULL DEFAULT '',
                        created_at DATETIME,
                        UNIQUE (drive, name)
                    )
                """))
                conn.execute(text("""
                    INSERT INTO tags_new (id, name, drive, created_at)
                    SELECT id, name, :drive, created_at FROM tags
                """), {"drive": default_drive})
                conn.execute(text("DROP TABLE tags"))
                conn.execute(text("ALTER TABLE tags_new RENAME TO tags"))


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    _migrate(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
