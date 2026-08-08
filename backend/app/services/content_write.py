import hashlib
import os
import tempfile
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import File
from app.services.hash import compute_file_hash


class ContentWriteError(RuntimeError):
    pass


class ContentConflictError(ContentWriteError):
    pass


class ContentMissingError(ContentWriteError):
    pass


def compute_content_etag(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def write_text_content(
    db: Session,
    file: File,
    file_path: Path,
    body: bytes,
    *,
    expected_etag: str,
) -> str:
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
    db.commit()
    return compute_content_etag(body)
