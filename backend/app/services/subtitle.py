"""Subtitle sidecars: ownership, listing, carries and SRT-to-VTT conversion."""

import logging
import re
import shutil
import unicodedata
from collections import Counter
from dataclasses import dataclass, replace
from pathlib import Path

from fastapi import HTTPException

from app.models import File
from app.services.atomic_write import replace_file_contents
from app.services.diskpath import resolve_on_disk
from app.services.filetype import classify

logger = logging.getLogger(__name__)

SIDECAR_EXTENSIONS = frozenset({".srt", ".vtt"})
SIDECAR_MAX_BYTES = 5 * 1024 * 1024
LOFT_MIME = "application/vnd.litloft.loft+json"

# Common language codes (ISO 639-1 subset)
_LANG_NAMES = {
    "ja": "Japanese",
    "en": "English",
    "zh": "Chinese",
    "ko": "Korean",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "pt": "Portuguese",
    "it": "Italian",
    "ru": "Russian",
    "ar": "Arabic",
    "th": "Thai",
    "vi": "Vietnamese",
    "jpn": "Japanese",
    "eng": "English",
    "chi": "Chinese",
    "kor": "Korean",
}

# A track named with either spelling is the same language: the picker offers
# the two-letter code only, while files on disk may carry the three-letter one.
_SAME_LANGUAGE = {"jpn": "ja", "eng": "en", "chi": "zh", "kor": "ko"}

_LANGUAGE_CODE = re.compile(r"^[a-z]{2,3}$")
_LANGUAGE_SUFFIX = re.compile(r"^(.*)\.([A-Za-z]{2,3})$")


def is_subtitle_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in SIDECAR_EXTENSIONS


def nfc(text: str) -> str:
    return unicodedata.normalize("NFC", text)


def stem_of(filename: str) -> str:
    return nfc(Path(filename).stem)


def is_language_code(code: str) -> bool:
    return bool(_LANGUAGE_CODE.match(code))


def language_key(code: str) -> str:
    lowered = code.lower()
    return _SAME_LANGUAGE.get(lowered, lowered)


def generate_language(code: str) -> str:
    """Lower-case a language code; raise 400 when it is not 2 or 3 ASCII letters."""
    lowered = code.strip().lower()
    if lowered and not is_language_code(lowered):
        raise HTTPException(
            status_code=400, detail={"code": "subtitle_language", "names": []}
        )
    return lowered


def serves_subtitles(file: File) -> bool:
    return file.file_type == "video" or file.mime_type == LOFT_MIME


def _is_retired(file: File) -> bool:
    return (file.file_path or "").startswith("__missing_")


def serves_subtitles_name(filename: str) -> bool:
    file_type, mime_type = classify(filename)
    return file_type == "video" or mime_type == LOFT_MIME


def _candidate_stems(name: str) -> list[tuple[str, str]]:
    """(stem, language) a sidecar name may belong to, longest stem first."""
    suffix = Path(name).suffix
    if suffix.lower() not in SIDECAR_EXTENSIONS:
        return []
    base = nfc(name[: -len(suffix)])
    candidates = [(base, "")]
    match = _LANGUAGE_SUFFIX.match(base)
    if match and match.group(1):
        candidates.append((nfc(match.group(1)), match.group(2).lower()))
    return candidates


def owner_stem(name: str, stems: list[str]) -> str | None:
    """The longest serving stem under which ``name`` is a sidecar name."""
    counts = set(stems)
    for stem, _language in _candidate_stems(name):
        if stem in counts:
            return stem
    return None


@dataclass(frozen=True)
class Sidecar:
    name: str
    path: Path
    stem: str
    language: str
    owners: int

    @property
    def format(self) -> str:
        return Path(self.name).suffix.lower().lstrip(".")

    @property
    def label(self) -> str:
        return _LANG_NAMES.get(
            self.language, self.language.upper() if self.language else ""
        )


def _list_sidecar_entries(directory: Path) -> list[tuple[Path, str]]:
    try:
        return [
            (item, unicodedata.normalize("NFC", item.name))
            for item in directory.iterdir()
            if item.is_file()
        ]
    except OSError:
        return []


class FolderSidecars:
    """The sidecars of one folder and the serving stems that own them."""

    def __init__(
        self, stems: list[str], entries: list[tuple[Path, str]]
    ) -> None:
        self.stem_counts: Counter[str] = Counter(nfc(stem) for stem in stems)
        self.all_names: set[str] = {name.lower() for _path, name in entries}
        self.files: dict[str, Path] = {name: path for path, name in entries}
        self.by_name: dict[str, Sidecar] = {}
        for path, name in entries:
            for stem, language in _candidate_stems(name):
                if stem in self.stem_counts:
                    self.by_name[name] = Sidecar(
                        name=name,
                        path=path,
                        stem=stem,
                        language=language,
                        owners=self.stem_counts[stem],
                    )
                    break

    @classmethod
    def load(cls, db, drive: str, folder_path: str) -> "FolderSidecars":
        import app.config as config

        drive_path = config.get_drive_path(drive)
        directory = (
            resolve_on_disk(drive_path, folder_path)
            if folder_path
            else drive_path
        )
        return cls(serving_stems(db, drive, folder_path), _list_sidecar_entries(directory))

    def own(self, stem: str) -> list[Sidecar]:
        wanted = nfc(stem)
        owned = [sc for sc in self.by_name.values() if sc.stem == wanted]
        return sorted(
            owned, key=lambda sc: (sc.language != "", sc.language, sc.name)
        )

    def all(self) -> list[Sidecar]:
        return sorted(self.by_name.values(), key=lambda sc: sc.name)

    def apply(
        self, own: list[Sidecar], carried: list["SidecarCarry"],
        old_stem: str, new_stem: str,
    ) -> None:
        """Record a planned step so later steps see the names it frees and takes."""
        copied = {c.source for c in carried if c.mode == "copy"}
        for sidecar in own:
            if sidecar.path in copied:
                continue
            self.by_name.pop(sidecar.name, None)
            self.files.pop(sidecar.name, None)
        if nfc(old_stem) != nfc(new_stem):
            self.stem_counts[nfc(old_stem)] -= 1
            if self.stem_counts[nfc(old_stem)] <= 0:
                del self.stem_counts[nfc(old_stem)]
            self.stem_counts[nfc(new_stem)] += 1
        for name, sidecar in list(self.by_name.items()):
            self.by_name[name] = replace(
                sidecar, owners=self.stem_counts[sidecar.stem]
            )
        for carry in carried:
            if carry.mode == "delete":
                continue
            self.files[carry.target_name] = carry.target
            self.by_name[carry.target_name] = Sidecar(
                name=carry.target_name,
                path=carry.target,
                stem=nfc(new_stem),
                language=carry.language,
                owners=max(1, self.stem_counts[nfc(new_stem)]),
            )


def serving_stems(db, drive: str, folder_path: str) -> list[str]:
    rows = (
        db.query(File)
        .filter(File.drive == drive, File.folder_path == folder_path)
        .all()
    )
    return [
        stem_of(row.filename)
        for row in rows
        if serves_subtitles(row) and not _is_retired(row)
    ]


def folder_sidecars(db, drive: str, folder_path: str) -> FolderSidecars:
    return FolderSidecars.load(db, drive, folder_path)


def own_sidecars(db, drive: str, folder_path: str, stem: str) -> list[Sidecar]:
    return folder_sidecars(db, drive, folder_path).own(stem)


def detect_subtitles(
    video_file_path: str, drive_path: Path, stems: list[str] | None = None
) -> list[dict]:
    """The video's own sidecars, the bare track first and then by language.

    ``stems`` are the serving rows' stems of the video's folder. Without them
    the folder's own file names stand in, which is all a caller holding no
    database can know.
    """
    video_path = resolve_on_disk(drive_path, video_file_path, cached=True)
    if not video_path.exists():
        return []

    entries = _list_sidecar_entries(video_path.parent)
    if stems is None:
        derived = [
            stem_of(name)
            for _path, name in entries
            if serves_subtitles_name(name) and not is_subtitle_file(name)
        ]
        video_stem = nfc(video_path.stem)
        if video_stem not in derived:
            derived.append(video_stem)
        stems = derived

    index = FolderSidecars(stems, entries)
    listed = []
    for sc in index.own(video_path.stem):
        try:
            version = str(sc.path.stat().st_mtime_ns)
        except OSError:
            continue
        listed.append({
            "path": nfc(str(sc.path.relative_to(drive_path))),
            "language": sc.language,
            "format": sc.format,
            "label": sc.label,
            "filename": sc.name,
            "shared_with": sc.owners - 1,
            "version": version,
        })
    return listed


@dataclass(frozen=True)
class SidecarCarry:
    source: Path
    target: Path
    target_name: str
    mode: str  # "move" | "copy" | "delete"
    language: str


def same_content(left: Path, right: Path) -> bool:
    try:
        if left.stat().st_size != right.stat().st_size:
            return False
        with open(left, "rb") as one, open(right, "rb") as other:
            while True:
                block = one.read(1024 * 1024)
                if block != other.read(1024 * 1024):
                    return False
                if not block:
                    return True
    except OSError:
        return False


def _relative(folder_path: str, name: str) -> str:
    return f"{folder_path}/{name}" if folder_path else name


def plan_sidecar_carry(
    own: list[Sidecar],
    old_stem: str,
    new_stem: str,
    dest_dir: Path,
    dest_index: FolderSidecars,
    dest_stems: list[str],
    dest_folder_path: str,
) -> tuple[list[SidecarCarry], list[tuple[str, str]]]:
    """Plan one video's sidecars into ``dest_dir``.

    Returns the carries and every refusal as ``(code, drive-relative name)``.
    A refusal means the caller must not touch the disk or the database.
    """
    carried_names = {sc.name for sc in own}
    plans = {
        sc.name: (sc, new_stem + sc.name[len(old_stem):], sc.owners > 1)
        for sc in own
    }
    carries: list[SidecarCarry] = []
    conflicts: list[tuple[str, str]] = []
    planned_names: list[str] = []

    for sidecar in own:
        new_name = plans[sidecar.name][1]
        target = dest_dir / new_name
        existing = dest_index.files.get(new_name)
        other_owner_stays = sidecar.owners > 1
        target_owned = owner_stem(new_name, dest_stems) == new_stem

        if target == sidecar.path:
            mode = None
        elif existing is not None and same_content(sidecar.path, existing):
            mode = None if other_owner_stays else "delete"
        elif existing is not None and new_name in carried_names:
            holder = plans[new_name]
            if holder[1] == new_name or holder[2]:
                # The other own sidecar keeps that name (a shared track is
                # copied, not moved), so it is not free.
                conflicts.append(
                    ("subtitle_name_taken", _relative(dest_folder_path, new_name))
                )
                continue
            mode = "move"
        elif existing is not None:
            conflicts.append(
                ("subtitle_name_taken", _relative(dest_folder_path, new_name))
            )
            continue
        else:
            mode = "copy" if other_owner_stays else "move"

        if mode is not None and not target_owned:
            conflicts.append(
                ("subtitle_owner_change", _relative(dest_folder_path, new_name))
            )
            continue

        planned_names.append(new_name)
        if mode is not None:
            carries.append(
                SidecarCarry(
                    source=sidecar.path,
                    target=target,
                    target_name=new_name,
                    mode=mode,
                    language=sidecar.language,
                )
            )

    for sidecar in dest_index.all():
        if sidecar.name in carried_names or sidecar.name in planned_names:
            continue
        after = owner_stem(sidecar.name, dest_stems)
        if after is not None and after != sidecar.stem:
            conflicts.append(
                ("subtitle_owner_change", _relative(dest_folder_path, sidecar.name))
            )

    return carries, conflicts


def move_sidecar_subtitles(carries: list[SidecarCarry]) -> list[str]:
    """Run a carry plan. A failure is logged with both paths and named in the answer.

    Move order follows the dependency between source and target names, so a
    sidecar is never written onto a name another own sidecar still holds.
    """
    failures: list[str] = []
    pending = [carry for carry in carries if carry.mode in ("move", "copy")]

    while pending:
        ready_at = next(
            (
                i
                for i, carry in enumerate(pending)
                if not any(
                    other is not carry
                    and other.mode == "move"
                    and other.source.parent == carry.target.parent
                    and other.source.name == carry.target_name
                    for other in pending
                )
            ),
            None,
        )
        if ready_at is None:
            # A cycle: park one source under a temporary name so the next can move.
            carry = pending[0]
            temporary = carry.source.parent / f".{carry.target_name}.sidecar-tmp"
            try:
                shutil.move(str(carry.source), str(temporary))
            except Exception:
                logger.exception(
                    "subtitle sidecar %s could not move to %s",
                    carry.source,
                    temporary,
                )
                failures.append(carry.target_name)
                pending.pop(0)
                continue
            pending[0] = SidecarCarry(
                source=temporary,
                target=carry.target,
                target_name=carry.target_name,
                mode=carry.mode,
                language=carry.language,
            )
            continue

        carry = pending.pop(ready_at)
        try:
            if carry.mode == "copy":
                shutil.copy2(str(carry.source), str(carry.target))
            else:
                shutil.move(str(carry.source), str(carry.target))
        except Exception:
            logger.exception(
                "subtitle sidecar %s could not be carried to %s",
                carry.source,
                carry.target,
            )
            failures.append(carry.target_name)

    for carry in (c for c in carries if c.mode == "delete"):
        try:
            carry.source.unlink()
        except Exception:
            logger.exception("subtitle sidecar %s could not be deleted", carry.source)
            failures.append(carry.target_name)

    return failures


def write_sidecar(path: Path, body: bytes) -> None:
    replace_file_contents(path, body)


def delete_sidecar(path: Path) -> None:
    path.unlink()


@dataclass(frozen=True)
class PurgedSidecars:
    drive: str
    folder_path: str
    stem: str
    names: tuple[str, ...]


def sidecars_of_purged_row(db, file: File) -> PurgedSidecars | None:
    """The sidecars a purge deletes, captured before the row is gone."""
    if not serves_subtitles(file) or _is_retired(file):
        return None
    stem = stem_of(file.filename)
    names = tuple(sc.name for sc in own_sidecars(db, file.drive, file.folder_path, stem))
    if not names:
        return None
    return PurgedSidecars(file.drive, file.folder_path, stem, names)


def delete_purged_sidecars_after_commit(db, plan: PurgedSidecars | None) -> None:
    """Delete a purged row's own sidecars unless another row shares its stem.

    Called only after the row's deletion has committed: a rolled-back purge
    must leave every sidecar in place.
    """
    if plan is None:
        return
    import app.config as config

    try:
        remaining = serving_stems(db, plan.drive, plan.folder_path)
    except Exception:
        logger.exception(
            "subtitle sidecars of %s/%s could not be checked; leaving them",
            plan.drive,
            plan.folder_path,
        )
        return
    if any(nfc(stem) == plan.stem for stem in remaining):
        return
    drive_path = config.get_drive_path(plan.drive)
    directory = (
        resolve_on_disk(drive_path, plan.folder_path)
        if plan.folder_path
        else drive_path
    )
    for name in plan.names:
        path = directory / name
        try:
            if path.exists():
                path.unlink()
        except OSError:
            logger.exception(
                "subtitle sidecar %s could not be deleted with its video", path
            )


def arrival_owner_changes(
    db, drive: str, folder_path: str, filename: str
) -> list[str]:
    """Sidecars that would change owners if a row named ``filename`` arrived."""
    index = folder_sidecars(db, drive, folder_path)
    stems = list(index.stem_counts.elements()) + [stem_of(filename)]
    return [
        _relative(folder_path, sc.name)
        for sc in index.all()
        if (after := owner_stem(sc.name, stems)) is not None and after != sc.stem
    ]


def convert_srt_to_vtt(srt_content: str) -> str:
    """Convert SRT subtitle format to WebVTT format."""
    lines = srt_content.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    vtt_lines = ["WEBVTT", ""]

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        if re.match(r"^\d+$", line):
            i += 1
            continue

        # Convert timestamps: 00:01:23,456 --> 00:02:34,567
        if "-->" in line:
            vtt_lines.append(line.replace(",", "."))
            i += 1
            continue

        vtt_lines.append(lines[i].rstrip())
        i += 1

    return "\n".join(vtt_lines)
