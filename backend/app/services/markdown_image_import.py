from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import tempfile
import uuid
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

import app.config as config
import app.database as database
from app.models import File, active_file_filter
from app.services.content_write import ContentConflictError, write_text_content
from app.services import event_hooks
from app.services.fileops import physical_delete, validate_within_drive
from app.services.maintenance import (
    MaintenanceBusyError,
    is_busy,
    maintenance_operation,
)
from app.services.markdown_images import (
    find_first_markdown_image,
    project_markdown_thumbnail,
    replace_image_destination,
)
from app.services.markdown_relations import sync_markdown_file_relations
from app.services.safe_image_fetch import (
    NormalizedImage,
    SafeImageFetchError,
    fetch_and_normalize_image,
    validate_image_url,
)
from app.services.scanner import register_single_file

logger = logging.getLogger(__name__)

ANALYSIS_TTL = timedelta(minutes=30)
MAX_MARKDOWN_BYTES = 1_000_000
RECENT_ERROR_LIMIT = 50
_LOFT_RE = re.compile(r"^loft://([A-Za-z0-9_-]{12})(?:[?#].*)?$")
_SAFE_STEM_RE = re.compile(r"[^\w .-]+", re.UNICODE)


@dataclass(frozen=True)
class ImportCandidate:
    file_id: str
    file_path: str
    content_hash: str
    url: str
    url_hash: str
    hostname: str
    destination_start: int
    destination_end: int

    @property
    def syntax(self) -> str:
        return "inline"


@dataclass
class AnalysisSnapshot:
    analysis_id: str
    drive: str
    folder_path: str
    recursive: bool
    created_at: datetime
    counts: dict[str, int]
    host_counts: dict[str, int]
    samples: list[dict[str, str]]
    candidates: list[ImportCandidate]


@dataclass
class ImportJob:
    job_id: str
    analysis_id: str
    drive: str
    allowed_hosts: list[str]
    state: str = "queued"
    total: int = 0
    processed: int = 0
    succeeded: int = 0
    reused: int = 0
    skipped: int = 0
    conflicts: int = 0
    failed: int = 0
    current_file: str | None = None
    recent_errors: list[dict[str, str]] = field(default_factory=list)
    results: list[dict[str, str]] = field(default_factory=list)
    started_at: str | None = None
    finished_at: str | None = None
    cancel_requested: bool = False

    def public_dict(self) -> dict:
        result = asdict(self)
        result.pop("cancel_requested", None)
        return result


_analyses: dict[str, AnalysisSnapshot] = {}
_jobs: dict[str, ImportJob] = {}
_current_job_id: str | None = None


def _now() -> datetime:
    return datetime.now(UTC)


def _job_dir() -> Path:
    return config.DATA_DIR / "markdown-image-imports"


def _persist_job(job: ImportJob) -> None:
    directory = _job_dir()
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{job.job_id}.json"
    fd, temporary = tempfile.mkstemp(prefix=f".{job.job_id}.", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(job.public_dict(), handle, ensure_ascii=False, indent=2)
        os.replace(temporary, target)
    except Exception:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def initialize_interrupted_jobs() -> None:
    directory = _job_dir()
    if not directory.exists():
        return
    for path in directory.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("state") not in {"queued", "running", "cancelling"}:
                continue
            data["state"] = "interrupted"
            data["finished_at"] = _now().isoformat()
            fd, temporary = tempfile.mkstemp(prefix=f".{path.stem}.", dir=directory)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(data, handle, ensure_ascii=False, indent=2)
            os.replace(temporary, path)
            job = ImportJob(
                **{
                    key: value
                    for key, value in data.items()
                    if key in ImportJob.__dataclass_fields__
                }
            )
            _jobs[job.job_id] = job
        except (OSError, ValueError):
            logger.exception("Could not mark interrupted import job: %s", path)


def _is_markdown(file: File) -> bool:
    return file.mime_type == "text/markdown" or file.filename.lower().endswith(".md")


def _scope_query(query, folder_path: str, recursive: bool):
    if not folder_path:
        return query
    if recursive:
        escaped = (
            folder_path.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        )
        return query.filter(
            or_(
                File.folder_path == folder_path,
                File.folder_path.like(f"{escaped}/%", escape="\\"),
            )
        )
    return query.filter(File.folder_path == folder_path)


def create_analysis(
    db: Session,
    drive: str,
    folder_path: str = "",
    recursive: bool = True,
) -> AnalysisSnapshot:
    if drive not in config.get_drive_names():
        raise ValueError("drive_not_found")
    folder_path = folder_path.strip("/")
    if ".." in folder_path.split("/"):
        raise ValueError("invalid_folder")

    query = db.query(File).filter(
        File.drive == drive,
        active_file_filter(),
        or_(
            File.mime_type == "text/markdown",
            func.lower(File.filename).like("%.md"),
        ),
    )
    rows = _scope_query(query, folder_path, recursive).order_by(File.file_path).all()
    counts = Counter(
        {
            "total_markdown": len(rows),
            "local_loft_image": 0,
            "external_https_candidate": 0,
            "no_image": 0,
            "unsupported_first_image": 0,
            "invalid_loft_reference": 0,
            "read_error": 0,
        }
    )
    host_counts: Counter[str] = Counter()
    candidates: list[ImportCandidate] = []
    samples: list[dict[str, str]] = []
    drive_path = config.get_drive_path(drive)

    for file in rows:
        path = drive_path / file.file_path
        try:
            if path.stat().st_size > MAX_MARKDOWN_BYTES:
                raise OSError("Markdown exceeds analysis size limit")
            raw = path.read_bytes()
            content = raw.decode("utf-8")
        except (OSError, UnicodeDecodeError):
            counts["read_error"] += 1
            if len(samples) < 25:
                samples.append({"file_path": file.file_path, "category": "read_error"})
            continue

        image = find_first_markdown_image(content)
        if image is None:
            counts["no_image"] += 1
            continue
        if image.syntax != "inline" or image.url is None:
            counts["unsupported_first_image"] += 1
            if len(samples) < 25:
                samples.append(
                    {"file_path": file.file_path, "category": "unsupported_first_image"}
                )
            continue

        loft_match = _LOFT_RE.fullmatch(image.url)
        if loft_match:
            target = (
                db.query(File)
                .filter(
                    File.id == loft_match.group(1),
                    File.drive == drive,
                    File.file_type == "image",
                    active_file_filter(),
                )
                .first()
            )
            if target is None:
                counts["invalid_loft_reference"] += 1
            else:
                counts["local_loft_image"] += 1
            continue

        if image.url.lower().startswith("loft://"):
            counts["invalid_loft_reference"] += 1
            continue

        try:
            validated = validate_image_url(image.url)
        except SafeImageFetchError:
            counts["unsupported_first_image"] += 1
            if len(samples) < 25:
                samples.append(
                    {"file_path": file.file_path, "category": "unsupported_first_image"}
                )
            continue
        assert image.destination_start is not None and image.destination_end is not None
        content_hash = hashlib.sha256(raw).hexdigest()
        url_hash = hashlib.sha256(image.url.encode("utf-8")).hexdigest()
        candidates.append(
            ImportCandidate(
                file_id=file.id,
                file_path=file.file_path,
                content_hash=content_hash,
                url=image.url,
                url_hash=url_hash,
                hostname=validated.hostname,
                destination_start=image.destination_start,
                destination_end=image.destination_end,
            )
        )
        counts["external_https_candidate"] += 1
        host_counts[validated.hostname] += 1
        if len(samples) < 25:
            samples.append(
                {
                    "file_path": file.file_path,
                    "category": "external_https_candidate",
                    "hostname": validated.hostname,
                }
            )

    snapshot = AnalysisSnapshot(
        analysis_id=uuid.uuid4().hex,
        drive=drive,
        folder_path=folder_path,
        recursive=recursive,
        created_at=_now(),
        counts=dict(counts),
        host_counts=dict(sorted(host_counts.items())),
        samples=samples,
        candidates=candidates,
    )
    _analyses[snapshot.analysis_id] = snapshot
    _purge_expired_analyses()
    return snapshot


def _purge_expired_analyses() -> None:
    cutoff = _now() - ANALYSIS_TTL
    for analysis_id, snapshot in list(_analyses.items()):
        if snapshot.created_at < cutoff:
            del _analyses[analysis_id]


def get_analysis(analysis_id: str) -> AnalysisSnapshot | None:
    _purge_expired_analyses()
    return _analyses.get(analysis_id)


def _asset_stem(note: File) -> str:
    stem = _SAFE_STEM_RE.sub("-", Path(note.filename).stem).strip(" .-")
    return (stem or "image")[:100]


def _choose_asset_path(
    db: Session,
    note: File,
    candidate: ImportCandidate,
    image: NormalizedImage,
) -> tuple[Path, File | None]:
    folder = f"{note.folder_path}/assets" if note.folder_path else "assets"
    drive_path = config.get_drive_path(note.drive)
    directory = drive_path / folder
    validate_within_drive(directory, drive_path)
    directory.mkdir(parents=True, exist_ok=True)
    base = f"{_asset_stem(note)}-{candidate.url_hash[:8]}"
    for index in range(1, 1001):
        suffix = "" if index == 1 else f"_{index}"
        filename = f"{base}{suffix}{image.extension}"
        relative = f"{folder}/{filename}"
        existing = (
            db.query(File)
            .filter(
                File.drive == note.drive,
                File.file_path == relative,
                File.file_type == "image",
                active_file_filter(),
            )
            .first()
        )
        if existing is not None:
            existing_path = directory / filename
            try:
                if hashlib.sha256(existing_path.read_bytes()).digest() == hashlib.sha256(
                    image.body
                ).digest():
                    return existing_path, existing
            except OSError:
                pass
            continue
        path = directory / filename
        if not path.exists():
            return path, None
    raise RuntimeError("asset_write_failed: too many filename collisions")


def _write_asset(path: Path, image: NormalizedImage) -> None:
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(image.body)
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def _verify_candidate(note: File, candidate: ImportCandidate) -> tuple[Path, bytes, str]:
    drive_path = config.get_drive_path(note.drive)
    path = config.get_drive_path(note.drive) / note.file_path
    validate_within_drive(path, drive_path)
    raw = path.read_bytes()
    content_hash = hashlib.sha256(raw).hexdigest()
    if content_hash != candidate.content_hash:
        raise ContentConflictError("Markdown changed after analysis")
    content = raw.decode("utf-8")
    image = find_first_markdown_image(content)
    if (
        image is None
        or image.syntax != "inline"
        or image.url != candidate.url
        or image.destination_start != candidate.destination_start
        or image.destination_end != candidate.destination_end
    ):
        raise ContentConflictError("First image changed after analysis")
    return path, raw, content


def _apply_import(
    candidate: ImportCandidate,
    image: NormalizedImage,
) -> tuple[str, str, str]:
    db = database.SessionLocal()
    created_asset: File | None = None
    try:
        note = (
            db.query(File)
            .filter(File.id == candidate.file_id, active_file_filter())
            .first()
        )
        if note is None or not _is_markdown(note):
            raise ContentConflictError("Markdown file is no longer active")
        note_path, raw, content = _verify_candidate(note, candidate)
        asset_path, asset = _choose_asset_path(db, note, candidate, image)
        reused = asset is not None
        if asset is None:
            try:
                _write_asset(asset_path, image)
                asset_id = register_single_file(db, note.drive, asset_path)
                db.commit()
            except Exception:
                db.rollback()
                try:
                    asset_path.unlink(missing_ok=True)
                    thumbnail = (
                        config.THUMBNAILS_DIR
                        / note.drive
                        / Path(asset_path.relative_to(config.get_drive_path(note.drive))).with_suffix(".jpg")
                    )
                    thumbnail.unlink(missing_ok=True)
                except OSError:
                    logger.exception("Could not clean up failed asset registration")
                raise
            asset = db.query(File).filter(File.id == asset_id).one()
            created_asset = asset

        replacement = f"loft://{asset.id}"
        new_content = replace_image_destination(content, candidate, replacement)
        try:
            write_text_content(
                db,
                note,
                note_path,
                new_content.encode("utf-8"),
                expected_etag=candidate.content_hash,
                kind="explicit",
                viewer_id=None,
                nickname=None,
            )
        except Exception as write_error:
            if created_asset is not None:
                try:
                    physical_delete(db, created_asset)
                    db.commit()
                except Exception as cleanup_error:
                    db.rollback()
                    raise RuntimeError(
                        f"content_write_failed; orphan_file_id={created_asset.id}"
                    ) from cleanup_error
            raise write_error

        try:
            sync_markdown_file_relations(
                db, note.id, note.drive, new_content, note.folder_path
            )
            project_markdown_thumbnail(db, note, new_content)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Markdown projection failed after import: %s", note.id)
        return (
            "reused" if reused else "succeeded",
            asset.id,
            hashlib.sha256(new_content.encode("utf-8")).hexdigest(),
        )
    finally:
        db.close()


def _record_error(job: ImportJob, candidate: ImportCandidate, code: str, detail: str) -> None:
    job.recent_errors.append(
        {"file_path": candidate.file_path, "code": code, "detail": detail[:300]}
    )
    job.recent_errors = job.recent_errors[-RECENT_ERROR_LIMIT:]


async def _run_import_job(job: ImportJob, candidates: list[ImportCandidate]) -> None:
    global _current_job_id
    try:
        async with maintenance_operation(f"markdown-image-import:{job.job_id}"):
            job.state = "running"
            job.started_at = _now().isoformat()
            _persist_job(job)
            for candidate in candidates:
                if job.cancel_requested:
                    job.state = "cancelled"
                    break
                job.current_file = candidate.file_path
                _persist_job(job)
                try:
                    image = await asyncio.to_thread(fetch_and_normalize_image, candidate.url)
                    result, asset_id, after_hash = await asyncio.to_thread(
                        _apply_import, candidate, image
                    )
                    if result == "reused":
                        job.reused += 1
                    else:
                        job.succeeded += 1
                    job.results.append(
                        {
                            "file_id": candidate.file_id,
                            "file_path": candidate.file_path,
                            "source_hostname": candidate.hostname,
                            "url_hash": candidate.url_hash,
                            "imported_file_id": asset_id,
                            "before_content_hash": candidate.content_hash,
                            "after_content_hash": after_hash,
                            "result": result,
                            "finished_at": _now().isoformat(),
                        }
                    )
                    await event_hooks.emit(
                        "files.updated",
                        {"file_ids": [candidate.file_id, asset_id]},
                    )
                except ContentConflictError as exc:
                    job.conflicts += 1
                    _record_error(job, candidate, "content_conflict", str(exc))
                except SafeImageFetchError as exc:
                    job.failed += 1
                    _record_error(job, candidate, exc.code, exc.detail)
                except Exception as exc:
                    job.failed += 1
                    _record_error(job, candidate, "import_failed", str(exc))
                    logger.exception("Markdown image import failed: %s", candidate.file_path)
                finally:
                    job.processed += 1
                    _persist_job(job)
            if job.state not in {"cancelled", "failed"}:
                job.state = "completed"
    except MaintenanceBusyError as exc:
        job.state = "failed"
        job.recent_errors.append({"file_path": "", "code": "maintenance_busy", "detail": str(exc)})
    except Exception as exc:
        job.state = "failed"
        job.recent_errors.append({"file_path": "", "code": "job_failed", "detail": str(exc)})
        logger.exception("Markdown image import job failed")
    finally:
        job.current_file = None
        job.finished_at = _now().isoformat()
        try:
            _persist_job(job)
        finally:
            if _current_job_id == job.job_id:
                _current_job_id = None


def start_import(analysis_id: str, allowed_hosts: list[str]) -> ImportJob:
    global _current_job_id
    snapshot = get_analysis(analysis_id)
    if snapshot is None:
        raise ValueError("analysis_not_found")
    requested = set(allowed_hosts)
    if not requested or not requested.issubset(snapshot.host_counts):
        raise ValueError("allowed_hosts_invalid")
    try:
        drive_path = config.get_drive_path(snapshot.drive)
        scope_path = drive_path / snapshot.folder_path if snapshot.folder_path else drive_path
        validate_within_drive(scope_path, drive_path)
        if not scope_path.is_dir():
            raise ValueError("scope_invalid")
    except Exception as exc:
        raise ValueError("scope_invalid") from exc
    if _current_job_id is not None or is_busy():
        raise MaintenanceBusyError("Another maintenance operation is active")
    candidates = [item for item in snapshot.candidates if item.hostname in requested]
    job = ImportJob(
        job_id=uuid.uuid4().hex,
        analysis_id=analysis_id,
        drive=snapshot.drive,
        allowed_hosts=sorted(requested),
        total=len(candidates),
    )
    _jobs[job.job_id] = job
    _current_job_id = job.job_id
    _persist_job(job)
    asyncio.create_task(_run_import_job(job, candidates))
    return job


def get_job(job_id: str) -> ImportJob | None:
    job = _jobs.get(job_id)
    if job is not None:
        return job
    path = _job_dir() / f"{job_id}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return ImportJob(**{key: value for key, value in data.items() if key in ImportJob.__dataclass_fields__})
    except (OSError, ValueError, TypeError):
        return None


def get_current_job() -> ImportJob | None:
    if _current_job_id:
        return get_job(_current_job_id)
    interrupted = [job for job in _jobs.values() if job.state == "interrupted"]
    return max(interrupted, key=lambda item: item.finished_at or "") if interrupted else None


def cancel_job(job_id: str) -> ImportJob | None:
    job = _jobs.get(job_id)
    if job is None:
        return get_job(job_id)
    if job.state in {"queued", "running"}:
        job.cancel_requested = True
        job.state = "cancelling"
        _persist_job(job)
    return job
