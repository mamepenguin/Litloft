import logging

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
    for table_name in ("tags", "video_tags"):
        if table_name not in tables:
            logger.info("Migrating: creating '%s' table", table_name)
            Base.metadata.tables[table_name].create(bind=engine_, checkfirst=True)


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
