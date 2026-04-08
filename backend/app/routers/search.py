import logging
import os
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import Response

import app.config as config
from app.auth import filter_drives, get_unlocked_groups

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/search", tags=["search"])

SEARCH_SERVICE_URL = os.environ.get("SEARCH_SERVICE_URL", "http://search:8100")
_WEBHOOK_SECRET = os.environ.get("SEARCH_WEBHOOK_SECRET", "")


def _internal_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    if _WEBHOOK_SECRET:
        headers["X-Webhook-Secret"] = _WEBHOOK_SECRET
    return headers


@router.get("")
async def search(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
    type: str | None = Query(None),
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)] = [],
):
    try:
        params = {"q": q, "limit": limit}
        if type is not None:
            params["type"] = type

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{SEARCH_SERVICE_URL}/search", params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        logger.debug("Search service unavailable")
        return {"available": False, "results": [], "total": 0}

    accessible_drives = {
        d["name"] for d in filter_drives(config.load_drives(), unlocked_groups)
    }
    results = data.get("results", [])
    filtered = [r for r in results if r.get("drive") in accessible_drives]

    return {
        **data,
        "available": True,
        "results": filtered,
        "total": len(filtered),
    }


@router.get("/compare")
async def search_compare(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
    type: str | None = Query(None),
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)] = [],
):
    """Proxy compare endpoint: RRF vs cosine side by side."""
    try:
        params: dict = {"q": q, "limit": limit}
        if type is not None:
            params["type"] = type

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{SEARCH_SERVICE_URL}/search/compare", params=params
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        logger.debug("Search service unavailable for compare")
        return {"available": False}

    accessible_drives = {
        d["name"] for d in filter_drives(config.load_drives(), unlocked_groups)
    }

    for key in ("rrf", "cosine"):
        section = data.get(key, {})
        results = section.get("results", [])
        section["results"] = [
            r for r in results if r.get("drive") in accessible_drives
        ]
        section["total"] = len(section["results"])

    return {**data, "available": True}


@router.get("/status")
async def search_status():
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{SEARCH_SERVICE_URL}/status")
            resp.raise_for_status()
            data = resp.json()
            return {**data, "available": True}
    except Exception:
        logger.debug("Search service unavailable")
        return {"available": False}


@router.post("/queue/{action}")
async def queue_control(action: str):
    """Proxy queue control actions to search service."""
    allowed_actions = {"pause", "resume", "reindex"}
    if action not in allowed_actions:
        return {"error": "Unknown action"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{SEARCH_SERVICE_URL}/queue/{action}",
                headers=_internal_headers(),
            )
            resp.raise_for_status()
            return resp.json()
    except Exception:
        logger.debug("Search service unavailable for queue/%s", action)
        return {"available": False}


@router.post("/queue/prioritize")
async def queue_prioritize(body: dict):
    """Proxy queue prioritize to search service."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{SEARCH_SERVICE_URL}/queue/prioritize",
                json=body,
                headers=_internal_headers(),
            )
            resp.raise_for_status()
            return resp.json()
    except Exception:
        logger.debug("Search service unavailable for queue/prioritize")
        return {"available": False}


def _accessible_drives(unlocked_groups: list[str]) -> set[str]:
    return {
        d["name"] for d in filter_drives(config.load_drives(), unlocked_groups)
    }


async def _proxy_file_json(
    endpoint: str,
    file_id: str,
    unlocked_groups: list[str],
) -> dict | None:
    """Proxy a per-file JSON endpoint with drive access control."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{SEARCH_SERVICE_URL}/files/{file_id}/{endpoint}",
            )
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        logger.debug("Search service unavailable for files/%s/%s", file_id, endpoint)
        return None

    drive = data.get("drive", "")
    if drive not in _accessible_drives(unlocked_groups):
        return None

    return data


@router.get("/files/{file_id}/transcript")
async def file_transcript(
    file_id: str = Path(..., min_length=12, max_length=12),
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)] = [],
):
    data = await _proxy_file_json("transcript", file_id, unlocked_groups)
    if data is None:
        return {"available": False}
    return {**data, "available": True}


@router.get("/files/{file_id}/index-details")
async def file_index_details(
    file_id: str = Path(..., min_length=12, max_length=12),
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)] = [],
):
    data = await _proxy_file_json("index-details", file_id, unlocked_groups)
    if data is None:
        return {"available": False}
    return {**data, "available": True}


@router.get("/files/{file_id}/clip-timestamps")
async def file_clip_timestamps(
    file_id: str = Path(..., min_length=12, max_length=12),
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)] = [],
):
    data = await _proxy_file_json("clip-timestamps", file_id, unlocked_groups)
    if data is None:
        return {"available": False}
    return {**data, "available": True}


@router.get("/files/{file_id}/frame")
async def file_frame(
    file_id: str = Path(..., min_length=12, max_length=12),
    t: float = Query(..., ge=0),
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)] = [],
):
    """Proxy frame extraction with drive access control."""
    # Verify access via clip-timestamps (lightweight, includes drive)
    access_data = await _proxy_file_json("clip-timestamps", file_id, unlocked_groups)
    if access_data is None:
        return Response(status_code=404)

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                f"{SEARCH_SERVICE_URL}/files/{file_id}/frame",
                params={"t": t},
            )
            if resp.status_code != 200:
                return Response(status_code=resp.status_code)
            return Response(
                content=resp.content,
                media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=3600"},
            )
    except Exception:
        logger.debug("Search service unavailable for frame extraction")
        return Response(status_code=502)
