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
knowledge is not in core's CI matrix. Rows that go missing from *this* copy
are caught by the count and by the three structural assertions below — the
prefix forms, the prefix-independent forms, and the IPv4 categories. Rows
deleted from both copies at once are reachable from no test in either
repository.
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
    ("2a00:1450:4001:80e:0:5efe:10.0.0.1",
     "ISATAP under a routable prefix, wrapping private"),
    ("2a00:1450:4001:80e:0:5efe:169.254.169.254",
     "ISATAP under a routable prefix, wrapping the metadata address"),
    ("2a00:1450:4001:80e:200:5efe:10.0.0.1",
     "ISATAP under a routable prefix, globally-unique interface identifier"),
    ("2a00:1450:4001:80e:0:5efe:100.64.0.1",
     "a routable /64 carrying CGNAT in its interface identifier"),
    ("::ffff:0:7f00:1", "IPv4-translated wrapping loopback"),
    ("::ffff:0:a00:1", "IPv4-translated wrapping private"),
    ("::ffff:0:a9fe:a9fe", "IPv4-translated wrapping the metadata address"),
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
    ("2a00:1450:4001:80e:0:5efe:8.8.8.8",
     "ISATAP under a routable prefix, wrapping a public address"),
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
    assert len(MUST_BLOCK) == 46
    assert len(MUST_ALLOW) == 9
    assert len({address for address, _ in MUST_BLOCK + MUST_ALLOW}) == 55


# How each embedding is recognised. A form that *is* a prefix is refused by the
# prefix it sits in; ISATAP is an interface identifier and rides under any /64,
# so where it is declared decides whether a row exercises it at all.
PREFIX_FORMS = {
    "ipv4-mapped": ipaddress.ip_network("::ffff:0:0/96"),
    "ipv4-compatible": ipaddress.ip_network("::/96"),
    "ipv4-translated": ipaddress.ip_network("::ffff:0:0:0/96"),
    "nat64-well-known": ipaddress.ip_network("64:ff9b::/96"),
    "nat64-local-use": ipaddress.ip_network("64:ff9b:1::/48"),
    "6to4": ipaddress.ip_network("2002::/16"),
    "teredo": ipaddress.ip_network("2001::/32"),
}
# ISATAP's marker, declared here and imported from neither implementation — the
# value the rule turns on belongs on the declaration side, so moving either copy
# fails.
ISATAP_MARKER = 0x5EFE

# The rows the marker must find, declared rather than counted. One of them says
# nothing about ISATAP in its annotation, so selecting rows out of the free text
# beside them fails this instead of only failing some later reword.
ISATAP_ROWS = frozenset({
    "fe80::5efe:10.0.0.1",
    "2a00:1450:4001:80e:0:5efe:10.0.0.1",
    "2a00:1450:4001:80e:0:5efe:169.254.169.254",
    "2a00:1450:4001:80e:200:5efe:10.0.0.1",
    "2a00:1450:4001:80e:0:5efe:100.64.0.1",
})


def _is_isatap(address: str) -> bool:
    """Select on the marker alone, deliberately.

    Selecting on the flag values too would make them unfalsifiable here:
    dropping a value would drop the row carrying it, and the test would pass
    over a narrower population. The flags are asserted below instead, against
    the rows the marker finds.
    """
    ip = ipaddress.ip_address(address)
    if ip.version != 6:
        return False
    return (int(ip) >> 32) & 0xFFFF == ISATAP_MARKER


def _isatap_flag(address: str) -> int:
    return (int(ipaddress.ip_address(address)) >> 48) & 0xFFFF


# Selected by structure, for the same reason the IPv4 categories are: a row
# picked out of the free text beside it is picked by a comment, and this is the
# test that exists because a form was believed covered on the strength of one.
PREFIX_INDEPENDENT_FORMS = {"isatap": (_is_isatap, ISATAP_ROWS)}


def _carrying_address_refuses_itself(address: str) -> bool:
    """Would this row be refused without the embedding being understood?

    This is about the row, not about either implementation: it asks whether
    some property of the address that does the carrying already condemns it. A
    row for which this is True proves nothing about the form it is named for.
    """
    ip = ipaddress.ip_address(address)
    return not ip.is_global or ip.is_multicast or ip.is_reserved


def test_every_prefix_form_keeps_at_least_one_row():
    """A form that is a prefix is refused by the prefix, and that is correct.

    What this holds is that no form loses all its rows: deleting a form's rows
    fails it however the counts are written. It does not reach the other
    direction — a form added to the implementation and not to this list changes
    nothing here.
    """
    blocked = [ipaddress.ip_address(a) for a, _ in MUST_BLOCK]
    covered = {
        name
        for name, network in PREFIX_FORMS.items()
        if any(ip.version == 6 and ip in network for ip in blocked)
    }
    assert covered == set(PREFIX_FORMS)


def test_a_prefix_independent_form_is_declared_under_a_routable_prefix():
    """The row that made `isatap` look covered was `fe80::5efe:10.0.0.1`.

    It is refused for being link-local, which is true of every address in
    `fe80::/10` and says nothing about ISATAP. The same interface identifier
    under a routable /64 was reachable in both implementations, cloud metadata
    included, while a test asserted the form was represented.

    So for a form carried in the interface identifier, at least one row must be
    one that the carrying address does not condemn on its own — which is also
    the only thing that makes the extraction observable from the tables.
    """
    for name, (matches, expected_rows) in PREFIX_INDEPENDENT_FORMS.items():
        rows = [a for a, _ in MUST_BLOCK if matches(a)]
        assert set(rows) == expected_rows
        routable = [a for a in rows if not _carrying_address_refuses_itself(a)]
        assert routable, (
            f"every {name} row is refused by its carrying address; "
            "none of them exercises the form"
        )
        # RFC 5214 §6.1 defines two interface identifiers and no more:
        # `0000:5efe:` for an embedded private IPv4, `0200:5efe:` for a global
        # one (u bit set). Both have to be present, and the set is written out
        # rather than read off the rows.
        assert {_isatap_flag(a) for a in rows} == {0x0000, 0x0200}


@pytest.mark.parametrize(
    "address,payload",
    [
        ("::ffff:10.0.0.1", "10.0.0.1"),
        ("64:ff9b::10.0.0.1", "10.0.0.1"),
        ("64:ff9b::169.254.169.254", "169.254.169.254"),
        ("::10.0.0.1", "10.0.0.1"),
        ("::ffff:0:a9fe:a9fe", "169.254.169.254"),
        ("2002:0a00:0001::1", "10.0.0.1"),
        ("2a00:1450:4001:80e:0:5efe:169.254.169.254", "169.254.169.254"),
        ("2a00:1450:4001:80e:200:5efe:10.0.0.1", "10.0.0.1"),
        ("2606:2800:220:1:248:1893:25c8:1946", None),
        ("2a00:1450:4001:80e::200e", None),
        ("fe80::1", None),
    ],
)
def test_the_embedded_destination_is_extracted_from_every_form(address, payload):
    """Pins the extraction form by form, including the two with no prefix to
    lean on.

    For the prefix forms this is defence in depth: the carrying address is
    already condemned by its own properties, so removing the extraction refuses
    those rows anyway. For ISATAP under a routable prefix it is the whole
    defence, which is why the block table now carries such a row —
    `test_a_prefix_independent_form_is_declared_under_a_routable_prefix` is
    what keeps it there.
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


def test_the_routability_helper_answers_both_directions():
    """`_carrying_address_refuses_itself` is a transcription, not an import.

    Nothing ties it to either implementation, so a clause added to one of them
    leaves it behind. The direction that matters is the one that fails quietly:
    if it wrongly called a link-local carrier routable, the test above would
    accept round 1's mistake — `fe80::5efe:10.0.0.1` — as proof that ISATAP is
    exercised. The other direction is safe, because no routable row then leaves
    that test with nothing to find.

    Both rows are declared, and each is asserted to still be in the table it
    came from, so deleting either fails here rather than quietly weakening the
    check.
    """
    condemned = "fe80::5efe:10.0.0.1"
    routable = "2606:2800:220:1:248:1893:25c8:1946"
    assert condemned in {address for address, _ in MUST_BLOCK}
    assert routable in {address for address, _ in MUST_ALLOW}

    assert _carrying_address_refuses_itself(condemned) is True
    assert _carrying_address_refuses_itself(routable) is False
