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

    # === Phase 1: Legacy videos table migrations (pre-files era) ===
    if "videos" in tables and "files" not in tables:
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

            if "drive" not in columns:
                default_drive = _get_default_drive()
                logger.info("Migrating: adding 'drive' column to videos (default: %s)", default_drive)
                conn.execute(text(
                    f"ALTER TABLE videos ADD COLUMN drive VARCHAR NOT NULL DEFAULT '{default_drive}'"
                ))
            if "category" in columns and "folder_path" not in columns:
                logger.info("Migrating: renaming 'category' to 'folder_path' in videos")
                conn.execute(text("ALTER TABLE videos RENAME COLUMN category TO folder_path"))

        # Create tags and video_tags tables if needed (for migration path)
        for table_name in ("tags", "video_tags"):
            if table_name not in tables:
                logger.info("Migrating: creating '%s' table", table_name)
                from app.models import file_tags
                if table_name == "tags":
                    Base.metadata.tables["tags"].create(bind=engine_, checkfirst=True)

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

        # === Migrate videos → files ===
        logger.info("Migrating: creating 'files' table from 'videos'")
        with engine_.begin() as conn:
            conn.execute(text("""
                CREATE TABLE files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename VARCHAR NOT NULL,
                    title VARCHAR NOT NULL,
                    description TEXT DEFAULT '',
                    drive VARCHAR NOT NULL DEFAULT '',
                    folder_path VARCHAR NOT NULL DEFAULT '',
                    file_path VARCHAR NOT NULL UNIQUE,
                    file_size INTEGER NOT NULL,
                    file_type VARCHAR NOT NULL DEFAULT 'other',
                    mime_type VARCHAR NOT NULL DEFAULT 'application/octet-stream',
                    thumbnail_path VARCHAR,
                    duration REAL,
                    likes INTEGER DEFAULT 0,
                    dislikes INTEGER DEFAULT 0,
                    is_favorite BOOLEAN DEFAULT 0,
                    created_at DATETIME,
                    updated_at DATETIME
                )
            """))
            conn.execute(text("""
                INSERT INTO files (id, filename, title, description, drive, folder_path,
                    file_path, file_size, file_type, mime_type, thumbnail_path, duration,
                    likes, dislikes, is_favorite, created_at, updated_at)
                SELECT id, filename, title, description, drive, folder_path,
                    file_path, file_size, 'video', 'video/mp4', thumbnail_path, duration,
                    likes, dislikes, is_favorite, created_at, updated_at
                FROM videos
            """))
            conn.execute(text("CREATE INDEX idx_files_drive_folder_path ON files(drive, folder_path)"))
            conn.execute(text("CREATE INDEX idx_files_title ON files(title)"))
            conn.execute(text("CREATE INDEX idx_files_is_favorite ON files(is_favorite)"))
            conn.execute(text("CREATE INDEX idx_files_file_type ON files(file_type)"))

            # Migrate video_tags → file_tags
            if "video_tags" in inspector.get_table_names():
                logger.info("Migrating: creating 'file_tags' from 'video_tags'")
                conn.execute(text("""
                    CREATE TABLE file_tags (
                        file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
                        tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
                        PRIMARY KEY (file_id, tag_id)
                    )
                """))
                conn.execute(text("""
                    INSERT INTO file_tags (file_id, tag_id)
                    SELECT video_id, tag_id FROM video_tags
                """))
                conn.execute(text("DROP TABLE video_tags"))

            conn.execute(text("DROP TABLE videos"))
            logger.info("Migration complete: videos → files")

    # === Phase 2: Ensure tables exist (fresh installs) ===
    tables = inspector.get_table_names()
    if "file_tags" not in tables:
        Base.metadata.tables["file_tags"].create(bind=engine_, checkfirst=True)
    if "tags" not in tables:
        Base.metadata.tables["tags"].create(bind=engine_, checkfirst=True)
    if "empty_folders" not in tables:
        Base.metadata.tables["empty_folders"].create(bind=engine_, checkfirst=True)


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
