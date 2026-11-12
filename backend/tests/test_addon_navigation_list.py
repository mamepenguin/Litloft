"""SPEC-CORE-093: a manifest `navigation` may be a list of entrances.

Invariant ids are those of docs/specs/clips-app.md. A fixture catalogue, not
any real addon's manifest.
"""
import logging
import re

import pytest

from app.services import addon_registry
from tests.test_addon_navigation import PATHS, VALID_NAV, _meta, _register, manifests, registry  # noqa: F401

FIRST = {**VALID_NAV, "label": "Notes"}
SECOND = {**VALID_NAV, "label": "Clips", "icon": "newspaper", "priority": 21, "path": "clips"}


def _nav(c, name="navaddon"):
    return c.get("/api/addons/status").json()["addons"][name].get("navigation", "ABSENT")


def _entry(label, path=None, **extra):
    nav = {**VALID_NAV, "label": label, **extra}
    if path is not None:
        nav["path"] = path
    return nav


@pytest.mark.parametrize("path", PATHS)
class TestAcceptedLists:
    """SPEC-CORE-093 step 6, I10, I19."""

    def test_spec_core_093_a_two_entry_list_reaches_the_catalogue_as_a_list(self, client, registry, manifests, path):
        c, *_ = client
        _register(path, manifests, navaddon=_meta("navaddon", navigation=[FIRST, SECOND]))

        assert _nav(c) == [FIRST, SECOND]

    def test_spec_core_093_a_one_entry_list_stays_a_list(self, client, registry, manifests, path):
        c, *_ = client
        _register(path, manifests, navaddon=_meta("navaddon", navigation=[SECOND]))

        assert _nav(c) == [SECOND]

    def test_spec_core_093_four_entries_are_accepted(self, client, registry, manifests, path):
        c, *_ = client
        nav = [_entry("A"), _entry("B", "b"), _entry("C", "c"), _entry("D", "d")]
        _register(path, manifests, navaddon=_meta("navaddon", navigation=nav))

        assert _nav(c) == nav

    @pytest.mark.parametrize(
        "slug",
        ["a", "clips", "a-1", "a" + "b" * 39],
        ids=["one-char", "word", "digit-and-hyphen", "40-chars"],
    )
    def test_spec_core_093_a_slug_path_is_accepted(self, client, registry, manifests, path, slug):
        c, *_ = client
        nav = [FIRST, _entry("X", slug)]
        _register(path, manifests, navaddon=_meta("navaddon", navigation=nav))

        assert _nav(c) == nav


BAD_PATHS = [
    pytest.param("", id="empty"),
    pytest.param("1clips", id="leading-digit"),
    pytest.param("-clips", id="leading-hyphen"),
    pytest.param("Clips", id="upper-case"),
    pytest.param("clips/all", id="two-segments"),
    pytest.param("clips_x", id="underscore"),
    pytest.param("a" + "b" * 40, id="41-chars"),
    pytest.param(5, id="number"),
    pytest.param(None, id="null"),
    pytest.param(["clips"], id="list"),
]


@pytest.mark.parametrize("path", PATHS)
class TestDroppedElements:
    """SPEC-CORE-093 step 6, I10, I19: one bad element costs only that element."""

    @pytest.mark.parametrize("bad_path", BAD_PATHS)
    def test_spec_core_093_an_element_with_a_bad_path_is_dropped(self, client, registry, manifests, path, bad_path):
        c, *_ = client
        bad = {**VALID_NAV, "label": "Bad", "path": bad_path}
        _register(path, manifests, navaddon=_meta("navaddon", navigation=[FIRST, bad, SECOND]))

        assert _nav(c) == [FIRST, SECOND]

    def test_spec_core_093_an_element_failing_todays_checks_is_dropped(self, client, registry, manifests, path):
        c, *_ = client
        bad = {**SECOND, "path": "other", "placement": "views"}
        _register(path, manifests, navaddon=_meta("navaddon", navigation=[FIRST, bad, SECOND]))

        assert _nav(c) == [FIRST, SECOND]

    def test_spec_core_093_a_non_object_element_is_dropped(self, client, registry, manifests, path):
        c, *_ = client
        _register(path, manifests, navaddon=_meta("navaddon", navigation=["primary", SECOND]))

        assert _nav(c) == [SECOND]

    def test_spec_core_093_a_repeated_path_drops_the_later_element(self, client, registry, manifests, path):
        c, *_ = client
        later = {**SECOND, "label": "Later"}
        _register(path, manifests, navaddon=_meta("navaddon", navigation=[SECOND, FIRST, later]))

        assert _nav(c) == [SECOND, FIRST]

    def test_spec_core_093_two_absent_paths_count_as_a_repeat(self, client, registry, manifests, path):
        c, *_ = client
        later = {**FIRST, "label": "Later"}
        _register(path, manifests, navaddon=_meta("navaddon", navigation=[FIRST, SECOND, later]))

        assert _nav(c) == [FIRST, SECOND]


@pytest.mark.parametrize("path", PATHS)
class TestDroppedBlock:
    """SPEC-CORE-093 step 6, I19: the block goes and the addon stays."""

    @pytest.mark.parametrize(
        "nav",
        [
            pytest.param([], id="empty-list"),
            pytest.param(
                [_entry("A"), _entry("B", "b"), _entry("C", "c"), _entry("D", "d"), _entry("E", "e")],
                id="five-entries",
            ),
            pytest.param([{**FIRST, "placement": "views"}, {**SECOND, "path": "1x"}], id="no-survivor"),
            pytest.param("primary", id="string"),
            pytest.param(7, id="number"),
            pytest.param({**SECOND, "path": "Not A Slug"}, id="single-object-with-a-bad-path"),
        ],
    )
    def test_spec_core_093_the_block_is_dropped_and_the_addon_registered(self, client, registry, manifests, path, nav):
        c, *_ = client
        _register(
            path,
            manifests,
            badnav=_meta("badnav", navigation=nav),
            goodnav=_meta("goodnav", navigation=[FIRST, SECOND]),
        )

        body = c.get("/api/addons/status").json()

        assert "navigation" not in body["addons"]["badnav"]
        assert body["addons"]["badnav"]["href"] == "/drive/{drive}/addons/badnav"
        assert body["addons"]["goodnav"]["navigation"] == [FIRST, SECOND]


def test_spec_core_093_a_dropped_element_is_logged_with_the_addon_and_its_index(registry, caplog):
    nav = [FIRST, SECOND, {**VALID_NAV, "label": "Bad", "path": "9"}, {**SECOND, "path": "other"}]

    with caplog.at_level(logging.WARNING):
        addon_registry.register_in_process("navaddon", _meta("navaddon", navigation=nav))

    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    # The spec names the index without fixing its base, so 2 (from zero) and 3 (from one) both pass.
    assert any("navaddon" in m and re.search(r"\b[23]\b", m) for m in warnings), warnings
