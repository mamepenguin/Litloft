import concurrent.futures
import logging
import os
import re
import shutil
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

import app.config as config
from app.models import EmptyFolder, File
from app.nanoid import generate_nanoid
from app.services.heic import cleanup_heic_cache

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


def _ensure_empty_folder_tracked(db: Session, drive: str, folder_path: str) -> None:
    """If a folder has no more files in DB but exists on disk, track it as EmptyFolder."""
    if not folder_path:
        return
    has_files = (
        db.query(File.id)
        .filter(File.drive == drive, File.folder_path == folder_path)
        .first()
    )
    if has_files:
        return
    already_tracked = (
        db.query(EmptyFolder)
        .filter(EmptyFolder.drive == drive, EmptyFolder.path == folder_path)
        .first()
    )
    if already_tracked:
        return
    drive_path = config.get_drive_path(drive)
    full_path = drive_path / folder_path
    if full_path.exists() and full_path.is_dir():
        db.add(EmptyFolder(drive=drive, path=folder_path))


def _resolve_copy_filename(target_dir: Path, original_filename: str) -> str:
    """Generate a unique filename for copy, adding _copy, _copy_2, etc. on collision."""
    if not (target_dir / original_filename).exists():
        return original_filename

    stem = Path(original_filename).stem
    ext = Path(original_filename).suffix

    candidate = f"{stem}_copy{ext}"
    if not (target_dir / candidate).exists():
        return candidate

    counter = 2
    while counter <= 1000:
        candidate = f"{stem}_copy_{counter}{ext}"
        if not (target_dir / candidate).exists():
            return candidate
        counter += 1
    raise HTTPException(status_code=409, detail="Too many copies of this file exist")


def copy_file(db: Session, file_id: str, target_drive: str | None, target_folder: str) -> File:
    source = db.query(File).filter(File.id == file_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="File not found")

    src_drive = source.drive
    dst_drive = target_drive or src_drive
    target_folder = validate_path_safe(target_folder)

    src_drive_path = config.get_drive_path(src_drive)
    dst_drive_path = validate_writable(dst_drive)

    old_full = src_drive_path / source.file_path
    if not old_full.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    target_dir = dst_drive_path / target_folder if target_folder else dst_drive_path
    validate_within_drive(target_dir, dst_drive_path)
    target_dir.mkdir(parents=True, exist_ok=True)

    new_filename = _resolve_copy_filename(target_dir, source.filename)
    new_full = target_dir / new_filename
    validate_within_drive(new_full, dst_drive_path)

    # Atomic copy: create exclusive target then copy content to prevent TOCTOU race
    try:
        fd = os.open(str(new_full), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
        os.close(fd)
    except FileExistsError:
        raise HTTPException(status_code=409, detail="Target file already exists")
    shutil.copy2(str(old_full), str(new_full))

    new_id = generate_nanoid()
    new_rel = f"{target_folder}/{new_filename}" if target_folder else new_filename

    new_file = File(
        id=new_id,
        filename=new_filename,
        title=_filename_to_title(new_filename),
        description=source.description,
        drive=dst_drive,
        folder_path=target_folder,
        file_path=new_rel,
        file_size=source.file_size,
        file_type=source.file_type,
        mime_type=source.mime_type,
        duration=source.duration,
        likes=0,
        is_favorite=False,
    )

    # Copy thumbnail if it exists
    if source.thumbnail_path:
        old_thumb = config.THUMBNAILS_DIR / source.thumbnail_path
        if old_thumb.exists():
            new_stem = Path(new_filename).stem
            new_thumb_rel = (
                f"{dst_drive}/{target_folder}/{new_stem}.jpg"
                if target_folder
                else f"{dst_drive}/{new_stem}.jpg"
            )
            new_thumb = config.THUMBNAILS_DIR / new_thumb_rel
            new_thumb.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(old_thumb), str(new_thumb))
            new_file.thumbnail_path = new_thumb_rel

    # Copy preview spritesheet if it exists
    old_preview = config.PREVIEWS_DIR / f"{source.id}.jpg"
    if old_preview.exists():
        config.PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)
        new_preview = config.PREVIEWS_DIR / f"{new_id}.jpg"
        shutil.copy2(str(old_preview), str(new_preview))

    db.add(new_file)
    remove_empty_folder_if_has_files(db, dst_drive, target_folder)
    db.commit()
    db.refresh(new_file)
    return new_file


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

    old_drive = file.drive
    old_folder = file.folder_path
    file.drive = dst_drive
    file.folder_path = target_folder
    file.file_path = new_rel
    remove_empty_folder_if_has_files(db, dst_drive, target_folder)
    db.flush()
    _ensure_empty_folder_tracked(db, old_drive, old_folder)
    db.commit()
    db.refresh(file)
    return file


def _update_pinned_folders(
    db: Session, drive: str, old_path: str, old_prefix: str, new_path: str, old_len: int
) -> None:
    db.execute(
        text("""
            UPDATE pinned_folders
            SET path = :new_path || substr(path, :old_len + 1)
            WHERE drive = :drive
            AND (path = :old_path OR path LIKE :old_prefix)
        """),
        {
            "new_path": new_path,
            "old_len": old_len,
            "drive": drive,
            "old_path": old_path,
            "old_prefix": old_prefix + "%",
        },
    )


def _update_folder_paths(
    db: Session, drive: str, old_path: str, new_path: str
) -> None:
    old_prefix = old_path + "/"
    old_len = len(old_path)

    # Update file records
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
            "old_path": old_path,
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
            "old_path": old_path,
            "old_prefix": old_prefix + "%",
        },
    )

    # Update PinnedFolder records
    _update_pinned_folders(db, drive, old_path, old_prefix, new_path, old_len)


def move_folder(drive: str, path: str, target_path: str, db: Session) -> dict:
    path = validate_path_safe(path)
    target_path = validate_path_safe(target_path)
    if not path:
        raise HTTPException(status_code=400, detail="Cannot move drive root")

    folder_name = Path(path).name

    # Self-reference loop detection
    if target_path == path or target_path.startswith(path + "/"):
        raise HTTPException(status_code=400, detail="Cannot move folder into itself")

    # Compute new path
    new_path = f"{target_path}/{folder_name}" if target_path else folder_name
    if new_path == path:
        raise HTTPException(status_code=400, detail="Folder is already in this location")

    drive_path = validate_writable(drive)
    old_full = drive_path / path
    validate_within_drive(old_full, drive_path)

    if not old_full.exists() or not old_full.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")

    new_full = drive_path / new_path
    validate_within_drive(new_full, drive_path)

    if new_full.exists():
        raise HTTPException(status_code=409, detail="Target folder already exists")

    # Ensure target parent exists
    new_full.parent.mkdir(parents=True, exist_ok=True)

    # Filesystem move first
    old_full.rename(new_full)

    # Update all DB records
    _update_folder_paths(db, drive, path, new_path)

    db.commit()

    file_count = (
        db.query(File)
        .filter(File.drive == drive, File.folder_path == new_path)
        .count()
    )
    return {"name": folder_name, "path": new_path, "file_count": file_count, "thumbnail_file_id": None}


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

    cleanup_heic_cache(str(full_path.resolve()), config.CONVERTED_DIR)

    preview_path = config.PREVIEWS_DIR / f"{file.id}.jpg"
    if preview_path.exists():
        preview_path.unlink()

    drive = file.drive
    folder_path = file.folder_path
    db.delete(file)
    db.flush()
    _ensure_empty_folder_tracked(db, drive, folder_path)
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

    _update_folder_paths(db, drive, path, new_path)

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


def _compute_new_stem_template(
    template: str, original_stem: str, index: int, zero_pad: int
) -> str:
    number_str = str(index).zfill(zero_pad)
    result = template.replace("{original}", original_stem)
    return result.replace("{n}", number_str)


_REGEX_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=2)
_REGEX_TIMEOUT_SECONDS = 2


def _compute_new_stem_regex(stem: str, pattern: str, replacement: str) -> str:
    try:
        compiled = re.compile(pattern)
    except re.error as e:
        raise HTTPException(status_code=400, detail=f"Invalid regex: {e}")
    future = _REGEX_EXECUTOR.submit(compiled.sub, replacement, stem)
    try:
        return future.result(timeout=_REGEX_TIMEOUT_SECONDS)
    except concurrent.futures.TimeoutError:
        future.cancel()
        raise HTTPException(
            status_code=400,
            detail="Regex pattern too complex (execution timed out)",
        )


def _compute_new_stem_prefix_suffix(stem: str, action: str, value: str) -> str:
    if action == "add_prefix":
        return value + stem
    if action == "add_suffix":
        return stem + value
    if action == "remove_prefix":
        return stem[len(value):] if stem.startswith(value) else stem
    if action == "remove_suffix":
        return stem[: -len(value)] if stem.endswith(value) else stem
    raise HTTPException(status_code=400, detail=f"Unknown action: {action}")


def _compute_new_filename(file: File, mode: str, index: int, **kwargs) -> str:
    stem = Path(file.filename).stem
    ext = Path(file.filename).suffix

    if mode == "template":
        new_stem = _compute_new_stem_template(
            kwargs["template"], stem, index, kwargs["zero_pad"]
        )
    elif mode == "regex":
        new_stem = _compute_new_stem_regex(
            stem, kwargs["pattern"], kwargs["replacement"]
        )
    else:
        new_stem = _compute_new_stem_prefix_suffix(
            stem, kwargs["action"], kwargs["value"]
        )

    return new_stem + ext


def _validate_no_duplicates(rename_plan: list[tuple[File, str]], drive_path: Path) -> None:
    new_names = [name for _, name in rename_plan]
    seen: set[str] = set()
    for name in new_names:
        lower = name.lower()
        if lower in seen:
            raise HTTPException(
                status_code=409, detail=f"Duplicate filename in batch: {name}"
            )
        seen.add(lower)

    ids_in_batch = {f.id for f, _ in rename_plan}
    for file, new_name in rename_plan:
        if new_name == file.filename:
            continue
        folder_dir = drive_path / file.folder_path if file.folder_path else drive_path
        siblings = (
            (folder_dir / p.name)
            for p in folder_dir.iterdir()
            if p.is_file()
        ) if folder_dir.exists() else iter([])
        for sibling_path in siblings:
            sibling_name = sibling_path.name
            if sibling_name.lower() == new_name.lower():
                is_self = any(
                    f.filename == sibling_name and f.id in ids_in_batch
                    for f, _ in rename_plan
                )
                if not is_self:
                    raise HTTPException(
                        status_code=409,
                        detail=f"File already exists: {new_name}",
                    )


def _rollback_fs_renames(completed: list[tuple[Path, Path]]) -> None:
    for new_path, old_path in reversed(completed):
        try:
            new_path.rename(old_path)
        except OSError:
            pass


def batch_rename(
    db: Session,
    files: list[File],
    mode: str,
    **kwargs,
) -> list[dict]:
    if not files:
        return []

    first_drive = files[0].drive
    for file in files:
        if file.drive != first_drive:
            raise HTTPException(
                status_code=400,
                detail="All files must belong to the same drive",
            )
    drive_path = validate_writable(first_drive)

    rename_plan: list[tuple[File, str]] = []
    for i, file in enumerate(files):
        index = kwargs.get("start_number", 1) + i
        new_name = _compute_new_filename(file, mode, index, **kwargs)
        new_name = validate_filename(new_name)
        rename_plan.append((file, new_name))

    _validate_no_duplicates(rename_plan, drive_path)

    completed_fs: list[tuple[Path, Path]] = []
    results: list[dict] = []
    try:
        for file, new_name in rename_plan:
            old_name = file.filename
            if new_name == old_name:
                results.append({"id": file.id, "old_name": old_name, "new_name": new_name})
                continue

            old_full = drive_path / file.file_path
            new_rel = (
                f"{file.folder_path}/{new_name}" if file.folder_path else new_name
            )
            new_full = drive_path / new_rel
            validate_within_drive(new_full, drive_path)

            if not old_full.exists():
                raise HTTPException(status_code=404, detail=f"File not found on disk: {old_name}")

            old_full.rename(new_full)
            completed_fs.append((new_full, old_full))

            _update_file_after_rename(file, new_name, new_rel, drive_path)
            results.append({"id": file.id, "old_name": old_name, "new_name": new_name})

        db.commit()
    except Exception:
        _rollback_fs_renames(completed_fs)
        db.rollback()
        raise

    return results


def _update_file_after_rename(
    file: File, new_name: str, new_rel: str, drive_path: Path
) -> None:
    if file.file_type == "video" and file.thumbnail_path:
        new_stem = Path(new_name).stem
        new_thumb_rel = (
            f"{file.drive}/{file.folder_path}/{new_stem}.jpg"
            if file.folder_path
            else f"{file.drive}/{new_stem}.jpg"
        )
        _move_thumbnail(file, new_thumb_rel)
        file.thumbnail_path = new_thumb_rel

    file.filename = new_name
    file.file_path = new_rel
    file.title = _filename_to_title(new_name)
