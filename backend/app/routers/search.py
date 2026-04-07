import logging
import os
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Query

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
