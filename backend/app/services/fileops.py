import logging
import os
import shutil
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

import app.config as config
from app.models import EmptyFolder, File

logger = logging.getLogger(__name__)

FORBIDDEN_CHARS = set('<>:"/\\|?*\x00')
MAX_FILENAME_LENGTH = 255


def validate_writable(drive_name: str) -> Path:
    if drive_name not in config.get_drive_names():
        raise HTTPException(status_code=404, detail=f"Drive not found: {drive_name}")
    if config.is_drive_readonly(drive_name):
        raise HTTPException(status_code=403, detail="Drive is read-only")
    return config.get_drive_path(drive_name)


def validate_path_safe(path: str) -> str:
    if not path:
        return ""
    if "\x00" in path:
        raise HTTPException(status_code=400, detail="Invalid path: null byte")
    if path.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid path: absolute path")
    if ".." in path.split("/"):
        raise HTTPException(status_code=400, detail="Invalid path: traversal")
    return path


def validate_filename(filename: str) -> str:
    if not filename or not filename.strip():
        raise HTTPException(status_code=400, detail="Empty filename")
    filename = filename.strip()
    if any(c in filename for c in FORBIDDEN_CHARS):
        raise HTTPException(status_code=400, detail="Filename contains forbidden characters")
    if filename.startswith("."):
        raise HTTPException(status_code=400, detail="Hidden files not allowed")
    if len(filename) > MAX_FILENAME_LENGTH:
        raise HTTPException(status_code=400, detail="Filename too long")
    if filename in (".", ".."):
        raise HTTPException(status_code=400, detail="Invalid filename")
    return filename


def validate_within_drive(target: Path, drive_path: Path) -> Path:
    real_target = Path(os.path.realpath(target))
    real_base = Path(os.path.realpath(drive_path))
    base_str = str(real_base)
    if not (str(real_target) == base_str or str(real_target).startswith(base_str + os.sep)):
        raise HTTPException(status_code=403, detail="Access denied: path outside drive")
    return real_target


def _filename_to_title(filename: str) -> str:
    name = Path(filename).stem
    name = name.replace("_", " ").replace("-", " ")
    return name.title()


def _move_thumbnail(file: File, new_thumb_rel: str) -> None:
    if not file.thumbnail_path:
        return
    old_thumb = config.THUMBNAILS_DIR / file.thumbnail_path
    new_thumb = config.THUMBNAILS_DIR / new_thumb_rel
    if old_thumb.exists():
        new_thumb.parent.mkdir(parents=True, exist_ok=True)
        old_thumb.rename(new_thumb)
        _cleanup_empty_parents(old_thumb.parent, config.THUMBNAILS_DIR)


def _cleanup_empty_parents(directory: Path, stop_at: Path) -> None:
    current = directory
    while current != stop_at and current.is_dir():
        try:
            current.rmdir()
            current = current.parent
        except OSError:
            break


def remove_empty_folder_if_has_files(db: Session, drive: str, folder_path: str) -> None:
    existing = (
        db.query(EmptyFolder)
        .filter(EmptyFolder.drive == drive, EmptyFolder.path == folder_path)
        .first()
    )
    if existing:
        db.delete(existing)


def rename_file(db: Session, file_id: str, new_filename: str) -> File:
    file = db.query(File).filter(File.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    new_filename = validate_filename(new_filename)
    drive_path = validate_writable(file.drive)

    old_full = drive_path / file.file_path
    new_rel = f"{file.folder_path}/{new_filename}" if file.folder_path else new_filename
    new_full = drive_path / new_rel
    validate_within_drive(new_full, drive_path)

    if new_full.exists():
        raise HTTPException(status_code=409, detail="File already exists")
    if not old_full.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    old_full.rename(new_full)

    if file.file_type == "video" and file.thumbnail_path:
        new_stem = Path(new_filename).stem
        new_thumb_rel = (
            f"{file.drive}/{file.folder_path}/{new_stem}.jpg"
            if file.folder_path
            else f"{file.drive}/{new_stem}.jpg"
        )
        _move_thumbnail(file, new_thumb_rel)
        file.thumbnail_path = new_thumb_rel

    file.filename = new_filename
    file.file_path = new_rel
    file.title = _filename_to_title(new_filename)
    db.commit()
    db.refresh(file)
    return file


def move_file(db: Session, file_id: str, target_drive: str | None, target_folder: str) -> File:
    file = db.query(File).filter(File.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    src_drive = file.drive
    dst_drive = target_drive or src_drive
    target_folder = validate_path_safe(target_folder)

    src_drive_path = validate_writable(src_drive)
    dst_drive_path = validate_writable(dst_drive) if dst_drive != src_drive else src_drive_path

    old_full = src_drive_path / file.file_path
    new_rel = f"{target_folder}/{file.filename}" if target_folder else file.filename
    new_full = dst_drive_path / new_rel
    validate_within_drive(new_full, dst_drive_path)

    if new_full.exists():
        raise HTTPException(status_code=409, detail="File already exists at target")
    if not old_full.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    new_full.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(old_full), str(new_full))

    if file.file_type == "video" and file.thumbnail_path:
        new_thumb_rel = (
            f"{dst_drive}/{target_folder}/{file.filename.rsplit('.', 1)[0]}.jpg"
            if target_folder
            else f"{dst_drive}/{file.filename.rsplit('.', 1)[0]}.jpg"
        )
        _move_thumbnail(file, new_thumb_rel)
        file.thumbnail_path = new_thumb_rel

    file.drive = dst_drive
    file.folder_path = target_folder
    file.file_path = new_rel
    remove_empty_folder_if_has_files(db, dst_drive, target_folder)
    db.commit()
    db.refresh(file)
    return file


def delete_file(db: Session, file_id: str) -> None:
    file = db.query(File).filter(File.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    drive_path = validate_writable(file.drive)
    full_path = drive_path / file.file_path

    if full_path.exists():
        full_path.unlink()

    if file.thumbnail_path:
        thumb = config.THUMBNAILS_DIR / file.thumbnail_path
        if thumb.exists():
            thumb.unlink()
            _cleanup_empty_parents(thumb.parent, config.THUMBNAILS_DIR)

    db.delete(file)
    db.commit()


def create_folder(drive: str, parent_path: str, name: str, db: Session) -> dict:
    name = validate_filename(name)
    parent_path = validate_path_safe(parent_path)
    drive_path = validate_writable(drive)

    folder_path = f"{parent_path}/{name}" if parent_path else name
    full_path = drive_path / folder_path
    validate_within_drive(full_path, drive_path)

    if full_path.exists():
        raise HTTPException(status_code=409, detail="Folder already exists")

    full_path.mkdir(parents=True)

    ef = EmptyFolder(drive=drive, path=folder_path)
    db.add(ef)
    db.commit()

    return {"name": name, "path": folder_path, "file_count": 0, "thumbnail_file_id": None}


def rename_folder(drive: str, path: str, new_name: str, db: Session) -> dict:
    path = validate_path_safe(path)
    new_name = validate_filename(new_name)
    if not path:
        raise HTTPException(status_code=400, detail="Cannot rename drive root")

    drive_path = validate_writable(drive)
    old_full = drive_path / path
    validate_within_drive(old_full, drive_path)

    if not old_full.exists() or not old_full.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")

    parent = str(Path(path).parent)
    new_path = f"{parent}/{new_name}" if parent != "." else new_name
    new_full = drive_path / new_path
    validate_within_drive(new_full, drive_path)

    if new_full.exists():
        raise HTTPException(status_code=409, detail="Target folder already exists")

    old_full.rename(new_full)

    old_prefix = path + "/"
    old_len = len(path)
    db.execute(
        text("""
            UPDATE files
            SET folder_path = :new_path || substr(folder_path, :old_len + 1),
                file_path = :new_path || substr(file_path, :old_len + 1)
            WHERE drive = :drive
            AND (folder_path = :old_path OR folder_path LIKE :old_prefix)
        """),
        {
            "new_path": new_path,
            "old_len": old_len,
            "drive": drive,
            "old_path": path,
            "old_prefix": old_prefix + "%",
        },
    )

    # Update thumbnails
    files_in_folder = (
        db.query(File)
        .filter(
            File.drive == drive,
            (File.folder_path == new_path) | File.folder_path.like(new_path + "/%"),
        )
        .all()
    )
    for f in files_in_folder:
        if f.file_type == "video" and f.thumbnail_path:
            old_thumb = config.THUMBNAILS_DIR / f.thumbnail_path
            new_thumb_rel = (
                f"{drive}/{f.folder_path}/{Path(f.filename).stem}.jpg"
                if f.folder_path
                else f"{drive}/{Path(f.filename).stem}.jpg"
            )
            new_thumb = config.THUMBNAILS_DIR / new_thumb_rel
            if old_thumb.exists():
                new_thumb.parent.mkdir(parents=True, exist_ok=True)
                old_thumb.rename(new_thumb)
            f.thumbnail_path = new_thumb_rel

    # Update EmptyFolder records
    db.execute(
        text("""
            UPDATE empty_folders
            SET path = :new_path || substr(path, :old_len + 1)
            WHERE drive = :drive
            AND (path = :old_path OR path LIKE :old_prefix)
        """),
        {
            "new_path": new_path,
            "old_len": old_len,
            "drive": drive,
            "old_path": path,
            "old_prefix": old_prefix + "%",
        },
    )

    db.commit()

    file_count = (
        db.query(File)
        .filter(File.drive == drive, File.folder_path == new_path)
        .count()
    )
    return {"name": new_name, "path": new_path, "file_count": file_count, "thumbnail_file_id": None}


def delete_folder(drive: str, path: str, db: Session) -> None:
    path = validate_path_safe(path)
    if not path:
        raise HTTPException(status_code=400, detail="Cannot delete drive root")

    drive_path = validate_writable(drive)
    full_path = drive_path / path
    validate_within_drive(full_path, drive_path)

    if not full_path.exists() or not full_path.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")

    has_files = (
        db.query(File)
        .filter(
            File.drive == drive,
            (File.folder_path == path) | File.folder_path.like(path + "/%"),
        )
        .first()
    )
    if has_files:
        raise HTTPException(status_code=409, detail="Folder is not empty")

    has_subdirs = any(full_path.iterdir())
    if has_subdirs:
        raise HTTPException(status_code=409, detail="Folder is not empty")

    full_path.rmdir()

    db.query(EmptyFolder).filter(
        EmptyFolder.drive == drive,
        (EmptyFolder.path == path) | EmptyFolder.path.like(path + "/%"),
    ).delete(synchronize_session="fetch")
    db.commit()
