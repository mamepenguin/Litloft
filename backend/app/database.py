import logging
import re

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

logger = logging.getLogger(__name__)

import app.config as config


class Base(DeclarativeBase):
    pass


engine = create_engine(
    config.DATABASE_URL,
    connect_args={"check_same_thread": False},
    # SQLAlchemy defaults (5 + 10 overflow) are too small for this app's
    # concurrency footprint: many in-flight file-stream responses each
    # hold a session for their entire transmission, plus the cron
    # scheduler holds one in the background, plus per-request handlers.
    # Bumped enough to absorb editor + sidebar + neighbour previews
    # without the pool ever timing out under normal interactive load.
    pool_size=20,
    max_overflow=40,
    pool_pre_ping=True,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _get_default_drive() -> str:
    try:
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
                    file_path VARCHAR NOT NULL,
                    file_size INTEGER NOT NULL,
                    file_type VARCHAR NOT NULL DEFAULT 'other',
                    mime_type VARCHAR NOT NULL DEFAULT 'application/octet-stream',
                    thumbnail_path VARCHAR,
                    duration REAL,
                    likes INTEGER DEFAULT 0,
                    is_favorite BOOLEAN DEFAULT 0,
                    created_at DATETIME,
                    updated_at DATETIME
                )
            """))
            conn.execute(text("""
                INSERT INTO files (id, filename, title, description, drive, folder_path,
                    file_path, file_size, file_type, mime_type, thumbnail_path, duration,
                    likes, is_favorite, created_at, updated_at)
                SELECT id, filename, title, description, drive, folder_path,
                    file_path, file_size, 'video', 'video/mp4', thumbnail_path, duration,
                    likes, is_favorite, created_at, updated_at
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
    if "pinned_folders" not in tables:
        Base.metadata.tables["pinned_folders"].create(bind=engine_, checkfirst=True)
    if "collections" not in tables:
        Base.metadata.tables["collections"].create(bind=engine_, checkfirst=True)
    if "collection_items" not in tables:
        Base.metadata.tables["collection_items"].create(bind=engine_, checkfirst=True)

    # === Phase 3: Migrate files.id from INTEGER to nanoid VARCHAR(12) ===
    tables = inspector.get_table_names()
    if "files" in tables:
        file_columns = inspector.get_columns("files")
        id_col = next((c for c in file_columns if c["name"] == "id"), None)
        if id_col and str(id_col["type"]).upper().startswith("INTEGER"):
            logger.info("Migrating: files.id INTEGER → VARCHAR(12) nanoid")
            from app.nanoid import generate_nanoid

            with engine_.begin() as conn:
                rows = conn.execute(text("SELECT id FROM files")).fetchall()
                id_map = {row[0]: generate_nanoid() for row in rows}

                conn.execute(text("""
                    CREATE TABLE files_new (
                        id VARCHAR(12) PRIMARY KEY,
                        filename VARCHAR NOT NULL,
                        title VARCHAR NOT NULL,
                        description TEXT DEFAULT '',
                        drive VARCHAR NOT NULL DEFAULT '',
                        folder_path VARCHAR NOT NULL DEFAULT '',
                        file_path VARCHAR NOT NULL,
                        file_size INTEGER NOT NULL,
                        file_type VARCHAR NOT NULL DEFAULT 'other',
                        mime_type VARCHAR NOT NULL DEFAULT 'application/octet-stream',
                        thumbnail_path VARCHAR,
                        duration REAL,
                        likes INTEGER DEFAULT 0,
                        is_favorite BOOLEAN DEFAULT 0,
                        created_at DATETIME,
                        updated_at DATETIME
                    )
                """))

                for old_id, new_id in id_map.items():
                    conn.execute(text("""
                        INSERT INTO files_new (id, filename, title, description, drive,
                            folder_path, file_path, file_size, file_type, mime_type,
                            thumbnail_path, duration, likes, is_favorite,
                            created_at, updated_at)
                        SELECT :new_id, filename, title, description, drive,
                            folder_path, file_path, file_size, file_type, mime_type,
                            thumbnail_path, duration, likes, is_favorite,
                            created_at, updated_at
                        FROM files WHERE id = :old_id
                    """), {"new_id": new_id, "old_id": old_id})

                conn.execute(text("""
                    CREATE TABLE file_tags_new (
                        file_id VARCHAR(12) REFERENCES files_new(id) ON DELETE CASCADE,
                        tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
                        PRIMARY KEY (file_id, tag_id)
                    )
                """))

                for old_id, new_id in id_map.items():
                    conn.execute(text("""
                        INSERT INTO file_tags_new (file_id, tag_id)
                        SELECT :new_id, tag_id FROM file_tags WHERE file_id = :old_id
                    """), {"new_id": new_id, "old_id": old_id})

                conn.execute(text("DROP TABLE file_tags"))
                conn.execute(text("DROP TABLE files"))
                conn.execute(text("ALTER TABLE files_new RENAME TO files"))
                conn.execute(text("ALTER TABLE file_tags_new RENAME TO file_tags"))

                conn.execute(text("CREATE INDEX idx_files_drive_folder_path ON files(drive, folder_path)"))
                conn.execute(text("CREATE INDEX idx_files_title ON files(title)"))
                conn.execute(text("CREATE INDEX idx_files_is_favorite ON files(is_favorite)"))
                conn.execute(text("CREATE INDEX idx_files_file_type ON files(file_type)"))

            logger.info("Migration complete: files.id → nanoid (%d files migrated)", len(id_map))

    # === Phase 4: Drop dislikes column from files ===
    tables = inspector.get_table_names()
    if "files" in tables:
        file_columns = {col["name"] for col in inspector.get_columns("files")}
        if "dislikes" in file_columns:
            logger.info("Migrating: dropping 'dislikes' column from files")
            with engine_.begin() as conn:
                conn.execute(text("""
                    CREATE TABLE files_new (
                        id VARCHAR(12) PRIMARY KEY,
                        filename VARCHAR NOT NULL,
                        title VARCHAR NOT NULL,
                        description TEXT DEFAULT '',
                        drive VARCHAR NOT NULL DEFAULT '',
                        folder_path VARCHAR NOT NULL DEFAULT '',
                        file_path VARCHAR NOT NULL,
                        file_size INTEGER NOT NULL,
                        file_type VARCHAR NOT NULL DEFAULT 'other',
                        mime_type VARCHAR NOT NULL DEFAULT 'application/octet-stream',
                        thumbnail_path VARCHAR,
                        duration REAL,
                        likes INTEGER DEFAULT 0,
                        is_favorite BOOLEAN DEFAULT 0,
                        created_at DATETIME,
                        updated_at DATETIME
                    )
                """))
                conn.execute(text("""
                    INSERT INTO files_new (id, filename, title, description, drive,
                        folder_path, file_path, file_size, file_type, mime_type,
                        thumbnail_path, duration, likes, is_favorite,
                        created_at, updated_at)
                    SELECT id, filename, title, description, drive,
                        folder_path, file_path, file_size, file_type, mime_type,
                        thumbnail_path, duration, likes, is_favorite,
                        created_at, updated_at
                    FROM files
                """))

                conn.execute(text("""
                    CREATE TABLE file_tags_new (
                        file_id VARCHAR(12) REFERENCES files_new(id) ON DELETE CASCADE,
                        tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
                        PRIMARY KEY (file_id, tag_id)
                    )
                """))
                conn.execute(text("""
                    INSERT INTO file_tags_new (file_id, tag_id)
                    SELECT file_id, tag_id FROM file_tags
                """))

                conn.execute(text("DROP TABLE file_tags"))
                conn.execute(text("DROP TABLE files"))
                conn.execute(text("ALTER TABLE files_new RENAME TO files"))
                conn.execute(text("ALTER TABLE file_tags_new RENAME TO file_tags"))

                conn.execute(text("CREATE INDEX idx_files_drive_folder_path ON files(drive, folder_path)"))
                conn.execute(text("CREATE INDEX idx_files_title ON files(title)"))
                conn.execute(text("CREATE INDEX idx_files_is_favorite ON files(is_favorite)"))
                conn.execute(text("CREATE INDEX idx_files_file_type ON files(file_type)"))

            logger.info("Migration complete: dislikes column dropped")


    # === Phase 5: Create watch_history table ===
    tables = inspector.get_table_names()
    if "watch_history" not in tables:
        Base.metadata.tables["watch_history"].create(bind=engine_, checkfirst=True)

    # === Phase 6: Add deleted_at column to files (soft delete) ===
    tables = inspector.get_table_names()
    if "files" in tables:
        file_columns = {col["name"] for col in inspector.get_columns("files")}
        if "deleted_at" not in file_columns:
            logger.info("Migrating: adding 'deleted_at' column to files")
            with engine_.begin() as conn:
                conn.execute(text("ALTER TABLE files ADD COLUMN deleted_at DATETIME"))
                conn.execute(text("CREATE INDEX idx_files_deleted_at ON files(deleted_at)"))


    # === Phase 7: Add file_hash column to files (duplicate detection) ===
    tables = inspector.get_table_names()
    if "files" in tables:
        file_columns = {col["name"] for col in inspector.get_columns("files")}
        if "file_hash" not in file_columns:
            logger.info("Migrating: adding 'file_hash' column to files")
            with engine_.begin() as conn:
                conn.execute(text("ALTER TABLE files ADD COLUMN file_hash VARCHAR(64)"))
                conn.execute(text("CREATE INDEX idx_files_file_hash ON files(file_hash)"))

    # === Phase 8: Create comments table ===
    tables = inspector.get_table_names()
    if "comments" not in tables:
        Base.metadata.tables["comments"].create(bind=engine_, checkfirst=True)

    # === Phase 9: Add missing_since column to files (missing files tracking) ===
    tables = inspector.get_table_names()
    if "files" in tables:
        file_columns = {col["name"] for col in inspector.get_columns("files")}
        if "missing_since" not in file_columns:
            logger.info("Migrating: adding 'missing_since' column to files")
            with engine_.begin() as conn:
                conn.execute(text("ALTER TABLE files ADD COLUMN missing_since DATETIME"))
                conn.execute(text("CREATE INDEX idx_files_missing_since ON files(missing_since)"))

    # === Phase 10: Create file_relations table ===
    tables = inspector.get_table_names()
    if "file_relations" not in tables:
        logger.info("Migrating: creating 'file_relations' table")
        Base.metadata.tables["file_relations"].create(bind=engine_, checkfirst=True)

    # === Phase 11: Create smart_folders table ===
    tables = inspector.get_table_names()
    if "smart_folders" not in tables:
        logger.info("Migrating: creating 'smart_folders' table")
        Base.metadata.tables["smart_folders"].create(bind=engine_, checkfirst=True)
    # === Spec 2026-04-30-file-active-summary-to-knowledge: drop core
    # table; the pointer is owned by the knowledge addon now. Existing
    # data is allowed to be lost (personal-tool migration policy,
    # mirrors the tag-unification migration in hako fcuA0T0Qr739yVHCNzrbc).
    # Idempotent: if the table is already gone the DROP is skipped.
    if "file_active_summaries" in tables:
        logger.info(
            "Migrating: dropping legacy 'file_active_summaries' table "
            "(moved to knowledge addon)"
        )
        with engine_.begin() as conn:
            conn.execute(text("DROP TABLE file_active_summaries"))

    # === Spec 2026-05-03-hash-based-move-detection: reset file_hash to
    # force recomputation under the new (head256KB || tail256KB) SHA-256
    # algorithm. Idempotent via a sentinel file in DATA_DIR.
    if "files" in tables:
        sentinel = config.DATA_DIR / "hash_format_v2_done"
        if not sentinel.exists():
            logger.info(
                "Migrating: resetting files.file_hash for new "
                "(head+tail 256KB) hash format"
            )
            with engine_.begin() as conn:
                conn.execute(text(
                    "UPDATE files SET file_hash = NULL "
                    "WHERE file_hash IS NOT NULL"
                ))
            config.DATA_DIR.mkdir(parents=True, exist_ok=True)
            sentinel.touch()

    # === Phase 12: Create file_exif table ===
    tables = inspector.get_table_names()
    if "file_exif" not in tables:
        logger.info("Migrating: creating 'file_exif' table")
        Base.metadata.tables["file_exif"].create(bind=engine_, checkfirst=True)

    # === Spec 2026-05-12-playlist-to-collection: playlists → collections rename ===
    # Old tables ``playlists`` and ``playlist_items`` are renamed to
    # ``collections`` and ``collection_items``. The new schema also adds a
    # ``description`` column on ``collections``. ``create_all`` in
    # ``init_db`` already created the empty new tables for us; we just
    # need to copy old data over and drop the legacy tables.
    inspector_after = inspect(engine_)
    tables_after = inspector_after.get_table_names()
    if "playlists" in tables_after:
        logger.info("Migrating: copying 'playlists' → 'collections'")
        with engine_.begin() as conn:
            # Defensive: only copy when the new tables are empty. This
            # avoids merging data if a previous migration partially ran.
            existing = conn.execute(text("SELECT COUNT(*) FROM collections")).scalar()
            if existing == 0:
                conn.execute(text("""
                    INSERT INTO collections (id, drive, name, description, created_at, updated_at)
                    SELECT id, drive, name, NULL, created_at, updated_at FROM playlists
                """))
                conn.execute(text("""
                    INSERT INTO collection_items (id, collection_id, file_id, position, created_at)
                    SELECT id, playlist_id, file_id, position, created_at FROM playlist_items
                """))
            else:
                logger.warning(
                    "'collections' already populated; skipping playlist copy"
                )
            conn.execute(text("DROP TABLE playlist_items"))
            conn.execute(text("DROP TABLE playlists"))
        logger.info("Migration complete: playlists data copied to collections")

    # === Spec 2026-05-12-markdown-link-three-forms: add md_id column to files ===
    inspector_md = inspect(engine_)
    tables_md = inspector_md.get_table_names()
    if "files" in tables_md:
        file_columns = {col["name"] for col in inspector_md.get_columns("files")}
        if "md_id" not in file_columns:
            logger.info("Migrating: adding 'md_id' column to files")
            with engine_.begin() as conn:
                conn.execute(text("ALTER TABLE files ADD COLUMN md_id VARCHAR(32)"))
        existing_indexes = {i["name"] for i in inspector_md.get_indexes("files")}
        if "idx_files_drive_md_id" not in existing_indexes:
            with engine_.begin() as conn:
                conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS idx_files_drive_md_id "
                    "ON files(drive, md_id)"
                ))

        # Phase B: aliases projection (frontmatter ``aliases:`` → JSON
        # list). No index — alias lookup is a drive-scoped scan, which
        # stays bounded by the drive = security boundary rule.
        file_columns = {col["name"] for col in inspector_md.get_columns("files")}
        if "md_aliases" not in file_columns:
            logger.info("Migrating: adding 'md_aliases' column to files")
            with engine_.begin() as conn:
                conn.execute(text("ALTER TABLE files ADD COLUMN md_aliases TEXT"))

    # === Spec 2026-05-17-file-path-drive-scoped-unique: files.file_path
    # UNIQUE must be per-drive, not global.
    #
    # The pre-fix schema declared ``file_path`` with a single-column
    # ``unique=True`` (models.py) / ``file_path ... UNIQUE`` (raw DDL).
    # Because the scanner stores a *drive-relative* path with no drive
    # prefix, two drives could never both hold e.g. a root ``README.md``
    # (the second registration died with an IntegrityError surfaced as
    # 409). A drive is a security boundary, so uniqueness is per-drive —
    # this matches Tag / EmptyFolder / PinnedFolder / Collection, which
    # are all ``UniqueConstraint("drive", ...)``.
    #
    # SQLite can't ``DROP`` the implicit ``sqlite_autoindex`` an inline
    # single-column UNIQUE creates, so the table must be rebuilt (same
    # idiom as the nanoid / dislikes rebuilds above). Idempotent: gated
    # on the composite constraint already being present, so once any DB
    # is converted this phase never runs again — which is why the
    # rebuild DDL below only has to mirror models.py *as of this
    # release* (later columns are added by their own ALTER phase, but a
    # DB old enough to lack the composite constraint cannot yet have
    # them, and a DB new enough to have them already has the composite).
    #
    # Data is safe: the old GLOBAL unique physically guaranteed no
    # cross-drive duplicate ``file_path``, so every existing row already
    # satisfies ``(drive, file_path)``. FK enforcement is turned OFF for
    # the swap: with it ON, ``DROP TABLE files`` performs an implicit
    # row-delete that would CASCADE into file_tags / file_relations /
    # file_exif / comments and wipe tags, relations, comments, exif.
    # Ids are preserved by the INSERT…SELECT, so the renamed table
    # re-satisfies every child FK by name; ``foreign_key_check`` asserts
    # no orphan slipped through before FK enforcement is restored.
    inspector_fp = inspect(engine_)
    if "files" in inspector_fp.get_table_names():
        has_composite = any(
            sorted(u["column_names"]) == ["drive", "file_path"]
            for u in inspector_fp.get_unique_constraints("files")
        )
        if not has_composite:
            logger.info(
                "Migrating: files.file_path global UNIQUE → "
                "composite UNIQUE(drive, file_path)"
            )
            old_cols = [c["name"] for c in inspector_fp.get_columns("files")]
            new_schema_cols = [
                "id", "filename", "title", "description", "drive",
                "folder_path", "file_path", "file_size", "file_type",
                "mime_type", "thumbnail_path", "duration", "likes",
                "is_favorite", "created_at", "updated_at", "deleted_at",
                "missing_since", "file_hash", "md_id", "md_aliases",
            ]
            common = [c for c in new_schema_cols if c in old_cols]
            col_list = ", ".join(common)

            raw = engine_.raw_connection()
            try:
                cur = raw.cursor()
                cur.execute("PRAGMA foreign_keys=OFF")
                cur.execute("BEGIN")
                cur.execute("""
                    CREATE TABLE files_new (
                        id VARCHAR(12) PRIMARY KEY,
                        filename VARCHAR NOT NULL,
                        title VARCHAR NOT NULL,
                        description TEXT DEFAULT '',
                        drive VARCHAR NOT NULL DEFAULT '',
                        folder_path VARCHAR NOT NULL DEFAULT '',
                        file_path VARCHAR NOT NULL,
                        file_size INTEGER NOT NULL,
                        file_type VARCHAR NOT NULL DEFAULT 'other',
                        mime_type VARCHAR NOT NULL DEFAULT 'application/octet-stream',
                        thumbnail_path VARCHAR,
                        duration FLOAT,
                        likes INTEGER DEFAULT 0,
                        is_favorite BOOLEAN DEFAULT 0,
                        created_at DATETIME,
                        updated_at DATETIME,
                        deleted_at DATETIME,
                        missing_since DATETIME,
                        file_hash VARCHAR(64),
                        md_id VARCHAR(32),
                        md_aliases TEXT,
                        CONSTRAINT uq_files_drive_file_path
                            UNIQUE (drive, file_path)
                    )
                """)
                cur.execute(
                    f"INSERT INTO files_new ({col_list}) "
                    f"SELECT {col_list} FROM files"
                )
                cur.execute("DROP TABLE files")
                cur.execute("ALTER TABLE files_new RENAME TO files")
                for ddl in (
                    "CREATE INDEX idx_files_drive_folder_path "
                    "ON files(drive, folder_path)",
                    "CREATE INDEX idx_files_title ON files(title)",
                    "CREATE INDEX idx_files_is_favorite ON files(is_favorite)",
                    "CREATE INDEX idx_files_file_type ON files(file_type)",
                    "CREATE INDEX idx_files_deleted_at ON files(deleted_at)",
                    "CREATE INDEX idx_files_missing_since ON files(missing_since)",
                    "CREATE INDEX idx_files_file_hash ON files(file_hash)",
                    "CREATE INDEX idx_files_drive_md_id ON files(drive, md_id)",
                ):
                    cur.execute(ddl)
                cur.execute("COMMIT")
                orphans = cur.execute("PRAGMA foreign_key_check").fetchall()
                if orphans:
                    raise RuntimeError(
                        f"foreign_key_check failed after files rebuild: {orphans}"
                    )
                cur.execute("PRAGMA foreign_keys=ON")
                raw.commit()
                logger.info(
                    "Migration complete: files.file_path is now "
                    "UNIQUE per (drive, file_path)"
                )
            except Exception:
                # The connection still has ``foreign_keys=OFF`` (and may be
                # mid-transaction). Discard it so the pool can't hand a
                # FK-disabled connection to a later checkout — the engine's
                # connect listener re-enables FK on the fresh one. (In
                # practice this aborts ``init_db`` and startup, but stay
                # defensive in case a caller recovers.)
                try:
                    raw.rollback()
                finally:
                    raw.invalidate()
                raise
            finally:
                raw.close()


def init_db() -> None:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    _migrate(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
