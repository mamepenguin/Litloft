from __future__ import annotations

import http.client
import io
import ipaddress
import socket
import ssl
import time
import warnings
from dataclasses import dataclass
from urllib.parse import SplitResult, urljoin, urlsplit

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_URL_LENGTH = 2048
MAX_RESPONSE_BYTES = 15 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000
MAX_REDIRECTS = 5
BLOCKED_HOSTNAMES = {
    "localhost",
    "backend",
    "frontend",
    "host.docker.internal",
    "gateway.docker.internal",
}
_CGNAT = ipaddress.ip_network("100.64.0.0/10")


class SafeImageFetchError(ValueError):
    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


@dataclass(frozen=True)
class ValidatedImageUrl:
    url: str
    parts: SplitResult
    hostname: str
    port: int


@dataclass(frozen=True)
class FetchedImage:
    body: bytes
    final_url: str
    content_type: str | None


@dataclass(frozen=True)
class NormalizedImage:
    body: bytes
    extension: str
    mime_type: str
    width: int
    height: int


def validate_image_url(url: str) -> ValidatedImageUrl:
    if not isinstance(url, str) or not url or len(url) > MAX_URL_LENGTH:
        raise SafeImageFetchError("invalid_url", "URL is empty or too long")
    if any(ord(char) < 32 or ord(char) == 127 for char in url):
        raise SafeImageFetchError("invalid_url", "URL contains control characters")
    try:
        parts = urlsplit(url)
        port = parts.port or 443
    except ValueError as exc:
        raise SafeImageFetchError("invalid_url", "URL has an invalid port") from exc
    if parts.scheme.lower() != "https":
        raise SafeImageFetchError("invalid_url", "Only HTTPS image URLs are allowed")
    if parts.username is not None or parts.password is not None:
        raise SafeImageFetchError("invalid_url", "User information is not allowed")
    if not parts.hostname:
        raise SafeImageFetchError("invalid_url", "URL hostname is required")
    try:
        hostname = parts.hostname.rstrip(".").encode("idna").decode("ascii").lower()
    except UnicodeError as exc:
        raise SafeImageFetchError("invalid_url", "URL hostname is invalid") from exc
    if hostname in BLOCKED_HOSTNAMES or hostname.endswith(".localhost"):
        raise SafeImageFetchError("blocked_address", "Hostname is not allowed")
    if not 1 <= port <= 65535:
        raise SafeImageFetchError("invalid_url", "URL port is invalid")
    return ValidatedImageUrl(url=url, parts=parts, hostname=hostname, port=port)


def _is_blocked_ip(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return True
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    if isinstance(ip, ipaddress.IPv4Address) and ip in _CGNAT:
        return True
    return not ip.is_global


def _resolve_host(hostname: str, port: int) -> list[str]:
    try:
        answers = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise SafeImageFetchError("fetch_failed", "DNS resolution failed") from exc
    addresses = list(dict.fromkeys(answer[4][0] for answer in answers))
    if not addresses:
        raise SafeImageFetchError("fetch_failed", "DNS returned no addresses")
    return addresses


def _validated_addresses(url: ValidatedImageUrl) -> list[str]:
    addresses = _resolve_host(url.hostname, url.port)
    if any(_is_blocked_ip(address) for address in addresses):
        raise SafeImageFetchError("blocked_address", "DNS returned a blocked address")
    return addresses


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(
        self,
        host: str,
        port: int,
        pinned_ip: str,
        *,
        connect_timeout: float,
        read_timeout: float,
    ):
        super().__init__(host, port=port, timeout=connect_timeout)
        self._pinned_ip = pinned_ip
        self._read_timeout = read_timeout
        self._context = ssl.create_default_context()

    def connect(self) -> None:
        raw_socket = socket.create_connection(
            (self._pinned_ip, self.port), self.timeout,
        )
        raw_socket.settimeout(self._read_timeout)
        self.sock = self._context.wrap_socket(raw_socket, server_hostname=self.host)


def _request_path(parts: SplitResult) -> str:
    path = parts.path or "/"
    if parts.query:
        path = f"{path}?{parts.query}"
    return path


def fetch_image(
    url: str,
    *,
    max_bytes: int = MAX_RESPONSE_BYTES,
    max_redirects: int = MAX_REDIRECTS,
    connect_timeout: float = 5.0,
    read_timeout: float = 15.0,
    total_timeout: float = 20.0,
) -> FetchedImage:
    current_url = url
    started = time.monotonic()
    for redirect_count in range(max_redirects + 1):
        validated = validate_image_url(current_url)
        addresses = _validated_addresses(validated)
        connection = _PinnedHTTPSConnection(
            validated.hostname,
            validated.port,
            addresses[0],
            connect_timeout=connect_timeout,
            read_timeout=read_timeout,
        )
        try:
            connection.request(
                "GET",
                _request_path(validated.parts),
                headers={
                    "Host": validated.parts.netloc,
                    "User-Agent": "Litloft-Image-Importer/1.0",
                    "Accept": "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
                    "Accept-Encoding": "identity",
                    "Connection": "close",
                },
            )
            response = connection.getresponse()
            if response.status in {301, 302, 303, 307, 308}:
                location = response.getheader("Location")
                if not location or redirect_count >= max_redirects:
                    raise SafeImageFetchError(
                        "redirect_rejected", "Redirect limit or Location is invalid"
                    )
                current_url = urljoin(current_url, location)
                continue
            if response.status < 200 or response.status >= 300:
                raise SafeImageFetchError(
                    "fetch_failed", f"Image server returned HTTP {response.status}"
                )
            content_encoding = response.getheader("Content-Encoding")
            if content_encoding and content_encoding.lower() != "identity":
                raise SafeImageFetchError(
                    "invalid_image", "Compressed HTTP responses are not accepted"
                )
            length_header = response.getheader("Content-Length")
            if length_header:
                try:
                    if int(length_header) > max_bytes:
                        raise SafeImageFetchError(
                            "response_too_large", "Image response exceeds byte limit"
                        )
                except ValueError as exc:
                    raise SafeImageFetchError(
                        "fetch_failed", "Invalid Content-Length header"
                    ) from exc
            chunks: list[bytes] = []
            total = 0
            while True:
                if time.monotonic() - started > total_timeout:
                    raise SafeImageFetchError("fetch_timeout", "Image fetch timed out")
                chunk = response.read(min(64 * 1024, max_bytes - total + 1))
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise SafeImageFetchError(
                        "response_too_large", "Image response exceeds byte limit"
                    )
                chunks.append(chunk)
            return FetchedImage(
                body=b"".join(chunks),
                final_url=current_url,
                content_type=response.getheader("Content-Type"),
            )
        except (TimeoutError, socket.timeout) as exc:
            raise SafeImageFetchError("fetch_timeout", "Image fetch timed out") from exc
        except (OSError, http.client.HTTPException) as exc:
            raise SafeImageFetchError("fetch_failed", "Image fetch failed") from exc
        finally:
            connection.close()
    raise SafeImageFetchError("redirect_rejected", "Redirect limit exceeded")


def normalize_image(
    body: bytes,
    *,
    max_pixels: int = MAX_IMAGE_PIXELS,
    max_dimension: int = 4096,
) -> NormalizedImage:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(body)) as opened:
                if opened.width * opened.height > max_pixels:
                    raise SafeImageFetchError(
                        "image_too_large", "Decoded image exceeds pixel limit"
                    )
                if getattr(opened, "n_frames", 1) != 1:
                    raise SafeImageFetchError(
                        "invalid_image", "Animated images are not supported"
                    )
                opened.load()
                image = ImageOps.exif_transpose(opened).copy()
    except SafeImageFetchError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise SafeImageFetchError("image_too_large", "Image exceeds pixel limit") from exc
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise SafeImageFetchError("invalid_image", "Response is not a valid raster image") from exc

    image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
    has_alpha = image.mode in {"RGBA", "LA"} or (
        image.mode == "P" and "transparency" in image.info
    )
    output = io.BytesIO()
    if has_alpha:
        clean = Image.new("RGBA", image.size)
        clean.paste(image.convert("RGBA"))
        clean.save(output, format="PNG", optimize=True)
        extension = ".png"
        mime_type = "image/png"
    else:
        clean = Image.new("RGB", image.size)
        clean.paste(image.convert("RGB"))
        clean.save(output, format="JPEG", quality=90, optimize=True)
        extension = ".jpg"
        mime_type = "image/jpeg"
    return NormalizedImage(
        body=output.getvalue(),
        extension=extension,
        mime_type=mime_type,
        width=clean.width,
        height=clean.height,
    )


def fetch_and_normalize_image(url: str) -> NormalizedImage:
    fetched = fetch_image(url)
    return normalize_image(fetched.body)
