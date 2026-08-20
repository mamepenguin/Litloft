import hashlib
import logging
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import File
from app.services.hash import compute_file_hash

logger = logging.getLogger(__name__)


class ContentWriteError(RuntimeError):
    pass


class ContentConflictError(ContentWriteError):
    pass


class ContentMissingError(ContentWriteError):
    pass


@dataclass(frozen=True)
class ContentWriteResult:
    etag: str
    version_action: str | None


def compute_content_etag(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def write_text_content(
    db: Session,
    file: File,
    file_path: Path,
    body: bytes,
    *,
    expected_etag: str,
    kind: str,
    viewer_id: str | None,
    nickname: str | None,
) -> ContentWriteResult:
    try:
        current = file_path.read_bytes()
    except FileNotFoundError as exc:
        raise ContentMissingError("File not found on disk") from exc
    if compute_content_etag(current) != expected_etag:
        raise ContentConflictError("ETag mismatch")

    tmp_fd, tmp_name = tempfile.mkstemp(
        prefix=f".{file_path.name}.", suffix=".tmp", dir=str(file_path.parent)
    )
    try:
        with os.fdopen(tmp_fd, "wb") as handle:
            handle.write(body)
        os.replace(tmp_name, file_path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise

    file.file_size = len(body)
    file.file_hash = compute_file_hash(file_path)
    version_action: str | None = None
    try:
        from app.services.file_versions import record_version_with_action

        with db.begin_nested():
            version_result = record_version_with_action(
                db,
                file_id=file.id,
                body=body,
                kind=kind,
                viewer_id=viewer_id,
                nickname=nickname,
            )
            version_action = version_result.action
    except Exception:
        logger.exception(
            "Could not record file version: file_id=%s drive=%s",
            file.id,
            file.drive,
        )
    db.commit()
    return ContentWriteResult(
        etag=compute_content_etag(body),
        version_action=version_action,
    )
