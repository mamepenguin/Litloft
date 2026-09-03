import asyncio
import logging
import shutil
import time
from functools import partial
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

import app.config as config
from app.auth import require_admin
from app.database import get_db
from app.models import File, active_file_filter
from app.schemas import (
    DashboardDriveInfo,
    DashboardFilesystemInfo,
    DashboardResponse,
    DashboardSystemInfo,
)
from app.services.scanner import get_scan_status

logger = logging.getLogger(__name__)

# Admin-only: every endpoint here exposes system-wide aggregates
# (disk usage, indexed totals across all drives, scan status). Callers
# must hold every protected access_group — see auth.is_admin docstring.
router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)

_start_time = time.monotonic()


def _collect_filesystems(drives: list[dict]) -> list[DashboardFilesystemInfo]:
    """Group the configured drives by the filesystem they sit on.

    ``shutil.disk_usage`` measures a mount, not a directory, so asking
    it per drive answered the same number for every drive on one disk —
    a drive with no files in it read as 48% full, and three drives on
    one SSD looked like three disks filling in step. Grouping by
    ``st_dev`` says the true thing once and names which drives share it.
    """
    by_device: dict[int, DashboardFilesystemInfo] = {}
    for drive in drives:
        path = Path(drive["path"])
        try:
            device = path.stat().st_dev
            usage = shutil.disk_usage(str(path))
        except OSError:
            # An unmounted or unreadable drive contributes no filesystem
            # row rather than a row of zeroes claiming a full disk.
            continue
        existing = by_device.get(device)
        if existing is not None:
            existing.drives.append(drive["name"])
            continue
        by_device[device] = DashboardFilesystemInfo(
            mount_label=str(path),
            total_bytes=usage.total,
            used_bytes=usage.used,
            free_bytes=usage.free,
            drives=[drive["name"]],
        )
    return list(by_device.values())


def _get_directory_size(directory: Path) -> int:
    """Sum file sizes in a directory. Returns 0 if directory does not exist."""
    if not directory.exists():
        return 0
    total = 0
    for item in directory.rglob("*"):
        if item.is_file():
            try:
                total += item.stat().st_size
            except OSError:
                pass
    return total


def _get_file_size(file_path: Path) -> int:
    """Return file size in bytes. Returns 0 if file does not exist."""
    try:
        return file_path.stat().st_size
    except OSError:
        return 0


def _build_drive_info(db: Session, drive: dict) -> DashboardDriveInfo:
    """Build dashboard info for a single drive."""
    name = drive["name"]

    type_counts = (
        db.query(File.file_type, func.count())
        .filter(File.drive == name, active_file_filter())
        .group_by(File.file_type)
        .all()
    )
    file_types = {ft: count for ft, count in type_counts}
    file_count = sum(file_types.values())

    scan_status = get_scan_status(name)

    return DashboardDriveInfo(
        name=name,
        file_count=file_count,
        file_types=file_types,
        last_scanned_at=scan_status["last_scanned_at"],
        is_scanning=scan_status["is_scanning"],
    )


def _build_system_info(db: Session) -> DashboardSystemInfo:
    """Build system-level dashboard info."""
    db_path = config.DATABASE_PATH

    total_files = (
        db.query(func.count())
        .select_from(File)
        .filter(active_file_filter())
        .scalar()
    )
    trash_count = (
        db.query(func.count())
        .select_from(File)
        .filter(File.deleted_at.isnot(None))
        .scalar()
    )
    missing_count = (
        db.query(func.count())
        .select_from(File)
        .filter(File.missing_since.isnot(None), File.deleted_at.is_(None))
        .scalar()
    )

    return DashboardSystemInfo(
        filesystems=_collect_filesystems(config.load_drives()),
        db_size_bytes=_get_file_size(db_path),
        thumbnail_cache_bytes=_get_directory_size(config.THUMBNAILS_DIR),
        converted_cache_bytes=_get_directory_size(config.CONVERTED_DIR),
        upload_temp_bytes=_get_directory_size(config.UPLOAD_DIR),
        total_files=total_files,
        trash_count=trash_count,
        missing_count=missing_count,
        uptime_seconds=time.monotonic() - _start_time,
    )


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(db: Session = Depends(get_db)):
    """Return health check dashboard with drive and system information."""
    drives = config.load_drives()
    drive_infos = [_build_drive_info(db, drive) for drive in drives]
    # Run blocking filesystem I/O in a thread pool to avoid starving the event loop
    loop = asyncio.get_event_loop()
    system_info = await loop.run_in_executor(None, partial(_build_system_info, db))

    return DashboardResponse(
        drives=drive_infos,
        system=system_info,
    )
