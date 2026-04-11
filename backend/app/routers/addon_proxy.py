"""Generic addon proxy for external service addons.

Reads proxy configuration from addon manifests and dynamically creates
proxy routes. Supports declarative response filtering (Y-method) for
drive access control.

Route pattern: /api/addons/{addon_name}/{path}
"""

import asyncio
import logging
import os
import re
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response, StreamingResponse

# Wall-clock safety cap for streaming proxy routes. ``read=None`` on the
# httpx timeout allows SSE streams to live for minutes at a time, but a
# misbehaving or stalled upstream could otherwise pin a worker forever.
# Ten minutes is well beyond any reasonable RAG answer latency (usually
# <60s) while still terminating slowloris patterns.
_STREAM_WALL_CLOCK_TIMEOUT_SEC = 600.0

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


# Headers we should never forward upstream (hop-by-hop, managed by httpx,
# or client-spoofable metadata we don't want the addon to trust). Stripping
# the X-Forwarded-* / Forwarded family prevents a hostile client from
# injecting a fake upstream IP/host that downstream services might log or
# rate-limit against.
_HOP_BY_HOP_REQUEST_HEADERS = frozenset(
    {
        "host",
        "connection",
        "transfer-encoding",
        "content-length",
        "x-forwarded-for",
        "x-forwarded-host",
        "x-forwarded-proto",
        "x-forwarded-port",
        "x-forwarded-server",
        "forwarded",
        "x-real-ip",
    }
)

# Headers we should never pass back to the client verbatim. We let Starlette
# rebuild framing/encoding and we rewrite content-type ourselves.
_STRIPPED_RESPONSE_HEADERS = frozenset(
    {
        "transfer-encoding",
        "connection",
        "content-length",
        "content-encoding",
        "keep-alive",
    }
)


def _filter_request_headers(request: Request) -> dict[str, str]:
    return {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in _HOP_BY_HOP_REQUEST_HEADERS
    }


def _filter_response_headers(upstream: httpx.Headers) -> dict[str, str]:
    return {
        k: v
        for k, v in upstream.items()
        if k.lower() not in _STRIPPED_RESPONSE_HEADERS
    }


async def _proxy_stream_request(
    target_url: str,
    path: str,
    request: Request,
) -> StreamingResponse:
    """Forward a request to the target service as a true streaming proxy.

    Used for ``stream: true`` routes (SSE, large binary blobs). Unlike the
    buffered path, this opens an upstream connection whose body is iterated
    lazily, so chunks flow to the client as they arrive from the addon —
    critical for SSE (``/ask``) where the whole response may take minutes
    but the first event must reach the browser immediately.

    The httpx client is kept alive for the lifetime of the response and
    closed in the generator's ``finally`` block so it survives both normal
    completion and client disconnect.
    """
    url = f"{target_url}{path}"
    params = dict(request.query_params)
    body = (
        await request.body()
        if request.method in ("POST", "PUT", "PATCH")
        else None
    )
    headers = _filter_request_headers(request)

    # No read timeout: SSE streams can be long-lived. Keep a short connect
    # timeout so a dead addon still fails fast.
    timeout = httpx.Timeout(connect=10.0, read=None, write=30.0, pool=10.0)
    client = httpx.AsyncClient(timeout=timeout)

    try:
        req = client.build_request(
            method=request.method,
            url=url,
            params=params,
            content=body,
            headers=headers,
        )
        upstream = await client.send(req, stream=True)
    except Exception:
        await client.aclose()
        logger.debug("Addon stream unavailable: %s%s", target_url, path)
        raise HTTPException(
            status_code=502, detail="Addon service unavailable"
        )

    async def _iterate() -> Any:
        # Monotonic wall-clock deadline. httpx's read=None intentionally
        # lets SSE streams run long, so we enforce a stream-wide upper
        # bound here. Exceeding the deadline raises TimeoutError which
        # the finally block converts into a clean connection close; the
        # client sees a truncated response rather than a hang.
        loop = asyncio.get_running_loop()
        deadline = loop.time() + _STREAM_WALL_CLOCK_TIMEOUT_SEC

        # aiter_bytes decodes any content-encoding (gzip/brotli) that the
        # upstream may have applied, matching the stripped Content-
        # Encoding response header so the client sees the uncompressed
        # bytes.
        iterator = upstream.aiter_bytes()
        try:
            while True:
                remaining = deadline - loop.time()
                if remaining <= 0:
                    logger.warning(
                        "Addon stream exceeded wall-clock cap (%.0fs): %s%s",
                        _STREAM_WALL_CLOCK_TIMEOUT_SEC,
                        target_url,
                        path,
                    )
                    break
                try:
                    chunk = await asyncio.wait_for(
                        iterator.__anext__(), timeout=remaining
                    )
                except StopAsyncIteration:
                    break
                except asyncio.TimeoutError:
                    logger.warning(
                        "Addon stream wall-clock timeout: %s%s",
                        target_url,
                        path,
                    )
                    break
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    response_headers = _filter_response_headers(upstream.headers)
    media_type = upstream.headers.get("content-type")
    # Starlette sets Content-Type from media_type; don't double-declare it.
    response_headers.pop("content-type", None)
    return StreamingResponse(
        _iterate(),
        status_code=upstream.status_code,
        headers=response_headers,
        media_type=media_type,
    )


async def _proxy_request(
    target_url: str,
    path: str,
    request: Request,
    stream: bool = False,
) -> Response | dict:
    """Forward request to the target service (buffered JSON path).

    For ``stream: true`` routes use ``_proxy_stream_request`` instead — it
    keeps the upstream connection open and streams chunks as they arrive.
    """
    if stream:
        return await _proxy_stream_request(target_url, path, request)

    url = f"{target_url}{path}"
    params = dict(request.query_params)
    timeout = 15.0

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.request(
                method=request.method,
                url=url,
                params=params,
                content=await request.body() if request.method in ("POST", "PUT", "PATCH") else None,
                headers=_filter_request_headers(request),
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
