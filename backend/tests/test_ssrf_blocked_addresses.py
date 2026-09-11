"""Core's half of the SSRF address contract.

The rule "which IP addresses may an image fetch reach" is implemented twice:
``app.services.safe_image_fetch._is_blocked_ip`` here, and ``_is_blocked_ip``
in ``addons/knowledge/app/services/fetcher.py``, which runs in its own
container and cannot import this one. The knowledge half of this file is
``addons/knowledge/tests/test_blocked_addresses.py``.

**The two tables below are declared answers, not a comparison.** Checking one
implementation against the other is green whenever both are wrong the same way,
which is the likely drift: the second copy was written by reading the first.
Each side is checked against the literal instead.

What this cannot hold: nothing mechanically compares the two copies of the
table. Neither test image can see the other repository's source — knowledge's
``Dockerfile.test`` has the addon repository as its build context, and
knowledge is not in core's CI matrix. The count and the two category
assertions below catch rows that go missing from *this* copy; rows deleted from
both copies at once are not reachable from any test in either repository.
"""

import ipaddress

import pytest

from app.services.safe_image_fetch import _embedded_ipv4, _is_blocked_ip

# Every address an image fetch must refuse, with what makes it dangerous.
MUST_BLOCK = [
    ("127.0.0.1", "IPv4 loopback"),
    ("10.0.0.1", "IPv4 private 10/8"),
    ("172.16.0.5", "IPv4 private 172.16/12"),
    ("192.168.1.1", "IPv4 private 192.168/16"),
    ("169.254.169.254", "IPv4 link-local, the cloud metadata address"),
    ("100.64.0.1", "IPv4 CGNAT, which is_private does not flag"),
    ("0.0.0.0", "IPv4 unspecified"),
    ("224.0.0.1", "IPv4 multicast all-hosts"),
    ("239.255.255.250", "IPv4 multicast, SSDP"),
    ("240.0.0.1", "IPv4 reserved 240/4"),
    ("255.255.255.255", "IPv4 broadcast"),
    ("192.0.2.1", "IPv4 TEST-NET-1"),
    ("198.51.100.7", "IPv4 TEST-NET-2"),
    ("203.0.113.9", "IPv4 TEST-NET-3"),
    ("::1", "IPv6 loopback"),
    ("::", "IPv6 unspecified"),
    ("fe80::1", "IPv6 link-local"),
    ("fc00::1", "IPv6 unique local"),
    ("ff02::1", "IPv6 multicast, link-local scope"),
    ("ff05::1:3", "IPv6 multicast, site-local scope"),
    ("2001:db8::1", "IPv6 documentation"),
    ("::ffff:127.0.0.1", "IPv4-mapped loopback"),
    ("::ffff:10.0.0.1", "IPv4-mapped private"),
    ("::ffff:169.254.169.254", "IPv4-mapped metadata address"),
    ("::ffff:100.64.0.1", "IPv4-mapped CGNAT"),
    ("::ffff:224.0.0.1", "IPv4-mapped multicast"),
    ("64:ff9b::10.0.0.1", "NAT64 well-known prefix wrapping private"),
    ("64:ff9b::127.0.0.1", "NAT64 well-known prefix wrapping loopback"),
    ("64:ff9b::169.254.169.254", "NAT64 well-known prefix wrapping metadata"),
    ("64:ff9b::8.8.8.8", "NAT64 well-known prefix wrapping a public address"),
    ("64:ff9b:1::10.0.0.1", "NAT64 local-use prefix wrapping private"),
    ("::10.0.0.1", "IPv4-compatible wrapping private"),
    ("::127.0.0.1", "IPv4-compatible wrapping loopback"),
    ("::169.254.169.254", "IPv4-compatible wrapping metadata"),
    ("::8.8.8.8", "IPv4-compatible wrapping a public address"),
    ("2002:0a00:0001::1", "6to4 wrapping private"),
    ("2002:7f00:0001::1", "6to4 wrapping loopback"),
    ("2001:0:0:0:0:0:0a00:0001", "Teredo"),
    ("fe80::5efe:10.0.0.1", "ISATAP wrapping private"),
]

# Real, routable addresses an image fetch must keep reaching. A predicate that
# blocks everything satisfies the table above and nothing here.
MUST_ALLOW = [
    ("93.184.216.34", "example.com, IPv4"),
    ("8.8.8.8", "public resolver, IPv4"),
    ("1.1.1.1", "public resolver, IPv4"),
    ("140.82.121.4", "github.com, IPv4"),
    ("2606:2800:220:1:248:1893:25c8:1946", "example.com, IPv6"),
    ("2001:4860:4860::8888", "public resolver, IPv6"),
    ("2a00:1450:4001:80e::200e", "public host, IPv6"),
    ("::ffff:8.8.8.8", "IPv4-mapped public address"),
]


@pytest.mark.parametrize(
    "address", [pytest.param(a, id=f"{a} - {why}") for a, why in MUST_BLOCK]
)
def test_declared_blocked_addresses_are_refused(address):
    assert _is_blocked_ip(address) is True


@pytest.mark.parametrize(
    "address", [pytest.param(a, id=f"{a} - {why}") for a, why in MUST_ALLOW]
)
def test_declared_allowed_addresses_are_reachable(address):
    assert _is_blocked_ip(address) is False


def test_the_declared_population_is_the_size_it_says():
    """A table that quietly loses rows still passes every case it still holds.

    Both counts are declared here rather than derived from the lists, so
    shrinking either list fails this. The knowledge half keeps its own copy of
    both numbers: changing a list here means changing them there.
    """
    assert len(MUST_BLOCK) == 39
    assert len(MUST_ALLOW) == 8
    assert len({address for address, _ in MUST_BLOCK + MUST_ALLOW}) == 47


def test_every_ipv6_embedding_form_is_represented():
    """The gaps this table closed were found by enumerating the embedding forms.

    An address that carries an IPv4 payload can hide a private destination
    behind flags that describe only the wrapper, so each form a payload can
    arrive in needs a row. What this holds is that every form named here keeps
    at least one row: deleting a form's rows fails it however the counts are
    written. It does not reach the other direction — a form added to the
    implementation and not to this list changes nothing here.
    """
    forms = {
        "ipv4-mapped": ipaddress.ip_network("::ffff:0:0/96"),
        "ipv4-compatible": ipaddress.ip_network("::/96"),
        "nat64-well-known": ipaddress.ip_network("64:ff9b::/96"),
        "nat64-local-use": ipaddress.ip_network("64:ff9b:1::/48"),
        "6to4": ipaddress.ip_network("2002::/16"),
        "teredo": ipaddress.ip_network("2001::/32"),
        "isatap": ipaddress.ip_network("fe80::5efe:0:0/96"),
    }
    blocked = [ipaddress.ip_address(a) for a, _ in MUST_BLOCK]
    covered = {
        name
        for name, network in forms.items()
        if any(ip.version == 6 and ip in network for ip in blocked)
    }
    assert covered == set(forms)


@pytest.mark.parametrize(
    "address,payload",
    [
        ("::ffff:10.0.0.1", "10.0.0.1"),
        ("64:ff9b::10.0.0.1", "10.0.0.1"),
        ("64:ff9b::169.254.169.254", "169.254.169.254"),
        ("::10.0.0.1", "10.0.0.1"),
        ("2002:0a00:0001::1", "10.0.0.1"),
        ("2606:2800:220:1:248:1893:25c8:1946", None),
        ("fe80::1", None),
    ],
)
def test_the_embedded_destination_is_extracted_from_every_form(address, payload):
    """Pins that the extraction happens; no row of the block table needs it.

    It is defence in depth — on this interpreter the carrying address's own
    properties already refuse every blocked row, which the PR body measures —
    so this assertion is what stops it being read as dead code. What it holds
    is the extraction, not any verdict.
    """
    result = _embedded_ipv4(ipaddress.IPv6Address(address))
    assert result == (ipaddress.IPv4Address(payload) if payload else None)


def test_every_ipv4_category_the_gate_refuses_is_represented():
    """The counts are one assertion, and no assertion holds its own form.

    These are the reasons rows are in the block table, declared as a set and
    matched by prefix rather than by the text beside each address, so the
    population cannot be walked back past them however the counts are written.
    IPv6 rows are held by the embedding-form test instead, and only bare IPv4
    addresses count here — a mapped row standing in for a category would let
    the plain one be deleted.
    """
    categories = {
        "loopback": [ipaddress.ip_network("127.0.0.0/8")],
        "private": [
            ipaddress.ip_network("10.0.0.0/8"),
            ipaddress.ip_network("172.16.0.0/12"),
            ipaddress.ip_network("192.168.0.0/16"),
        ],
        "link-local": [ipaddress.ip_network("169.254.0.0/16")],
        "cgnat": [ipaddress.ip_network("100.64.0.0/10")],
        "unspecified": [ipaddress.ip_network("0.0.0.0/32")],
        "multicast": [ipaddress.ip_network("224.0.0.0/4")],
        "reserved": [ipaddress.ip_network("240.0.0.0/4")],
        "broadcast": [ipaddress.ip_network("255.255.255.255/32")],
        "documentation": [
            ipaddress.ip_network("192.0.2.0/24"),
            ipaddress.ip_network("198.51.100.0/24"),
            ipaddress.ip_network("203.0.113.0/24"),
        ],
    }
    blocked = [ipaddress.ip_address(address) for address, _ in MUST_BLOCK]
    bare_v4 = [ip for ip in blocked if ip.version == 4]
    covered = {
        name
        for name, networks in categories.items()
        if any(ip in network for ip in bare_v4 for network in networks)
    }
    assert covered == set(categories)


def test_an_unparseable_address_is_refused():
    """`_is_blocked_ip` takes the string a resolver handed back.

    The knowledge copy takes a parsed object, so it has no counterpart here:
    its caller parses the resolver's answer and refuses what will not parse.
    """
    assert _is_blocked_ip("not-an-address") is True
    assert _is_blocked_ip("") is True
