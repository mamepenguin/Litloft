import io

import pytest
from PIL import Image

from app.services.safe_image_fetch import (
    SafeImageFetchError,
    _is_blocked_ip,
    fetch_image,
    normalize_image,
    validate_image_url,
)


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "10.0.0.1",
        "169.254.169.254",
        "100.64.0.1",
        "::1",
        "::ffff:127.0.0.1",
        "fc00::1",
        "fe80::1",
    ],
)
def test_blocked_ip_ranges(address):
    assert _is_blocked_ip(address)


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/a.jpg",
        "https://user:pass@example.com/a.jpg",
        "https://localhost/a.jpg",
        "https://backend/a.jpg",
        "https:///a.jpg",
        "https://example.com:99999/a.jpg",
        "https://example.com/a.jpg\nHost: internal",
    ],
)
def test_validate_image_url_rejects_unsafe_structures(url):
    with pytest.raises(SafeImageFetchError):
        validate_image_url(url)


def test_fetch_pins_each_redirect_hop(monkeypatch):
    resolutions = {
        "images.example.com": ["93.184.216.34"],
        "cdn.example.net": ["8.8.8.8"],
    }
    connections = []

    class FakeResponse:
        def __init__(self, status, headers, body=b""):
            self.status = status
            self._headers = headers
            self._body = io.BytesIO(body)

        def getheader(self, name):
            return self._headers.get(name)

        def read(self, size):
            return self._body.read(size)

    responses = [
        FakeResponse(302, {"Location": "https://cdn.example.net/final.jpg"}),
        FakeResponse(200, {"Content-Type": "image/jpeg"}, b"image bytes"),
    ]

    class FakeConnection:
        def __init__(self, host, port, pinned_ip, **kwargs):
            connections.append((host, port, pinned_ip, kwargs))

        def request(self, method, path, headers):
            self.request_headers = headers

        def getresponse(self):
            return responses.pop(0)

        def close(self):
            pass

    monkeypatch.setattr(
        "app.services.safe_image_fetch._resolve_host",
        lambda host, port: resolutions[host],
    )
    monkeypatch.setattr(
        "app.services.safe_image_fetch._PinnedHTTPSConnection", FakeConnection,
    )

    result = fetch_image("https://images.example.com/start.jpg")

    assert result.body == b"image bytes"
    assert result.final_url == "https://cdn.example.net/final.jpg"
    assert [(host, ip) for host, _, ip, _ in connections] == [
        ("images.example.com", "93.184.216.34"),
        ("cdn.example.net", "8.8.8.8"),
    ]


def test_fetch_rejects_redirect_to_private_address(monkeypatch):
    class FakeResponse:
        status = 302

        def getheader(self, name):
            return "https://private.example/secret" if name == "Location" else None

        def read(self, size):
            return b""

    class FakeConnection:
        def __init__(self, *args, **kwargs):
            pass

        def request(self, *args, **kwargs):
            pass

        def getresponse(self):
            return FakeResponse()

        def close(self):
            pass

    monkeypatch.setattr(
        "app.services.safe_image_fetch._resolve_host",
        lambda host, port: ["93.184.216.34"] if host == "public.example" else ["10.0.0.2"],
    )
    monkeypatch.setattr(
        "app.services.safe_image_fetch._PinnedHTTPSConnection", FakeConnection,
    )

    with pytest.raises(SafeImageFetchError, match="blocked_address"):
        fetch_image("https://public.example/start")


def test_fetch_enforces_response_limit(monkeypatch):
    class FakeResponse:
        status = 200

        def getheader(self, name):
            return None

        def read(self, size):
            return b"x" * size

    class FakeConnection:
        def __init__(self, *args, **kwargs):
            pass

        def request(self, *args, **kwargs):
            pass

        def getresponse(self):
            return FakeResponse()

        def close(self):
            pass

    monkeypatch.setattr(
        "app.services.safe_image_fetch._resolve_host", lambda host, port: ["93.184.216.34"]
    )
    monkeypatch.setattr(
        "app.services.safe_image_fetch._PinnedHTTPSConnection", FakeConnection,
    )

    with pytest.raises(SafeImageFetchError, match="response_too_large"):
        fetch_image("https://images.example.com/a.jpg", max_bytes=64)


def test_normalize_image_strips_metadata_and_resizes():
    source = Image.new("RGB", (5000, 100), "red")
    raw = io.BytesIO()
    source.save(raw, format="JPEG", exif=b"Exif\x00\x00test")

    normalized = normalize_image(raw.getvalue(), max_dimension=4096)

    assert normalized.extension == ".jpg"
    with Image.open(io.BytesIO(normalized.body)) as result:
        assert result.width == 4096
        assert result.height < 100
        assert not result.getexif()


def test_normalize_rejects_animated_image():
    first = Image.new("RGB", (10, 10), "red")
    second = Image.new("RGB", (10, 10), "blue")
    raw = io.BytesIO()
    first.save(raw, format="GIF", save_all=True, append_images=[second])

    with pytest.raises(SafeImageFetchError, match="invalid_image"):
        normalize_image(raw.getvalue())
