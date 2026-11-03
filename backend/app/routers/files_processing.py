"""Report an uploaded file's processing stages, as declared by addons."""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import app.config as config
from app.auth import filter_drives, get_unlocked_groups
from app.database import get_db
from app.models import File, active_file_filter
from app.schemas import (
    FileProcessingResponse,
    FilesProcessingRequest,
    FilesProcessingResponse,
    ProcessingStageResponse,
)
from app.services import addon_registry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/files", tags=["files"])

_STAGE_KEY = re.compile(r"^[a-z][a-z0-9_.]*$")
_STAGE_STATES = frozenset({"pending", "running", "done", "failed"})
_ADDON_TIMEOUT_SEC = 3.0
_FAILURE_LOG_INTERVAL_SEC = 60.0

_SAVED_STAGE = {
    "addon": None,
    "key": "saved",
    "i18n_key": "upload.stageSaved",
    "state": "done",
    "required": True,
}

_failure_logged_at: dict[str, float] = {}


def _unavailable_stage(addon: str) -> dict[str, Any]:
    return {
        "addon": addon,
        "key": "unavailable",
        "i18n_key": "upload.stageUnavailable",
        "state": "pending",
        "required": True,
    }


def _stage_from_raw(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    key = raw.get("key")
    i18n_key = raw.get("i18n_key")
    state = raw.get("state")
    required = raw.get("required")
    if not isinstance(key, str) or not _STAGE_KEY.match(key):
        return None
    if not isinstance(i18n_key, str):
        return None
    if not isinstance(state, str) or state not in _STAGE_STATES:
        return None
    if not isinstance(required, bool):
        return None
    return {
        "key": key,
        "i18n_key": i18n_key,
        "state": state,
        "required": required,
    }


def _parse_answer(
    body: Any, requested: set[str]
) -> dict[str, list[dict[str, Any]] | None] | None:
    """Map each requested file to its stages, or ``None`` when its list is invalid.

    A body that is not the declared shape returns ``None``, which makes every
    requested file count as left out.
    """
    if not isinstance(body, dict):
        return None
    files = body.get("files")
    if not isinstance(files, dict):
        return None

    parsed: dict[str, list[dict[str, Any]] | None] = {}
    for file_id, entry in files.items():
        if not isinstance(file_id, str) or file_id not in requested:
            continue
        if not isinstance(entry, dict):
            parsed[file_id] = None
            continue
        raw_stages = entry.get("stages")
        if not isinstance(raw_stages, list):
            parsed[file_id] = None
            continue
        stages: list[dict[str, Any]] | None = []
        for raw in raw_stages:
            stage = _stage_from_raw(raw)
            if stage is None:
                stages = None
                break
            stages.append(stage)
        parsed[file_id] = stages
    return parsed


def _log_failure(addon: str, count: int) -> None:
    now = time.monotonic()
    last = _failure_logged_at.get(addon)
    if last is not None and now - last < _FAILURE_LOG_INTERVAL_SEC:
        return
    _failure_logged_at[addon] = now
    logger.warning(
        "Addon %r processing call failed for %d file(s)", addon, count
    )


async def _call_addon(
    name: str,
    meta: dict[str, Any],
    drive: str,
    file_ids: list[str],
) -> Any:
    proxy = meta.get("proxy")
    target = (
        addon_registry.resolve_target_url(proxy)
        if isinstance(proxy, dict)
        else None
    )
    path = meta["processing_status"]["path"]
    if not target:
        _log_failure(name, len(file_ids))
        return None

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(_ADDON_TIMEOUT_SEC), trust_env=False
        ) as client:
            response = await asyncio.wait_for(
                client.post(
                    f"{target}{path}",
                    json={"file_ids": file_ids},
                    # httpx encodes header values as ASCII, and the addon
                    # percent-decodes this one as the proxy does.
                    headers={"X-Lit-Drive": quote(drive, safe="")},
                ),
                timeout=_ADDON_TIMEOUT_SEC,
            )
        if response.status_code != 200:
            _log_failure(name, len(file_ids))
            return None
        return response.json()
    except Exception:
        _log_failure(name, len(file_ids))
        return None


def _is_ready(stages: list[dict[str, Any]]) -> bool:
    return all(
        not stage["required"] or stage["state"] == "done" for stage in stages
    )


@router.post("/processing", response_model=FilesProcessingResponse)
async def files_processing(
    body: FilesProcessingRequest,
    unlocked_groups: list[str] = Depends(get_unlocked_groups),
    db: Session = Depends(get_db),
):
    """Return the stage list of each requested file the caller can access."""
    requested = list(dict.fromkeys(body.file_ids))
    accessible_drives = {
        drive["name"]
        for drive in filter_drives(config.load_drives(), unlocked_groups)
    }
    rows = (
        db.query(File.id, File.drive)
        .filter(File.id.in_(requested), active_file_filter())
        .all()
    )
    file_drives = {
        file_id: drive
        for file_id, drive in rows
        if drive in accessible_drives
    }
    accessible_ids = [file_id for file_id in requested if file_id in file_drives]

    ids_by_drive: dict[str, list[str]] = {}
    for file_id in accessible_ids:
        ids_by_drive.setdefault(file_drives[file_id], []).append(file_id)

    addons = addon_registry.get_processing_addons()
    pairs: list[tuple[str, dict[str, Any], str]] = []
    for drive, ids in ids_by_drive.items():
        for name, meta in addons:
            if config.is_addon_feature_enabled(drive, name, "index"):
                pairs.append((name, meta, drive))

    answers = await asyncio.gather(
        *(
            _call_addon(name, meta, drive, ids_by_drive[drive])
            for name, meta, drive in pairs
        )
    )
    parsed = {
        (name, drive): _parse_answer(answer, set(ids_by_drive[drive]))
        for (name, _meta, drive), answer in zip(pairs, answers, strict=True)
    }

    files: dict[str, FileProcessingResponse] = {}
    for file_id in accessible_ids:
        drive = file_drives[file_id]
        stages = [dict(_SAVED_STAGE)]
        for name, _meta in addons:
            key = (name, drive)
            if key not in parsed:
                continue
            file_stages = parsed[key]
            if file_stages is None:
                stages.append(_unavailable_stage(name))
                continue
            addon_stages = file_stages.get(file_id)
            if addon_stages is None:
                stages.append(_unavailable_stage(name))
                continue
            stages.extend({"addon": name, **stage} for stage in addon_stages)
        files[file_id] = FileProcessingResponse(
            stages=[ProcessingStageResponse(**stage) for stage in stages],
            ready=_is_ready(stages),
        )

    return FilesProcessingResponse(files=files)
