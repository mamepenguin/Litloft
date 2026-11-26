import concurrent.futures
import logging
import os
import re
import shutil
import unicodedata
from datetime import UTC, datetime
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

import app.config as config
from app.models import (
    Collection,
    CollectionItem,
    EmptyFolder,
    File,
    FileExif,
    active_file_filter,
)
from app.nanoid import generate_nanoid
from app.services.atomic_write import generating_file
from app.services.diskpath import existing_or_409, name_taken, new_or_409, resolve_on_disk
from app.services.heic import cleanup_heic_cache
from app.services.markdown_images import project_markdown_thumbnail
from app.services import inbox as inbox_service
from app.services.mtime import read_modified_at
from app.services import subtitle as subtitle_service
from app.services.subtitle import (
    FolderSidecars,
    SidecarCarry,
    delete_purged_sidecars_after_commit,
    is_subtitle_file,
    move_sidecar_subtitles,
    owner_stem,
    plan_sidecar_carry,
    same_content,
    sidecars_of_purged_row,
    stem_of,
)
from app.services.thumbnail import (
    prune_empty_dirs,
    remove_thumbnail_quietly,
    thumbnail_slot_rel,
)
from app.services.tagops import (
    cleanup_orphan_tags,
    project_frontmatter_tags,
    retarget_file_tags,
)
from app.services.origin import project_frontmatter_origin

logger = logging.getLogger(__name__)

FORBIDDEN_CHARS = set('<>:"/\\|?*\x00')
MAX_FILENAME_LENGTH = 255


def _is_markdown_file(file: File) -> bool:
    return file.mime_type == "text/markdown" or file.filename.lower().endswith(".md")


def _read_markdown_for_projection(path: Path) -> str | None:
    try:
        if path.stat().st_size > 1_000_000:
            return None
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None


def resolve_drive_path(drive_name: str) -> Path:
    if drive_name not in config.get_drive_names():
        raise HTTPException(status_code=404, detail=f"Drive not found: {drive_name}")
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
    filename = unicodedata.normalize("NFC", filename.strip())
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
    """Derive a display title from a filename, keeping the author's spelling.

    Only the underscore is treated as a separator: it stands in for a space the
    filesystem made awkward to type. A hyphen is a character someone chose, and
    is frequently load-bearing (`MacBook-Neo-review`, a Japanese compound), so
    it survives.

    Beyond raising the first letter, nothing recases the words. `str.title()`
    uppercases the letter after every non-alphabetic character and lowercases
    the rest of each word, which turns `charon's` into `Charon'S` and
    `MacBook` into `Macbook`.
    """
    stem = Path(filename).stem
    name = stem.replace("_", " ").strip()
    if not name:
        return stem
    return name[0].upper() + name[1:]


def untrack_empty_folder(db: Session, drive: str, folder_path: str) -> None:
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
        .filter(File.drive == drive, File.folder_path == folder_path, active_file_filter())
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
    full_path = resolve_on_disk(drive_path, folder_path)
    if full_path.exists() and full_path.is_dir():
        db.add(EmptyFolder(drive=drive, path=folder_path))


def resolve_db_path_conflict(db: Session, new_rel: str, drive: str) -> str | None:
    """Free the UNIQUE ``file_path`` slot at ``new_rel`` *within* ``drive``
    before a create / move / rename / upload writes that path.

    Otherwise a stale row would raise IntegrityError *after* the filesystem
    operation, leaving FS and DB inconsistent. Callers MUST have verified the
    destination does not exist on disk.

    Per record state:
      • Active → 409; the user must rescan and purge it deliberately.
      • Trashed → purge the ghost. The file its thumbnail pointer names is
        returned for the caller to remove once its own commit has succeeded, so
        a rollback leaves the ghost its picture.
      • Missing → retire its file_path to a placeholder, keeping the row
        (watch history, tags, comments) and its own thumbnail slot.
    """
    conflict = (
        db.query(File)
        .filter(File.drive == drive, File.file_path == new_rel)
        .first()
    )
    if conflict is None:
        return None
    if conflict.missing_since is None and conflict.deleted_at is None:
        raise HTTPException(
            status_code=409,
            detail=f"A database record already exists at '{new_rel}' (id={conflict.id})",
        )
    if conflict.deleted_at is not None:
        ghost_picture = conflict.thumbnail_path
        db.delete(conflict)
        db.flush()
        cleanup_orphan_tags(db, drive)
        return ghost_picture
    conflict.file_path = f"__missing_{conflict.id}_{new_rel}"
    db.flush()
    return None


def _rename_thumbnail_owner(db: Session, owner: File, thumb_rel: str) -> None:
    """Point ``owner`` at the JPEG just written. Its own commit, because the
    JPEG is a cache: a database error here must not take back a file that has
    already arrived."""
    try:
        owner.thumbnail_path = thumb_rel
        db.commit()
    except Exception:
        db.rollback()
        logger.warning("Wrote %s but could not record who owns it", thumb_rel)


def _copy_candidate_is_free(
    own,
    old_stem: str,
    candidate: str,
    dest_index: FolderSidecars,
    dest_stems: list[str],
) -> bool:
    new_stem = stem_of(candidate)
    stems_after = dest_stems + [new_stem]
    for sidecar in own:
        name = new_stem + sidecar.name[len(old_stem):]
        existing = dest_index.files.get(name)
        if existing is not None and not same_content(sidecar.path, existing):
            return False
        if owner_stem(name, stems_after) != new_stem:
            return False
    for other in dest_index.all():
        after = owner_stem(other.name, stems_after)
        if after is not None and after != other.stem:
            return False
    return True


def _resolve_copy_filename(
    target_dir: Path,
    original_filename: str,
    sidecar_ok=None,
) -> str:
    """Generate a unique filename for copy, adding _copy, _copy_2, etc. on collision."""

    def usable(candidate: str) -> bool:
        if name_taken(target_dir / candidate):
            return False
        return sidecar_ok is None or sidecar_ok(candidate)

    if usable(original_filename):
        return original_filename

    stem = Path(original_filename).stem
    ext = Path(original_filename).suffix

    candidate = f"{stem}_copy{ext}"
    if usable(candidate):
        return candidate

    counter = 2
    while counter <= 1000:
        candidate = f"{stem}_copy_{counter}{ext}"
        if usable(candidate):
            return candidate
        counter += 1
    raise HTTPException(status_code=409, detail="Too many copies of this file exist")


def _copy_sidecar_carries(
    own, old_stem: str, new_stem: str, target_dir: Path, dest_index: FolderSidecars
) -> list[SidecarCarry]:
    carries = []
    for sidecar in own:
        name = new_stem + sidecar.name[len(old_stem):]
        target = target_dir / name
        existing = dest_index.files.get(name)
        if target == sidecar.path:
            continue
        if existing is not None and same_content(sidecar.path, existing):
            continue
        carries.append(
            SidecarCarry(
                source=sidecar.path,
                target=target,
                target_name=name,
                mode="copy",
                language=sidecar.language,
            )
        )
    return carries


def copy_file(
    db: Session,
    file_id: str,
    target_drive: str | None,
    target_folder: str,
    sidecar_errors: list[str] | None = None,
) -> File:
    source = db.query(File).filter(File.id == file_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="File not found")

    src_drive = source.drive
    dst_drive = target_drive or src_drive
    target_folder = validate_path_safe(target_folder)

    src_drive_path = config.get_drive_path(src_drive)
    dst_drive_path = resolve_drive_path(dst_drive)

    old_full = existing_or_409(src_drive_path, source.file_path)
    if not old_full.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    target_dir = existing_or_409(dst_drive_path, target_folder) if target_folder else dst_drive_path
    validate_within_drive(target_dir, dst_drive_path)
    target_dir.mkdir(parents=True, exist_ok=True)

    own = (
        subtitle_service.own_sidecars(db, src_drive, source.folder_path, stem_of(source.filename))
        if _serves_subtitles(source)
        else []
    )
    old_stem = stem_of(source.filename)
    dest_index = FolderSidecars.load(db, dst_drive, target_folder)
    dest_stems = list(dest_index.stem_counts.elements())
    if own:
        new_filename = _resolve_copy_filename(
            target_dir,
            source.filename,
            lambda candidate: _copy_candidate_is_free(
                own, old_stem, candidate, dest_index, dest_stems
            ),
        )
    else:
        new_filename = _resolve_copy_filename(target_dir, source.filename)
    new_full = target_dir / new_filename
    validate_within_drive(new_full, dst_drive_path)
    sidecar_carries = _copy_sidecar_carries(
        own, old_stem, stem_of(new_filename), target_dir, dest_index
    )

    new_id = generate_nanoid()
    new_rel = f"{target_folder}/{new_filename}" if target_folder else new_filename

    new_thumb_rel = thumbnail_slot_rel(new_id)
    new_thumb = config.THUMBNAILS_DIR / new_thumb_rel
    # Markdown thumbnails are projections owned by the note ID, so they are
    # regenerated from the copy's own content instead of taking this slot.
    old_thumb = (
        config.THUMBNAILS_DIR / source.thumbnail_path
        if source.thumbnail_path and not _is_markdown_file(source)
        else None
    )
    fills_thumbnail_slot = old_thumb is not None and old_thumb.exists()

    # Free the UNIQUE file_path slot if a stale ghost holds it. Done BEFORE
    # creating the FS file so an active 409 conflict doesn't leave an orphan
    # file on disk. (_resolve_copy_filename only avoids FS collisions; a DB
    # ghost with no FS copy would otherwise pass that check and then blow up
    # at db.commit with an IntegrityError.)
    ghost_picture = resolve_db_path_conflict(db, new_rel, dst_drive)

    # Atomic copy: create exclusive target then copy content to prevent TOCTOU race
    projected_thumb: Path | None = None
    try:
        fd = os.open(str(new_full), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
        os.close(fd)
    except FileExistsError:
        raise HTTPException(status_code=409, detail="Target file already exists")
    # Everything from the exclusive create to the commit owns the file that
    # create just made: whatever fails in between, the destination goes back
    # to not existing. A copy left behind with no row would be indexed as a
    # second real file by the next scan.
    try:
        shutil.copy2(str(old_full), str(new_full))

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
            image_width=source.image_width,
            image_height=source.image_height,
            modified_at=read_modified_at(new_full),
            is_favorite=False,
            liked_at=None,
        )

        try:
            db.add(new_file)
            source_exif = db.get(FileExif, source.id)
            if source_exif is not None:
                db.add(
                    FileExif(
                        file_id=new_id,
                        datetime_original=source_exif.datetime_original,
                        make=source_exif.make,
                        model=source_exif.model,
                        f_number=source_exif.f_number,
                        exposure_time=source_exif.exposure_time,
                        iso_speed=source_exif.iso_speed,
                        focal_length=source_exif.focal_length,
                        gps_lat=source_exif.gps_lat,
                        gps_lon=source_exif.gps_lon,
                    )
                )
            if _is_markdown_file(new_file):
                content = _read_markdown_for_projection(new_full)
                if content is not None:
                    project_frontmatter_tags(db, new_file, content)
                    project_frontmatter_origin(db, new_file, content)
                    project_markdown_thumbnail(db, new_file, content)
                    if new_file.thumbnail_path:
                        projected_thumb = (
                            config.THUMBNAILS_DIR / new_file.thumbnail_path
                        )
            untrack_empty_folder(db, dst_drive, target_folder)
            db.commit()
        except Exception as exc:
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Copy failed (DB error, filesystem reversed): {exc}",
            ) from exc
    except Exception:
        try:
            new_full.unlink()
        except OSError:
            pass
        # A note's projection is keyed by the row id the rollback takes away, so
        # nothing could reclaim it afterwards.
        if projected_thumb is not None:
            try:
                projected_thumb.unlink()
                prune_empty_dirs(projected_thumb.parent, config.THUMBNAILS_DIR)
            except OSError:
                pass
        raise

    remove_thumbnail_quietly(ghost_picture)

    # A thumbnail is a cache the scanner can rebuild, so it is filled after the
    # row is durable and never inside the handler that reverses the filesystem:
    # a copy that arrived must not be undone because its picture did not. The
    # row names the JPEG only once the write has happened.
    if fills_thumbnail_slot:
        try:
            with generating_file(new_thumb) as staged_thumb:
                shutil.copy2(str(old_thumb), str(staged_thumb))
        except OSError:
            logger.warning("Copied %s but could not fill %s", new_rel, new_thumb_rel)
        else:
            _rename_thumbnail_owner(db, new_file, new_thumb_rel)

    db.refresh(new_file)
    if sidecar_errors is not None and sidecar_carries:
        sidecar_errors.extend(move_sidecar_subtitles(sidecar_carries))
    return new_file


def _serves_subtitles(file: File) -> bool:
    return file.file_type == "video" or file.mime_type == "application/vnd.litloft.loft+json"


def _sidecar_carry_plan(
    db: Session,
    file: File,
    old_full: Path,
    new_full: Path,
    dst_drive: str,
    dst_folder: str,
) -> list[SidecarCarry]:
    """Plan a video's own sidecars onto its destination, or refuse before it moves."""
    if not _serves_subtitles(file):
        return []
    old_stem = stem_of(old_full.name)
    new_stem = stem_of(new_full.name)
    src_index = FolderSidecars.load(db, file.drive, file.folder_path)
    own = src_index.own(old_stem)
    if not own:
        return []

    same_folder = dst_drive == file.drive and dst_folder == file.folder_path
    if same_folder:
        dest_index = src_index
        counts = src_index.stem_counts.copy()
        counts[old_stem] -= 1
        counts[new_stem] += 1
        dest_stems = list(counts.elements())
    else:
        dest_index = FolderSidecars.load(db, dst_drive, dst_folder)
        dest_stems = list(dest_index.stem_counts.elements()) + [new_stem]

    carries, conflicts = plan_sidecar_carry(
        own,
        old_stem,
        new_stem,
        new_full.parent,
        dest_index,
        dest_stems,
        dst_folder,
    )
    if conflicts:
        raise HTTPException(
            status_code=409,
            detail={
                "code": conflicts[0][0],
                "names": [name for _code, name in conflicts],
            },
        )
    return carries


def _carry_sidecars(carries: list[SidecarCarry]) -> list[str]:
    """Best effort: a failure here never undoes the video's own change."""
    return move_sidecar_subtitles(carries)


def rename_file(
    db: Session, file_id: str, new_filename: str,
    sidecar_errors: list[str] | None = None,
) -> File:
    file = db.query(File).filter(File.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    new_filename = validate_filename(new_filename)
    if is_subtitle_file(new_filename):
        raise HTTPException(
            status_code=400,
            detail={"code": "subtitle_extension_reserved", "names": []},
        )
    drive_path = resolve_drive_path(file.drive)

    # Capture pre-rename filename BEFORE mutation so we can
    # compute the old/new wiki-link stems after the rename commits.
    old_filename = file.filename
    old_drive = file.drive

    old_full = existing_or_409(drive_path, file.file_path)
    new_rel = f"{file.folder_path}/{new_filename}" if file.folder_path else new_filename
    new_full = new_or_409(drive_path, new_rel)
    validate_within_drive(new_full, drive_path)

    if name_taken(new_full):
        raise HTTPException(status_code=409, detail="File already exists")
    if not old_full.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    carries = _sidecar_carry_plan(
        db, file, old_full, new_full, file.drive, file.folder_path
    )

    ghost_picture = resolve_db_path_conflict(db, new_rel, file.drive)

    old_full.rename(new_full)

    try:
        file.filename = new_filename
        file.file_path = new_rel
        file.title = _filename_to_title(new_filename)
        db.commit()
    except Exception as exc:
        db.rollback()
        try:
            new_full.rename(old_full)
        except Exception:
            pass
        raise HTTPException(
            status_code=500,
            detail=f"Rename failed (DB error, filesystem reversed): {exc}",
        ) from exc

    remove_thumbnail_quietly(ghost_picture)
    failed = _carry_sidecars(carries)
    if sidecar_errors is not None:
        sidecar_errors.extend(failed)

    # Best-effort: a rewrite failure must NOT roll back the user-visible rename
    # (FS + DB row are already durable).
    if old_filename.lower().endswith(".md") and new_filename.lower().endswith(".md"):
        old_stem = Path(old_filename).stem
        new_stem = Path(new_filename).stem
        if old_stem != new_stem:
            try:
                import app.services.markdown_relations as markdown_relations
                markdown_relations.rewrite_basename_in_drive(
                    db, old_drive, old_stem, new_stem,
                    exclude_file_id=file.id,
                )
                db.commit()
            except Exception:
                db.rollback()
                logger.exception(
                    "rename: wiki rewrite failed for %s (%s → %s)",
                    file.id, old_stem, new_stem,
                )

    db.refresh(file)
    return file


def move_file(
    db: Session, file_id: str, target_drive: str | None, target_folder: str,
    sidecar_errors: list[str] | None = None,
) -> tuple[File, bool]:
    # A pure move preserves ``file.filename``, so the wiki-link basename never
    # changes and no rewrite hook is needed here.
    file = db.query(File).filter(File.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    src_drive = file.drive
    dst_drive = target_drive or src_drive
    target_folder = validate_path_safe(target_folder)

    src_drive_path = resolve_drive_path(src_drive)
    dst_drive_path = resolve_drive_path(dst_drive) if dst_drive != src_drive else src_drive_path

    old_full = existing_or_409(src_drive_path, file.file_path)
    new_rel = f"{target_folder}/{file.filename}" if target_folder else file.filename
    new_full = new_or_409(dst_drive_path, new_rel)
    validate_within_drive(new_full, dst_drive_path)

    if name_taken(new_full):
        raise HTTPException(status_code=409, detail="File already exists at target")
    if not old_full.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    carries = _sidecar_carry_plan(
        db, file, old_full, new_full, dst_drive, target_folder
    )

    ghost_picture = resolve_db_path_conflict(db, new_rel, dst_drive)

    new_full.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(old_full), str(new_full))

    inbox_changed = False
    try:
        old_drive = file.drive
        old_folder = file.folder_path
        if dst_drive == src_drive:
            inbox_changed = inbox_service.close(db, src_drive, file_id)
        else:
            inbox_changed = inbox_service.remove(db, src_drive, file_id)
        retarget_file_tags(db, file, old_drive, dst_drive)
        file.drive = dst_drive
        file.folder_path = target_folder
        file.file_path = new_rel
        if dst_drive != src_drive:
            db.query(CollectionItem).filter(
                CollectionItem.file_id == file.id,
                CollectionItem.collection_id.in_(
                    db.query(Collection.id).filter(Collection.drive != dst_drive)
                ),
            ).delete(synchronize_session=False)
        if _is_markdown_file(file):
            content = _read_markdown_for_projection(new_full)
            if content is not None:
                project_markdown_thumbnail(db, file, content)
        untrack_empty_folder(db, dst_drive, target_folder)
        db.flush()
        _ensure_empty_folder_tracked(db, old_drive, old_folder)
        db.commit()
    except Exception as exc:
        db.rollback()
        try:
            shutil.move(str(new_full), str(old_full))
        except Exception:
            pass  # If the FS reverse also fails we can't do better here
        raise HTTPException(
            status_code=500,
            detail=f"Move failed (DB error, filesystem reversed): {exc}",
        ) from exc

    remove_thumbnail_quietly(ghost_picture)
    failed = _carry_sidecars(carries)
    if sidecar_errors is not None:
        sidecar_errors.extend(failed)

    db.refresh(file)
    return file, inbox_changed


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
) -> list[str]:
    """Move all file/empty-folder/pin records under ``old_path`` to ``new_path``."""
    old_prefix = old_path + "/"
    old_len = len(old_path)

    affected_ids = [
        row[0]
        for row in db.execute(
            text("""
                SELECT id FROM files
                WHERE drive = :drive
                AND (folder_path = :old_path OR folder_path LIKE :old_prefix)
            """),
            {
                "drive": drive,
                "old_path": old_path,
                "old_prefix": old_prefix + "%",
            },
        ).fetchall()
    ]

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

    _update_pinned_folders(db, drive, old_path, old_prefix, new_path, old_len)

    return affected_ids


def move_folder(drive: str, path: str, target_path: str, db: Session) -> dict:
    path = validate_path_safe(path)
    target_path = validate_path_safe(target_path)
    if not path:
        raise HTTPException(status_code=400, detail="Cannot move drive root")

    folder_name = Path(path).name

    if target_path == path or target_path.startswith(path + "/"):
        raise HTTPException(status_code=400, detail="Cannot move folder into itself")

    new_path = f"{target_path}/{folder_name}" if target_path else folder_name
    if new_path == path:
        raise HTTPException(status_code=400, detail="Folder is already in this location")

    drive_path = resolve_drive_path(drive)
    old_full = existing_or_409(drive_path, path)
    validate_within_drive(old_full, drive_path)

    if not old_full.exists() or not old_full.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")

    new_full = new_or_409(drive_path, new_path)
    validate_within_drive(new_full, drive_path)

    if name_taken(new_full):
        raise HTTPException(status_code=409, detail="Target folder already exists")

    new_full.parent.mkdir(parents=True, exist_ok=True)

    # Filesystem move first
    old_full.rename(new_full)

    affected_ids = _update_folder_paths(db, drive, path, new_path)

    db.commit()

    file_count = (
        db.query(File)
        .filter(File.drive == drive, File.folder_path == new_path)
        .count()
    )
    return {
        "name": folder_name,
        "path": new_path,
        "file_count": file_count,
        # No `kind_counts`: the schema default (`{}`) stands. Classifying
        # kinds needs the listing endpoint's roll-up, and this response is
        # discarded by every caller — the UI refetches the folder row.
        # `file_count` here is direct children only, for the same reason.
        "file_ids": affected_ids,
    }


def physical_delete(db: Session, file: File) -> None:
    """Remove file from filesystem, caches, and DB. Caller must commit."""
    drive_path = config.get_drive_path(file.drive)
    full_path = existing_or_409(drive_path, file.file_path)

    # A leftover subtitle row never owns the bytes at its path: the sidecar
    # belongs to the video beside it, and purging the row must not delete it.
    if not is_subtitle_file(file.filename):
        if full_path.exists():
            full_path.unlink()
        cleanup_heic_cache(str(full_path.resolve()), config.CONVERTED_DIR)

    if file.thumbnail_path:
        thumb = config.THUMBNAILS_DIR / file.thumbnail_path
        if thumb.exists():
            thumb.unlink()
            prune_empty_dirs(thumb.parent, config.THUMBNAILS_DIR)

    drive = file.drive
    folder_path = file.folder_path
    db.delete(file)
    db.flush()
    cleanup_orphan_tags(db, drive)
    _ensure_empty_folder_tracked(db, drive, folder_path)


def delete_file(db: Session, file_id: str) -> bool:
    """Soft delete: set deleted_at, keep file on disk.

    Missing files cannot be moved to trash (the file is not on disk to
    begin with). Callers should purge them directly instead.
    """
    file = db.query(File).filter(File.id == file_id, active_file_filter()).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    resolve_drive_path(file.drive)
    file.deleted_at = datetime.now(UTC)
    drive = file.drive
    folder_path = file.folder_path
    closed = inbox_service.close(db, drive, file_id)
    db.flush()
    _ensure_empty_folder_tracked(db, drive, folder_path)
    db.commit()
    return closed


def restore_file(db: Session, file_id: str) -> File:
    """Restore a file from trash: clear deleted_at."""
    file = db.query(File).filter(File.id == file_id, File.deleted_at.isnot(None)).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found in trash")

    drive_path = config.get_drive_path(file.drive)
    full_path = existing_or_409(drive_path, file.file_path)
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File no longer exists on disk")

    file.deleted_at = None
    # Defensive: ensure mutual exclusion with missing_since. Under normal
    # flows a trashed file can never also be missing, but this safety net
    # prevents a future bug or out-of-band DB edit from leaving the file
    # invisible after restore.
    file.missing_since = None
    untrack_empty_folder(db, file.drive, file.folder_path)
    db.commit()
    db.refresh(file)
    return file


def purge_file(db: Session, file_id: str) -> None:
    """Permanently delete a trashed file from disk and DB."""
    file = db.query(File).filter(File.id == file_id, File.deleted_at.isnot(None)).first()
    if not file:
        raise HTTPException(status_code=404, detail="File not found in trash")

    resolve_drive_path(file.drive)
    sidecars = sidecars_of_purged_row(db, file)
    physical_delete(db, file)
    db.commit()
    delete_purged_sidecars_after_commit(db, sidecars)


def purge_all_trash(db: Session, drive: str) -> list[str]:
    """Permanently delete all trashed files for a drive. Returns purged file IDs."""
    resolve_drive_path(drive)
    trashed = (
        db.query(File)
        .filter(File.drive == drive, File.deleted_at.isnot(None))
        .all()
    )
    purged_ids = []
    sidecars = []
    for file in trashed:
        purged_ids.append(file.id)
        sidecars.append(sidecars_of_purged_row(db, file))
        physical_delete(db, file)
    db.commit()
    for plan in sidecars:
        delete_purged_sidecars_after_commit(db, plan)
    return purged_ids


def purge_missing_file(db: Session, file_id: str) -> None:
    """Permanently delete a missing file from DB. The on-disk file is
    already absent by definition. Thumbnail (if any) is also removed."""
    file = (
        db.query(File)
        .filter(
            File.id == file_id,
            File.missing_since.isnot(None),
            File.deleted_at.is_(None),
        )
        .first()
    )
    if not file:
        raise HTTPException(status_code=404, detail="File not found in missing")

    resolve_drive_path(file.drive)
    physical_delete(db, file)
    db.commit()


_PURGE_ALL_MISSING_BATCH_SIZE = 200


def purge_all_missing(db: Session, drive: str) -> list[str]:
    """Permanently delete all missing files for a drive.

    Returns a list of purged file IDs (may be empty). Processes in
    batches of ``_PURGE_ALL_MISSING_BATCH_SIZE`` so each commit releases
    the SQLite write lock and keeps the operation interruptible.

    Each batch is committed as a unit; if a batch raises, earlier
    batches remain purged and the failure is re-raised.
    """
    resolve_drive_path(drive)
    purged_ids: list[str] = []
    while True:
        batch = (
            db.query(File)
            .filter(
                File.drive == drive,
                File.missing_since.isnot(None),
                File.deleted_at.is_(None),
            )
            .limit(_PURGE_ALL_MISSING_BATCH_SIZE)
            .all()
        )
        if not batch:
            break
        for file in batch:
            purged_ids.append(file.id)
            physical_delete(db, file)
        db.commit()
    return purged_ids


def create_folder(drive: str, parent_path: str, name: str, db: Session) -> dict:
    name = validate_filename(name)
    parent_path = validate_path_safe(parent_path)
    drive_path = resolve_drive_path(drive)

    folder_path = f"{parent_path}/{name}" if parent_path else name
    full_path = new_or_409(drive_path, folder_path)
    validate_within_drive(full_path, drive_path)

    if name_taken(full_path):
        raise HTTPException(status_code=409, detail="Folder already exists")

    full_path.mkdir(parents=True)

    ef = EmptyFolder(drive=drive, path=folder_path)
    db.add(ef)
    db.commit()

    return {"name": name, "path": folder_path, "file_count": 0, "kind_counts": {}}


def rename_folder(drive: str, path: str, new_name: str, db: Session) -> dict:
    path = validate_path_safe(path)
    new_name = validate_filename(new_name)
    if not path:
        raise HTTPException(status_code=400, detail="Cannot rename drive root")

    drive_path = resolve_drive_path(drive)
    old_full = existing_or_409(drive_path, path)
    validate_within_drive(old_full, drive_path)

    if not old_full.exists() or not old_full.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")

    parent = str(Path(path).parent)
    new_path = f"{parent}/{new_name}" if parent != "." else new_name
    new_full = new_or_409(drive_path, new_path)
    validate_within_drive(new_full, drive_path)

    if name_taken(new_full):
        raise HTTPException(status_code=409, detail="Target folder already exists")

    old_full.rename(new_full)

    affected_ids = _update_folder_paths(db, drive, path, new_path)

    db.commit()

    file_count = (
        db.query(File)
        .filter(File.drive == drive, File.folder_path == new_path)
        .count()
    )
    return {
        "name": new_name,
        "path": new_path,
        "file_count": file_count,
        # No `kind_counts`: the schema default (`{}`) stands. Classifying
        # kinds needs the listing endpoint's roll-up, and this response is
        # discarded by every caller — the UI refetches the folder row.
        # `file_count` here is direct children only, for the same reason.
        "file_ids": affected_ids,
    }


def delete_folder(drive: str, path: str, db: Session) -> bool:
    path = validate_path_safe(path)
    if not path:
        raise HTTPException(status_code=400, detail="Cannot delete drive root")

    drive_path = resolve_drive_path(drive)
    full_path = existing_or_409(drive_path, path)
    validate_within_drive(full_path, drive_path)

    if not full_path.exists() or not full_path.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")

    now = datetime.now(UTC)
    folder_condition = (File.folder_path == path) | File.folder_path.like(path + "/%")
    affected_ids = [
        row[0]
        for row in db.query(File.id)
        .filter(File.drive == drive, active_file_filter(), folder_condition)
        .all()
    ]
    # Only active files (not trashed, not missing) get soft-deleted.
    # Missing files stay as-is; they already have no on-disk presence
    # and must be purged individually from the Missing view.
    db.query(File).filter(
        File.drive == drive,
        active_file_filter(),
        folder_condition,
    ).update({"deleted_at": now}, synchronize_session="fetch")

    closed = inbox_service.close_files(db, drive, affected_ids, now=now)

    db.query(EmptyFolder).filter(
        EmptyFolder.drive == drive,
        (EmptyFolder.path == path) | EmptyFolder.path.like(path + "/%"),
    ).delete(synchronize_session="fetch")
    db.commit()
    return closed


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


def _fold_name(name: str) -> str:
    return unicodedata.normalize("NFC", name).lower()


def _validate_no_duplicates(
    db: Session, rename_plan: list[tuple[File, str]], drive_path: Path
) -> list[SidecarCarry]:
    new_names = [name for _, name in rename_plan]
    seen: set[str] = set()
    for name in new_names:
        lower = name.lower()
        if lower in seen:
            raise HTTPException(
                status_code=409, detail=f"Duplicate filename in batch: {name}"
            )
        seen.add(lower)

    # Replays the renames in the order batch_rename runs them, so a name freed
    # by an earlier rename may be taken by a later one, and nothing is ever
    # renamed onto a file that is still there.
    sims: dict[str, FolderSidecars] = {}
    folders: dict[str, Path] = {}
    carries: list[SidecarCarry] = []
    conflicts: list[tuple[str, str]] = []
    for file, new_name in rename_plan:
        folder_key = unicodedata.normalize("NFC", file.folder_path or "")
        if folder_key not in sims:
            folder_dir = (
                existing_or_409(drive_path, file.folder_path) if file.folder_path else drive_path
            )
            folders[folder_key] = folder_dir
            entries = (
                [
                    (item, unicodedata.normalize("NFC", item.name))
                    for item in folder_dir.iterdir()
                    if item.is_file()
                ]
                if folder_dir.exists()
                else []
            )
            sims[folder_key] = FolderSidecars(
                subtitle_service.serving_stems(db, file.drive, file.folder_path),
                entries,
            )
        sim = sims[folder_key]
        held = sim.all_names
        old, new = _fold_name(file.filename), _fold_name(new_name)
        if new == old:
            continue
        if new in held:
            raise HTTPException(
                status_code=409,
                detail=f"File already exists: {new_name}",
            )
        held.discard(old)
        held.add(new)

        old_stem = stem_of(file.filename)
        new_stem = stem_of(new_name)
        own = sim.own(old_stem)
        if not own:
            continue
        counts = sim.stem_counts.copy()
        counts[old_stem] -= 1
        counts[new_stem] += 1
        step_carries, step_conflicts = plan_sidecar_carry(
            own,
            old_stem,
            new_stem,
            folders[folder_key],
            sim,
            list(counts.elements()),
            file.folder_path,
        )
        conflicts.extend(step_conflicts)
        if not step_conflicts:
            sim.apply(own, step_carries, old_stem, new_stem)
            carries.extend(step_carries)

    if conflicts:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "subtitle_conflict",
                "names": [name for _code, name in conflicts],
            },
        )
    return carries


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
    sidecar_errors: list[str] | None = None,
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
    drive_path = resolve_drive_path(first_drive)

    rename_plan: list[tuple[File, str]] = []
    for i, file in enumerate(files):
        index = kwargs.get("start_number", 1) + i
        new_name = _compute_new_filename(file, mode, index, **kwargs)
        new_name = validate_filename(new_name)
        if is_subtitle_file(new_name):
            raise HTTPException(
                status_code=400,
                detail={"code": "subtitle_extension_reserved", "names": []},
            )
        rename_plan.append((file, new_name))

    carries = _validate_no_duplicates(db, rename_plan, drive_path)

    completed_fs: list[tuple[Path, Path]] = []
    results: list[dict] = []
    try:
        for file, new_name in rename_plan:
            old_name = file.filename
            if new_name == old_name:
                results.append({"id": file.id, "old_name": old_name, "new_name": new_name})
                continue

            old_full = existing_or_409(drive_path, file.file_path)
            new_rel = (
                f"{file.folder_path}/{new_name}" if file.folder_path else new_name
            )
            new_full = new_or_409(drive_path, new_rel)
            validate_within_drive(new_full, drive_path)

            if not old_full.exists():
                raise HTTPException(status_code=404, detail=f"File not found on disk: {old_name}")

            old_full.rename(new_full)
            completed_fs.append((new_full, old_full))

            _update_file_after_rename(file, new_name, new_rel, drive_path)
            # The (drive, file_path) UNIQUE check has to see the rows change in
            # the same order the files moved, not in primary-key order.
            db.flush()
            results.append({"id": file.id, "old_name": old_name, "new_name": new_name})

        db.commit()
    except Exception:
        _rollback_fs_renames(completed_fs)
        db.rollback()
        raise

    _carry_batch_sidecars(carries, sidecar_errors)
    return results


def _carry_batch_sidecars(
    carries: list[SidecarCarry], sidecar_errors: list[str] | None
) -> None:
    if not carries:
        return
    failed = move_sidecar_subtitles(carries)
    if sidecar_errors is not None:
        sidecar_errors.extend(failed)


def _update_file_after_rename(
    file: File, new_name: str, new_rel: str, drive_path: Path
) -> None:
    file.filename = new_name
    file.file_path = new_rel
    file.title = _filename_to_title(new_name)
