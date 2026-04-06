import json
import logging
import os
import urllib.request
import urllib.error

logger = logging.getLogger(__name__)

SEARCH_SERVICE_URL = os.environ.get("SEARCH_SERVICE_URL", "http://search:8100")
_WEBHOOK_SECRET = os.environ.get("SEARCH_WEBHOOK_SECRET", "")


def _webhook_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if _WEBHOOK_SECRET:
        headers["X-Webhook-Secret"] = _WEBHOOK_SECRET
    return headers


async def notify_search_service(event: str, data: dict) -> None:
    """Fire-and-forget async notification to search service. Never raises."""
    try:
        import httpx

        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{SEARCH_SERVICE_URL}/webhook/{event}",
                json=data,
                headers=_webhook_headers(),
            )
    except Exception:
        logger.debug(
            "Search service notification failed for %s (service may be down)", event
        )


def notify_search_service_sync(event: str, data: dict) -> None:
    """Fire-and-forget synchronous notification for use in threads. Never raises."""
    try:
        url = f"{SEARCH_SERVICE_URL}/webhook/{event}"
        payload = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers=_webhook_headers(),
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        logger.debug(
            "Search service notification failed for %s (service may be down)", event
        )
