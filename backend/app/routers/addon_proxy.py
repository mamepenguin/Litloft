"""Generic addon proxy for external service addons.

Reads proxy configuration from addon manifests and dynamically creates
proxy routes. Supports declarative response filtering (Y-method) for
drive access control.

Route pattern: /api/addons/{addon_name}/{path}
"""

import logging
import os
import re
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

import app.config as config
from app.auth import filter_drives, get_unlocked_groups
from app.database import get_db
from app.models import File
from sqlalchemy.orm import Session
from app.services import addon_registry

logger = logging.getLogger(__name__)

router = APIRouter(tags=["addon-proxy"])


def _resolve_target_url(proxy_config: dict) -> str | None:
    """Resolve the target URL from env var or default."""
    env_name = proxy_config.get("target_env", "")
    default_url = proxy_config.get("target_default", "")
    return os.environ.get(env_name, default_url) or None


def _accessible_drives(unlocked_groups: list[str]) -> set[str]:
    """Get set of drive names accessible to the current user."""
    return {
        d["name"] for d in filter_drives(config.load_drives(), unlocked_groups)
    }


def _apply_drive_access_filter(
    data: dict[str, Any],
    filter_config: dict[str, Any],
    accessible: set[str],
) -> dict[str, Any]:
    """Filter response data by drive access control."""
    filter_type = filter_config.get("type")

    if filter_type == "drive_access":
        array_path = filter_config["array_path"]
        drive_field = filter_config["drive_field"]
        items = data.get(array_path, [])
        filtered = [
            item for item in items
            if item.get(drive_field) in accessible
        ]
        return {
            **data,
            array_path: filtered,
            "total": len(filtered),
        }

    if filter_type == "drive_access_nested":
        paths = filter_config.get("paths", {})
        result = dict(data)
        for dotted_path, drive_field in paths.items():
            parts = dotted_path.split(".")
            obj = result
            for part in parts[:-1]:
                obj = obj.get(part, {})
                if not isinstance(obj, dict):
                    break
            if isinstance(obj, dict):
                array_key = parts[-1]
                items = obj.get(array_key, [])
                filtered = [
                    item for item in items
                    if item.get(drive_field) in accessible
                ]
                obj[array_key] = filtered
                obj["total"] = len(filtered)
        return result

    return data


def _check_file_access(
    file_id: str,
    unlocked_groups: list[str],
    db: Any,
) -> None:
    """Pre-check: verify file exists and user has access to its drive."""
    file = (
        db.query(File)
        .filter(File.id == file_id, File.deleted_at.is_(None))
        .first()
    )
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    accessible = _accessible_drives(unlocked_groups)
    if file.drive not in accessible:
        raise HTTPException(status_code=404, detail="File not found")


def _extract_path_params(
    route_pattern: str, actual_path: str
) -> dict[str, str] | None:
    """Extract path parameters from a route pattern.

    Example: pattern="/similar/{file_id}", path="/similar/abc123"
    Returns: {"file_id": "abc123"}
    """
    regex = re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", route_pattern)
    match = re.fullmatch(regex, actual_path)
    if match:
        return match.groupdict()
    return None


async def _proxy_request(
    target_url: str,
    path: str,
    request: Request,
    stream: bool = False,
) -> Response | dict:
    """Forward request to the target service."""
    url = f"{target_url}{path}"
    params = dict(request.query_params)

    timeout = 30.0 if stream else 15.0

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.request(
                method=request.method,
                url=url,
                params=params,
                content=await request.body() if request.method in ("POST", "PUT", "PATCH") else None,
                headers={
                    k: v for k, v in request.headers.items()
                    if k.lower() not in ("host", "connection", "transfer-encoding")
                },
            )

            if stream:
                return Response(
                    content=resp.content,
                    status_code=resp.status_code,
                    media_type=resp.headers.get("content-type", "application/octet-stream"),
                    headers={
                        "Cache-Control": resp.headers.get(
                            "cache-control", "public, max-age=3600"
                        )
                    },
                )

            # Forward client-facing errors (4xx) from the upstream addon
            # as-is so meaningful validation / permission responses reach
            # the browser. Previously every non-2xx became a generic 502,
            # which hid useful error details like "insufficient_content"
            # or "auto-tags feature disabled".
            if 400 <= resp.status_code < 500:
                try:
                    body = resp.json()
                    detail = (
                        body.get("detail", body)
                        if isinstance(body, dict)
                        else body
                    )
                except Exception:
                    detail = resp.text or "Addon error"
                raise HTTPException(status_code=resp.status_code, detail=detail)
            resp.raise_for_status()  # 5xx → fall through to 502 handler
            return resp.json()

    except HTTPException:
        raise
    except Exception:
        logger.debug("Addon service unavailable: %s%s", target_url, path)
        raise HTTPException(status_code=502, detail="Addon service unavailable")


def _match_route(
    routes: list[dict], method: str, path: str
) -> tuple[dict, dict[str, str]] | None:
    """Find matching route config and extract path params."""
    for route in routes:
        allowed_methods = [m.upper() for m in route.get("methods", ["GET"])]
        if method.upper() not in allowed_methods:
            continue

        params = _extract_path_params(route["path"], path)
        if params is not None:
            return route, params

    return None


@router.api_route(
    "/api/addons/{addon_name}/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
)
async def addon_proxy(
    addon_name: str,
    path: str,
    request: Request,
    unlocked_groups: Annotated[list[str], Depends(get_unlocked_groups)] = [],
    db: Session = Depends(get_db),
):
    """Generic proxy for external service addons."""
    meta = addon_registry.get(addon_name)
    if not meta or "proxy" not in meta:
        raise HTTPException(status_code=404, detail="Addon not found")

    proxy_config = meta["proxy"]
    target_url = _resolve_target_url(proxy_config)
    if not target_url:
        raise HTTPException(status_code=503, detail="Addon target not configured")

    routes = proxy_config.get("routes", [])
    route_path = f"/{path}"
    matched = _match_route(routes, request.method, route_path)

    if not matched:
        raise HTTPException(status_code=404, detail="Route not found")

    route_config, path_params = matched

    # Pre-check hooks
    pre_check = route_config.get("pre_check")
    if pre_check:
        check_type = pre_check.get("type")
        if check_type == "file_access":
            param_name = pre_check.get("param", "file_id")
            file_id = path_params.get(param_name)
            if file_id:
                _check_file_access(file_id, unlocked_groups, db)

    # Proxy the request
    is_stream = route_config.get("stream", False)

    try:
        result = await _proxy_request(
            target_url, route_path, request, stream=is_stream,
        )
    except HTTPException:
        raise
    except Exception:
        return {"available": False}

    # Stream responses are already Response objects
    if isinstance(result, Response):
        return result

    # Apply response filter
    response_filter = route_config.get("response_filter")
    if response_filter:
        accessible = _accessible_drives(unlocked_groups)
        result = _apply_drive_access_filter(result, response_filter, accessible)

    # Add available flag for consistency with current API
    if isinstance(result, dict) and "available" not in result:
        result["available"] = True

    return result
