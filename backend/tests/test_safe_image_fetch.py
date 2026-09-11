"""The image fetcher's gate, from the URL string to the socket.

Which IP addresses are refused is declared in
``test_ssrf_blocked_addresses.py``; this file is about the path that carries an
address to a socket — resolution, pinning, redirects and the response limits.
"""

import http.client
import io
import socket
import ssl

import pytest
from PIL import Image

from app.services import safe_image_fetch
from app.services.safe_image_fetch import (
    SafeImageFetchError,
    _host_header,
    _PinnedHTTPSConnection,
    fetch_and_normalize_image,
    fetch_image,
    normalize_image,
    validate_image_url,
)


class _Response:
    def __init__(self, status=200, headers=None, body=b"", read_error=None):
        self.status = status
        self._headers = {key.lower(): value for key, value in (headers or {}).items()}
        self._body = io.BytesIO(body)
        self._read_error = read_error

    def getheader(self, name):
        return self._headers.get(name.lower())

    def read(self, size):
        if self._read_error is not None:
            raise self._read_error
        return self._body.read(size)


class _Transport:
    """Stands in for `_PinnedHTTPSConnection`, recording what it was handed.

    The pinned address is an argument to the constructor, so recording every
    construction is how a test sees which address a hop was about to open —
    including a hop that is refused before any socket exists.
    """

    def __init__(self, *responses, resolutions=None):
        self.responses = list(responses)
        self.resolutions = resolutions
        self.connections = []
        self.requests = []
        self.closed = 0

    def install(self, monkeypatch):
        transport = self

        class Connection:
            def __init__(self, host, port, pinned_ip, **kwargs):
                transport.connections.append((host, port, pinned_ip, kwargs))

            def request(self, method, path, headers):
                transport.requests.append((method, path, headers))

            def getresponse(self):
                return transport.responses.pop(0)

            def close(self):
                transport.closed += 1

        monkeypatch.setattr(safe_image_fetch, "_PinnedHTTPSConnection", Connection)
        # `resolutions=None` leaves `_resolve_host` alone, for the tests whose
        # subject is resolution itself.
        if self.resolutions is not None:
            monkeypatch.setattr(
                safe_image_fetch,
                "_resolve_host",
                lambda host, port: self.resolutions[host],
            )
        return self

    @property
    def pinned(self):
        return [(host, ip) for host, _, ip, _ in self.connections]


def _stub_getaddrinfo(monkeypatch, mapping):
    def fake(host, port, *args, **kwargs):
        if host not in mapping:
            raise socket.gaierror(-2, "Name or service not known")
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port)) for ip in mapping[host]]

    monkeypatch.setattr(socket, "getaddrinfo", fake)


# --- validate_image_url: structure, before any address is known -------------


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


def test_the_hostname_is_normalised_before_the_denylist_is_consulted():
    """`BLOCKED_HOSTNAMES` holds ASCII, and IDNA folds more than case into it.

    Measured: `"ⓛⓞⓒⓐⓛⓗⓞⓢⓣ".encode("idna")` is `localhost`. Consulting the
    denylist against the hostname as written would let that through.
    """
    with pytest.raises(SafeImageFetchError, match="blocked_address"):
        validate_image_url("https://ⓛⓞⓒⓐⓛⓗⓞⓢⓣ/a.jpg")
    with pytest.raises(SafeImageFetchError, match="blocked_address"):
        validate_image_url("https://BACKEND./a.jpg")
    assert validate_image_url("https://ⓕⓞⓞ.com/a.jpg").hostname == "foo.com"


def test_a_url_longer_than_the_limit_is_refused():
    long_url = "https://example.com/" + "a" * safe_image_fetch.MAX_URL_LENGTH
    with pytest.raises(SafeImageFetchError, match="invalid_url"):
        validate_image_url(long_url)


def test_a_hostname_idna_cannot_encode_is_refused():
    with pytest.raises(SafeImageFetchError, match="invalid_url"):
        validate_image_url("https://" + "a" * 128 + ".com/a.jpg")


def test_an_explicit_port_of_zero_is_refused_rather_than_defaulted():
    """`urlsplit` rejects every out-of-range port except 0, which it accepts.

    So 0 is the one value the range check can see, and reading it as "no port
    given" turns a request for an unconnectable port into a request for 443.
    """
    with pytest.raises(SafeImageFetchError, match="invalid_url"):
        validate_image_url("https://example.com:0/a.jpg")
    assert validate_image_url("https://example.com/a.jpg").port == 443
    assert validate_image_url("https://example.com:8443/a.jpg").port == 8443


@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://example.com/a.jpg", "example.com"),
        ("https://example.com:8443/a.jpg", "example.com:8443"),
        ("https://exämple.com/a.jpg", "xn--exmple-cua.com"),
        ("https://[2606:2800:220:1:248:1893:25c8:1946]/a.jpg",
         "[2606:2800:220:1:248:1893:25c8:1946]"),
    ],
)
def test_the_host_header_carries_the_normalised_hostname(url, expected):
    """A virtual-hosted server serves by Host, and http.client encodes it as
    latin-1 — so the spelling the author typed is either wrong on the wire or
    cannot be put on it at all."""
    assert _host_header(validate_image_url(url)) == expected


@pytest.mark.parametrize(
    "url,expected_path",
    [
        ("https://images.example.com/a.jpg", "/a.jpg"),
        ("https://images.example.com", "/"),
        ("https://images.example.com/a.jpg?sig=abc&v=2", "/a.jpg?sig=abc&v=2"),
    ],
)
def test_the_request_keeps_the_query_string(url, expected_path, monkeypatch):
    """A signed CDN URL is its query; dropping it fetches a 403 page instead."""
    transport = _Transport(
        _Response(200, body=b"bytes"),
        resolutions={"images.example.com": ["93.184.216.34"]},
    ).install(monkeypatch)

    fetch_image(url)

    assert [path for _, path, _ in transport.requests] == [expected_path]


def test_the_request_sends_the_normalised_hostname_as_its_host(monkeypatch):
    """The header is assembled from the validated hostname, not from the netloc
    the markdown author wrote, so the wiring is asserted where it is used."""
    transport = _Transport(
        _Response(200, body=b"bytes"),
        resolutions={"xn--exmple-cua.com": ["93.184.216.34"]},
    ).install(monkeypatch)

    fetch_image("https://exämple.com/a.jpg")

    assert transport.requests[0][2]["Host"] == "xn--exmple-cua.com"


# --- the address gate: resolution, and what is done with the answers --------


def test_a_resolution_failure_is_reported_without_opening_a_socket(monkeypatch):
    transport = _Transport(resolutions=None).install(monkeypatch)
    _stub_getaddrinfo(monkeypatch, {})

    with pytest.raises(SafeImageFetchError, match="fetch_failed"):
        fetch_image("https://nowhere.example/a.jpg")
    assert transport.connections == []


def test_a_resolution_that_returns_nothing_is_refused(monkeypatch):
    transport = _Transport(resolutions=None).install(monkeypatch)
    _stub_getaddrinfo(monkeypatch, {"empty.example": []})

    with pytest.raises(SafeImageFetchError, match="fetch_failed"):
        fetch_image("https://empty.example/a.jpg")
    assert transport.connections == []


def test_every_resolved_address_is_judged_not_only_the_one_pinned(monkeypatch):
    """A resolver that answers public-first and private-second is the cheap
    DNS-rebinding shape: pinning the first answer would connect to the public
    address now and leave the private one reachable on the next resolution."""
    transport = _Transport(_Response(), resolutions=None).install(monkeypatch)
    _stub_getaddrinfo(monkeypatch, {"mixed.example": ["93.184.216.34", "10.0.0.2"]})

    with pytest.raises(SafeImageFetchError, match="blocked_address"):
        fetch_image("https://mixed.example/a.jpg")
    assert transport.connections == []


def test_the_first_answer_is_pinned_and_duplicates_collapse(monkeypatch):
    """The pinned address is `addresses[0]`, so the order the resolver gave is
    the order that decides it, and a repeated answer must not shift it."""
    transport = _Transport(
        _Response(headers={"Content-Type": "image/jpeg"}, body=b"bytes"),
        resolutions=None,
    ).install(monkeypatch)
    _stub_getaddrinfo(
        monkeypatch,
        {"cdn.example": ["93.184.216.34", "93.184.216.34", "8.8.8.8"]},
    )

    assert safe_image_fetch._resolve_host("cdn.example", 443) == [
        "93.184.216.34",
        "8.8.8.8",
    ]
    assert fetch_image("https://cdn.example/a.jpg").body == b"bytes"
    assert transport.pinned == [("cdn.example", "93.184.216.34")]


@pytest.mark.parametrize(
    "url",
    [
        "https://2130706433/a.jpg",
        "https://0x7f000001/a.jpg",
        "https://0177.0.0.1/a.jpg",
        "https://127.1/a.jpg",
        "https://[::1]/a.jpg",
        "https://[::ffff:127.0.0.1]/a.jpg",
    ],
)
def test_a_numeric_spelling_of_loopback_is_refused_by_the_address_gate(url, monkeypatch):
    """These reach the real resolver on purpose.

    `validate_image_url` lets an IP literal through — it checks structure, not
    reachability — so what refuses these is `getaddrinfo` expanding the
    spelling and the address predicate reading the result. Only the C library
    is exercised; no name is looked up and no packet is sent.
    """
    transport = _Transport(_Response()).install(monkeypatch)

    with pytest.raises(SafeImageFetchError, match="blocked_address"):
        fetch_image(url)
    assert transport.connections == []


@pytest.mark.parametrize(
    "address,why",
    [
        ("2a00:1450:4001:80e:0:5efe:10.0.0.1", "ISATAP, routable prefix, private"),
        ("2a00:1450:4001:80e:0:5efe:169.254.169.254", "ISATAP, routable, metadata"),
        ("2a00:1450:4001:80e:200:5efe:10.0.0.1", "ISATAP, routable, global IID"),
        ("::ffff:0:a9fe:a9fe", "IPv4-translated, metadata"),
        ("64:ff9b::169.254.169.254", "NAT64 well-known, metadata"),
    ],
)
def test_a_resolver_answering_an_embedded_destination_opens_no_socket(
    address, why, monkeypatch
):
    """Measured where the security review measured it, not at the predicate.

    `_is_blocked_ip` returning True is not the same claim as "nothing was
    dialled": the address travels through `_validated_addresses` and a pinned
    connection is constructed from it. A resolver answering with one of these
    is the shape a DNS-controlling attacker has, so the assertion is that the
    refusal happens with no connection object ever built.
    """
    transport = _Transport(_Response(), resolutions=None).install(monkeypatch)
    _stub_getaddrinfo(monkeypatch, {"attacker.example": [address]})

    with pytest.raises(SafeImageFetchError, match="blocked_address"):
        fetch_image("https://attacker.example/a.jpg")
    assert transport.connections == []


# --- the pinning itself -----------------------------------------------------


def test_the_socket_opens_to_the_pinned_address_and_keeps_the_tls_name(monkeypatch):
    """Connecting by hostname would re-resolve, which is the window pinning
    closes; wrapping with the pinned address as `server_hostname` would break
    certificate validation for every host."""
    opened = {}
    wrapped = {}

    class FakeSocket:
        def settimeout(self, value):
            opened["read_timeout"] = value

    def fake_create_connection(address, timeout):
        opened["address"] = address
        opened["connect_timeout"] = timeout
        return FakeSocket()

    class FakeContext:
        def wrap_socket(self, sock, server_hostname):
            wrapped["server_hostname"] = server_hostname
            return sock

    monkeypatch.setattr(socket, "create_connection", fake_create_connection)
    monkeypatch.setattr(ssl, "create_default_context", lambda: FakeContext())

    connection = _PinnedHTTPSConnection(
        "images.example.com",
        443,
        "93.184.216.34",
        connect_timeout=5.0,
        read_timeout=15.0,
    )
    connection.connect()

    assert opened["address"] == ("93.184.216.34", 443)
    assert opened["connect_timeout"] == 5.0
    assert opened["read_timeout"] == 15.0
    assert wrapped["server_hostname"] == "images.example.com"


# --- redirects --------------------------------------------------------------


def test_each_redirect_hop_is_resolved_and_pinned_again(monkeypatch):
    transport = _Transport(
        _Response(302, {"Location": "https://cdn.example.net/final.jpg"}),
        _Response(200, {"Content-Type": "image/jpeg"}, b"image bytes"),
        resolutions={
            "images.example.com": ["93.184.216.34"],
            "cdn.example.net": ["8.8.8.8"],
        },
    ).install(monkeypatch)

    result = fetch_image("https://images.example.com/start.jpg")

    assert result.body == b"image bytes"
    assert result.final_url == "https://cdn.example.net/final.jpg"
    assert transport.pinned == [
        ("images.example.com", "93.184.216.34"),
        ("cdn.example.net", "8.8.8.8"),
    ]


def test_a_redirect_to_a_blocked_address_is_refused_before_its_socket(monkeypatch):
    transport = _Transport(
        _Response(302, {"Location": "https://private.example/secret"}),
        resolutions={
            "public.example": ["93.184.216.34"],
            "private.example": ["10.0.0.2"],
        },
    ).install(monkeypatch)

    with pytest.raises(SafeImageFetchError, match="blocked_address"):
        fetch_image("https://public.example/start")
    assert transport.pinned == [("public.example", "93.184.216.34")]


def test_a_redirect_that_changes_scheme_away_from_https_is_refused(monkeypatch):
    transport = _Transport(
        _Response(302, {"Location": "http://public.example/plain"}),
        resolutions={"public.example": ["93.184.216.34"]},
    ).install(monkeypatch)

    with pytest.raises(SafeImageFetchError, match="invalid_url"):
        fetch_image("https://public.example/start")
    assert len(transport.connections) == 1


def test_a_redirect_without_a_location_is_refused(monkeypatch):
    _Transport(
        _Response(302),
        resolutions={"public.example": ["93.184.216.34"]},
    ).install(monkeypatch)

    with pytest.raises(SafeImageFetchError, match="redirect_rejected"):
        fetch_image("https://public.example/start")


def test_an_endless_redirector_stops_at_the_declared_limit(monkeypatch):
    """The refusal comes from the last iteration, not from the backstop below
    the loop — which the attempt count alone cannot tell apart, since both
    follow four hops. The two carry different details, so the detail is what
    says which one fired.
    """
    transport = _Transport(
        *[_Response(302, {"Location": "https://public.example/next"})] * 8,
        resolutions={"public.example": ["93.184.216.34"]},
    ).install(monkeypatch)

    with pytest.raises(SafeImageFetchError) as exc:
        fetch_image("https://public.example/start", max_redirects=3)

    assert exc.value.code == "redirect_rejected"
    assert exc.value.detail == "Redirect limit or Location is invalid"
    assert len(transport.connections) == 4


# --- the response -----------------------------------------------------------


def test_a_declared_content_length_over_the_limit_says_so(monkeypatch):
    """`SafeImageFetchError` subclasses `ValueError`, so raising it inside a
    `try` that handles `ValueError` from `int()` relabels it — and the operator
    reading the job's errors is told the header was invalid when it was not."""
    _Transport(
        _Response(200, {"Content-Length": "999999"}),
        resolutions={"images.example.com": ["93.184.216.34"]},
    ).install(monkeypatch)

    with pytest.raises(SafeImageFetchError) as exc:
        fetch_image("https://images.example.com/a.jpg", max_bytes=64)
    assert exc.value.code == "response_too_large"


def test_an_unparseable_content_length_is_a_fetch_failure(monkeypatch):
    _Transport(
        _Response(200, {"Content-Length": "not-a-number"}),
        resolutions={"images.example.com": ["93.184.216.34"]},
    ).install(monkeypatch)

    with pytest.raises(SafeImageFetchError) as exc:
        fetch_image("https://images.example.com/a.jpg")
    assert exc.value.code == "fetch_failed"


def test_a_content_length_that_lies_low_is_still_capped_while_reading(monkeypatch):
    _Transport(
        _Response(200, {"Content-Length": "8"}, b"x" * 4096),
        resolutions={"images.example.com": ["93.184.216.34"]},
    ).install(monkeypatch)

    with pytest.raises(SafeImageFetchError, match="response_too_large"):
        fetch_image("https://images.example.com/a.jpg", max_bytes=64)


def test_a_compressed_response_is_refused(monkeypatch):
    """`Accept-Encoding: identity` is a request, not a guarantee, and the byte
    cap counts what arrives on the wire rather than what it expands to."""
    _Transport(
        _Response(200, {"Content-Encoding": "gzip"}, b"\x1f\x8b"),
        resolutions={"images.example.com": ["93.184.216.34"]},
    ).install(monkeypatch)

    with pytest.raises(SafeImageFetchError, match="invalid_image"):
        fetch_image("https://images.example.com/a.jpg")


def test_an_identity_content_encoding_is_accepted(monkeypatch):
    _Transport(
        _Response(200, {"Content-Encoding": "identity"}, b"bytes"),
        resolutions={"images.example.com": ["93.184.216.34"]},
    ).install(monkeypatch)

    assert fetch_image("https://images.example.com/a.jpg").body == b"bytes"


def test_a_body_that_outlasts_the_total_timeout_is_abandoned(monkeypatch):
    """The per-read timeout bounds one read; nothing else bounds a server that
    answers slowly but never stalls."""
    _Transport(
        _Response(200, body=b"x" * 4096),
        resolutions={"images.example.com": ["93.184.216.34"]},
    ).install(monkeypatch)
    clock = iter([0.0, 100.0])
    monkeypatch.setattr(safe_image_fetch.time, "monotonic", lambda: next(clock))

    with pytest.raises(SafeImageFetchError, match="fetch_timeout"):
        fetch_image("https://images.example.com/a.jpg", total_timeout=20.0)


@pytest.mark.parametrize("status", [400, 404, 410, 500])
def test_a_non_success_status_is_a_fetch_failure(status, monkeypatch):
    _Transport(
        _Response(status),
        resolutions={"images.example.com": ["93.184.216.34"]},
    ).install(monkeypatch)

    with pytest.raises(SafeImageFetchError, match="fetch_failed"):
        fetch_image("https://images.example.com/a.jpg")


@pytest.mark.parametrize(
    "error,code",
    [
        (TimeoutError("slow"), "fetch_timeout"),
        (ConnectionResetError("reset"), "fetch_failed"),
        (http.client.BadStatusLine("garbage"), "fetch_failed"),
    ],
)
def test_a_transport_error_becomes_a_fetch_error(error, code, monkeypatch):
    _Transport(
        _Response(200, read_error=error),
        resolutions={"images.example.com": ["93.184.216.34"]},
    ).install(monkeypatch)

    with pytest.raises(SafeImageFetchError) as exc:
        fetch_image("https://images.example.com/a.jpg")
    assert exc.value.code == code


def test_the_connection_is_closed_on_the_failing_path_too(monkeypatch):
    transport = _Transport(
        _Response(500),
        resolutions={"images.example.com": ["93.184.216.34"]},
    ).install(monkeypatch)

    with pytest.raises(SafeImageFetchError):
        fetch_image("https://images.example.com/a.jpg")
    assert transport.closed == 1


# --- normalize_image --------------------------------------------------------


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


def test_a_transparent_image_is_written_as_png():
    source = Image.new("RGBA", (16, 16), (255, 0, 0, 0))
    raw = io.BytesIO()
    source.save(raw, format="PNG")

    normalized = normalize_image(raw.getvalue())

    assert (normalized.extension, normalized.mime_type) == (".png", "image/png")
    with Image.open(io.BytesIO(normalized.body)) as result:
        assert result.mode == "RGBA"


def test_a_pixel_count_over_the_limit_is_refused_before_the_pixels_are_read():
    """A small file can declare an enormous canvas, so the decision belongs to
    the header rather than to what the decode allocates.

    The body is truncated, which makes the order observable: `Image.open` still
    parses the header, but `load()` cannot finish. Refusing on the header gives
    `image_too_large`; reaching the decode first gives `invalid_image`, which is
    what the same bytes under a high limit return.
    """
    source = Image.new("RGB", (600, 600), "red")
    raw = io.BytesIO()
    source.save(raw, format="PNG")
    truncated = raw.getvalue()[:-256]

    with pytest.raises(SafeImageFetchError) as too_large:
        normalize_image(truncated, max_pixels=1000)
    with pytest.raises(SafeImageFetchError) as unreadable:
        normalize_image(truncated, max_pixels=10**9)

    assert too_large.value.code == "image_too_large"
    assert unreadable.value.code == "invalid_image"


def test_pillows_own_bomb_guard_is_reported_as_a_pixel_limit():
    """Pillow checks its own `MAX_IMAGE_PIXELS` inside `Image.open`, so for a
    canvas large enough it fires before this module reads the header at all.
    The limit is moved rather than building a fixture in the tens of
    megapixels; what is under test is that the escape maps to a code and not to
    a warning escaping as an error.
    """
    source = Image.new("RGB", (600, 600), "red")
    raw = io.BytesIO()
    source.save(raw, format="PNG")

    with pytest.raises(SafeImageFetchError, match="image_too_large"):
        with pytest.MonkeyPatch.context() as patch:
            patch.setattr(Image, "MAX_IMAGE_PIXELS", 1)
            normalize_image(raw.getvalue(), max_pixels=10**9)


def test_a_body_that_is_not_an_image_is_refused():
    with pytest.raises(SafeImageFetchError, match="invalid_image"):
        normalize_image(b"<html>not an image</html>")


# --- the seam ---------------------------------------------------------------


def test_the_public_entry_point_validates_the_url_it_is_handed(monkeypatch):
    """`fetch_and_normalize_image` takes a string, so nothing a caller checked
    earlier can stand in for the check here."""
    transport = _Transport(_Response(), resolutions=None).install(monkeypatch)
    _stub_getaddrinfo(monkeypatch, {"evil.example": ["10.0.0.7"]})

    with pytest.raises(SafeImageFetchError, match="blocked_address"):
        fetch_and_normalize_image("https://evil.example/a.jpg")
    assert transport.connections == []


def test_the_public_entry_point_returns_the_normalised_image(monkeypatch):
    source = io.BytesIO()
    Image.new("RGB", (24, 12), "blue").save(source, format="PNG")
    _Transport(
        _Response(200, {"Content-Type": "image/png"}, source.getvalue()),
        resolutions={"images.example.com": ["93.184.216.34"]},
    ).install(monkeypatch)

    result = fetch_and_normalize_image("https://images.example.com/a.png")

    assert (result.width, result.height) == (24, 12)
    assert result.mime_type == "image/jpeg"
