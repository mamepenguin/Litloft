"""How configure.py presents the addons, and that presenting them changes no output.

Run in-process (see ``configure_scenarios.py``) so each prompt is recorded as
asked rather than recovered from interleaved stdout.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

import configure_scenarios as cs

FIXTURES = Path(__file__).parent / "fixtures" / "configure"

# A fresh tree with every kind of addon present, every prompt answered with Enter.
PROMPTS_FRESH = [
    "How many drives? [1]:",
    "Host path (absolute) [{BASE}/videos]:",
    "Slug (path identifier) [videos]:",
    "Port [3000]:",
    "Enable intelligence addon? [Y/n]:",
    "LLM_API_KEY (optional, Enter to skip):",
    "Enable knowledge addon? [y/N]:",
    "Generate files? [Y/n]:",
]

INTELLIGENCE_PROMPT = "Enable intelligence addon?"


def _fresh(base: Path, scenario: str = "all_declined") -> Path:
    host = cs.build_tree(base, scenario)
    (base / ".env").unlink(missing_ok=True)
    return host


def _prompt_for(prompts: list[str], question: str) -> str:
    [line] = [p for p in prompts if p.startswith(question)]
    return line


def test_prompts_are_asked_in_order_with_their_defaults(tmp_path, monkeypatch):
    _fresh(tmp_path)
    prompts, _ = cs.run(tmp_path, [], monkeypatch)
    assert [p.replace(str(tmp_path), "{BASE}") for p in prompts] == PROMPTS_FRESH


@pytest.mark.parametrize(
    ("override", "expected"),
    [
        (None, "[Y/n]"),
        ("services:\n  backend:\n    volumes: []\n", "[y/N]"),
        ("services:\n  backend:\n    volumes: []\n  intelligence:\n    build: x\n", "[Y/n]"),
    ],
    ids=["no wiring", "wiring without intelligence", "wiring with intelligence"],
)
def test_intelligence_default_follows_existing_wiring(tmp_path, monkeypatch, override, expected):
    _fresh(tmp_path)
    if override is not None:
        (tmp_path / "docker-compose.override.yml").write_text(override)
    prompts, _ = cs.run(tmp_path, [], monkeypatch)
    assert _prompt_for(prompts, INTELLIGENCE_PROMPT).endswith(f"{expected}:")


@pytest.mark.parametrize(
    ("override", "expected"),
    [
        (None, "[y/N]"),
        ("services:\n  backend:\n    volumes: []\n  knowledge:\n    build: x\n", "[Y/n]"),
    ],
    ids=["no wiring", "wiring with knowledge"],
)
def test_knowledge_default_follows_existing_wiring(tmp_path, monkeypatch, override, expected):
    _fresh(tmp_path)
    if override is not None:
        (tmp_path / "docker-compose.override.yml").write_text(override)
    prompts, _ = cs.run(tmp_path, [], monkeypatch)
    assert _prompt_for(prompts, "Enable knowledge addon?").endswith(f"{expected}:")


def test_enter_enables_intelligence_on_a_fresh_install(tmp_path, monkeypatch):
    host = _fresh(tmp_path)
    cs.run(tmp_path, ["1", str(host), "media", "3000", "", "", "n", "y"], monkeypatch)
    assert "\n  intelligence:\n" in (tmp_path / "docker-compose.override.yml").read_text()
    assert (tmp_path / "addons" / "intelligence" / "search-config.yml").exists()


@pytest.mark.parametrize("scenario", sorted(cs.ANSWERS))
def test_generated_files_match_the_declared_outputs(tmp_path, monkeypatch, scenario):
    host = cs.build_tree(tmp_path, scenario)
    answers = [a.replace(cs.HOST_PLACEHOLDER, str(host)) for a in cs.ANSWERS[scenario]]
    cs.run(tmp_path, answers, monkeypatch)

    declared = json.loads((FIXTURES / scenario / "outputs.json").read_text())
    expected = {
        rel: None if name is None else (FIXTURES / scenario / name).read_text()
        for rel, name in declared.items()
    }
    assert cs.read_outputs(tmp_path, host) == expected


def test_the_declared_outputs_cover_every_scenario():
    assert sorted(p.name for p in FIXTURES.iterdir()) == sorted(cs.ANSWERS)
    assert len(cs.ANSWERS) == 3


def test_bundled_addons_are_listed_by_directory_and_change_nothing(tmp_path, monkeypatch):
    with_bundled = tmp_path / "with"
    without = tmp_path / "without"
    with_bundled.mkdir()
    without.mkdir()
    runs = {}
    for base in (with_bundled, without):
        host = cs.build_tree(base, "all_declined")
        if base is without:
            shutil.rmtree(base / "addons" / "media_import")
            shutil.rmtree(base / "addons" / "cloud-sync")
        answers = [a.replace(cs.HOST_PLACEHOLDER, str(host)) for a in cs.ANSWERS["all_declined"]]
        prompts, printed = cs.run(base, answers, monkeypatch)
        runs[base] = (
            [p.replace(str(base), "{BASE}") for p in prompts],
            printed,
            cs.read_outputs(base, host),
        )

    assert runs[with_bundled][0] == runs[without][0]
    assert runs[with_bundled][2] == runs[without][2]
    listed = [line.strip() for line in runs[with_bundled][1].splitlines() if line.strip().startswith("- ")]
    assert listed == ["- cloud-sync", "- media_import"]
    assert not any(line.strip().startswith("- ") for line in runs[without][1].splitlines())


BUNDLED_NOTE = "turned off per drive at /setup"


@pytest.mark.parametrize(
    ("scenario", "noted"),
    [("all_declined", True), ("all_enabled", False)],
)
def test_the_summary_notes_bundled_addons_only_when_both_services_are_declined(
    tmp_path, monkeypatch, scenario, noted
):
    host = cs.build_tree(tmp_path, scenario)
    answers = [a.replace(cs.HOST_PLACEHOLDER, str(host)) for a in cs.ANSWERS[scenario]]
    _, printed = cs.run(tmp_path, answers, monkeypatch)
    assert (BUNDLED_NOTE in printed) is noted


def test_an_absent_addon_has_no_prompt_and_no_entry(tmp_path, monkeypatch):
    host = cs.build_tree(tmp_path, "no_addons")
    answers = [a.replace(cs.HOST_PLACEHOLDER, str(host)) for a in cs.ANSWERS["no_addons"]]
    prompts, printed = cs.run(tmp_path, answers, monkeypatch)
    assert not any("intelligence" in p or "knowledge" in p for p in prompts)
    assert not any(line.strip().startswith("- ") for line in printed.splitlines())
    assert BUNDLED_NOTE not in printed
