"""The frontmatter ``origin`` marker, projected into ``File.md_origin``."""

import logging

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import File
from app.services.frontmatter import extract_origin, has_unreadable_frontmatter

logger = logging.getLogger(__name__)


def project_frontmatter_origin(db: Session, file: File, content: str) -> None:
    """Set ``file.md_origin`` from the frontmatter ``origin`` of ``content``.

    ``updated_at`` is written with its own current value rather than left to
    the ORM's ``onupdate``: a marker that changed on its own must not reorder
    anything sorted by that column. Unreadable frontmatter leaves the stored
    value alone, so a broken block is not a removal. The savepoint keeps a
    failure inside the projection.
    """
    try:
        with db.begin_nested():
            if has_unreadable_frontmatter(content):
                return
            value = extract_origin(content)
            if value == file.md_origin:
                return
            db.execute(
                update(File)
                .where(File.id == file.id)
                .values(md_origin=value, updated_at=File.updated_at)
                .execution_options(synchronize_session="fetch")
            )
    except Exception:
        logger.warning("origin projection failed for %s", file.file_path)
