"""configure.py leaves the files /setup and /admin/settings own.

SPEC-CORE-004 covers passwords.json and drives.json, SPEC-CORE-005
addons/intelligence/search-config.yml. Run in-process (see
``configure_scenarios.py``) so prompts and printed lines keep their order.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

import configure_scenarios as cs

PASSWORDS = '[{"password": "family-secret", "groups": ["family"]}]\n'
DRIVES = '[{"slug": "media", "name": "Family videos", "groups": ["family"]}]\n'
SEARCH_CONFIG = "features:\n  rag: true\n# edited in the GUI\n"
EXAMPLE = "features:\n  rag: false\n"
MARKER = "2026-10-01T00:00:00\n"

FILES = {
    "passwords.json": PASSWORDS,
    "drives.json": DRIVES,
    "addons/intelligence/search-config.yml": SEARCH_CONFIG,
}
SHORT = {
    "passwords.json": "passwords.json",
    "drives.json": "drives.json",
    "addons/intelligence/search-config.yml": "search-config.yml",
}
WRITTEN = {
    "passwords.json": [],
    "drives.json": [],
    "addons/intelligence/search-config.yml": EXAMPLE,
}

AFTER_SETUP = "marker"
BEFORE_SETUP_STATES = ["no data dir", "data dir without marker"]


def _tree(base: Path, state: str, existing=tuple(FILES)) -> Path:
    host = cs.build_tree(base, "all_enabled")
    if state == AFTER_SETUP:
        (base / "data").mkdir()
        (base / "data" / "setup_completed").write_text(MARKER)
    elif state == "data dir without marker":
        (base / "data").mkdir()
    for rel in existing:
        (base / rel).write_text(FILES[rel])
    return host


def _answers(host: Path, tail: str, generate: str = "y") -> list[str]:
    # intelligence on, no API key, knowledge off; then every later prompt gets `tail`.
    return ["1", str(host), "media", "3000", "y", "", "n", generate] + [tail] * 8


def _prompts(events) -> list[str]:
    return [text for kind, text in events if kind == "prompt"]


def _after_generate(events) -> list[str]:
    idx = next(i for i, (k, t) in enumerate(events) if k == "prompt" and t.startswith("Generate files?"))
    return [t for k, t in events[idx + 1 :] if k == "print"]


def _summary(events) -> list[str]:
    lines = [t for k, t in events if k == "print"]
    start = next(i for i, t in enumerate(lines) if "Files to generate:" in t)
    end = next(i for i, t in enumerate(lines) if i > start and "Drive mounts:" in t)
    return [t.strip() for t in lines[start + 1 : end] if t.strip()]


def _written(path: Path):
    text = path.read_text()
    return json.loads(text) if path.suffix == ".json" else text


def _naming(lines: list[str], name: str) -> list[str]:
    return [line for line in lines if name in line]


# SPEC-CORE-004 (I1, I2, I4, I9, I10), SPEC-CORE-005 (I3, I4)
@pytest.mark.parametrize("tail", ["y", "n"])
def test_after_setup_gui_files_are_unchanged_and_not_asked_about_whatever_the_answers(
    tmp_path, monkeypatch, tail
):
    host = _tree(tmp_path, AFTER_SETUP)
    events = cs.run_events(tmp_path, _answers(host, tail), monkeypatch)

    for name in SHORT.values():
        assert not [p for p in _prompts(events) if name in p], name

    for rel, body in FILES.items():
        assert (tmp_path / rel).read_text() == body, rel
    assert (tmp_path / "data" / "setup_completed").read_text() == MARKER
    override = (tmp_path / "docker-compose.override.yml").read_text()
    assert "- ./passwords.json:/app/passwords.json" in override
    assert "./passwords.json:/app/passwords.json:ro" not in override


# SPEC-CORE-004 (I7, item 1 step 5, item 9), SPEC-CORE-005 (I7)
def test_after_setup_each_kept_file_prints_one_kept_line(tmp_path, monkeypatch):
    host = _tree(tmp_path, AFTER_SETUP)
    events = cs.run_events(tmp_path, _answers(host, "y"), monkeypatch)
    out = _after_generate(events)

    for rel, name in SHORT.items():
        [line] = _naming(out, name)
        assert "kept" in line.lower(), line
        if rel != "addons/intelligence/search-config.yml":
            assert "/admin/settings" in line, line


# SPEC-CORE-004 (I8, item 1 step 6)
def test_after_setup_kept_drives_json_points_to_admin_settings_for_changed_mounts(tmp_path, monkeypatch):
    host = _tree(tmp_path, AFTER_SETUP)
    events = cs.run_events(tmp_path, _answers(host, "y"), monkeypatch)
    out = _after_generate(events)
    note = "\n".join(
        line for line in out if "passwords.json" not in line and "search-config.yml" not in line
    )

    assert "/admin/settings" in note
    assert "Drives" in note
    assert "mount" in note.lower()


# SPEC-CORE-004 (item 1 step 6, item 2 unparsable drives.json)
@pytest.mark.parametrize("drives_body", ["[]\n", "{not json\n"], ids=["empty list", "unparsable"])
def test_the_drives_note_is_the_same_whatever_drives_json_holds(tmp_path, monkeypatch, drives_body):
    runs = {}
    for label, body in (("reference", DRIVES), ("other", drives_body)):
        base = tmp_path / label
        base.mkdir()
        host = _tree(base, AFTER_SETUP)
        (base / "drives.json").write_text(body)
        events = cs.run_events(base, _answers(host, "y"), monkeypatch)
        runs[label] = [line.replace(str(base), "{BASE}") for line in _after_generate(events)]
        assert (base / "drives.json").read_text() == body

    assert runs["reference"] == runs["other"]


# SPEC-CORE-004 (I7, item 3 summary), SPEC-CORE-005 (I7)
def test_after_setup_summary_lists_existing_gui_files_as_kept(tmp_path, monkeypatch):
    host = _tree(tmp_path, AFTER_SETUP)
    events = cs.run_events(tmp_path, _answers(host, "y"), monkeypatch)
    summary = _summary(events)

    for name in ("passwords.json", "drives.json"):
        [line] = _naming(summary, name)
        assert re.fullmatch(rf"{re.escape(name)}\s+\(kept — edited in /admin/settings\)", line), line
    [line] = _naming(summary, "search-config.yml")
    assert re.fullmatch(r"addons/intelligence/search-config\.yml\s+\(kept\)", line), line


# SPEC-CORE-004 (I1, I4, I6, item 2 no data dir), SPEC-CORE-005 (I6)
@pytest.mark.parametrize("state", BEFORE_SETUP_STATES)
def test_before_setup_yes_resets_drives_and_search_config_but_keeps_passwords(tmp_path, monkeypatch, state):
    host = _tree(tmp_path, state)
    events = cs.run_events(tmp_path, _answers(host, "y"), monkeypatch)
    prompts = _prompts(events)

    assert (tmp_path / "passwords.json").read_text() == PASSWORDS
    assert json.loads((tmp_path / "drives.json").read_text()) == []
    assert (tmp_path / "addons/intelligence/search-config.yml").read_text() == EXAMPLE
    assert not [p for p in prompts if "passwords.json" in p]
    for name in ("drives.json", "search-config.yml"):
        [prompt] = [p for p in prompts if name in p]
        assert prompt == f"{name} already exists. Overwrite? [y/N]:"
    assert not (tmp_path / "data" / "setup_completed").exists()


# SPEC-CORE-004 (I1, I6, I7, item 1 step 5), SPEC-CORE-005 (I6)
@pytest.mark.parametrize("state", BEFORE_SETUP_STATES)
def test_before_setup_enter_keeps_everything_and_prints_only_the_passwords_line(tmp_path, monkeypatch, state):
    host = _tree(tmp_path, state)
    events = cs.run_events(tmp_path, _answers(host, ""), monkeypatch)
    out = _after_generate(events)

    for rel, body in FILES.items():
        assert (tmp_path / rel).read_text() == body, rel
    assert not _naming(out, "drives.json")
    assert not _naming(out, "search-config.yml")
    [line] = _naming(out, "passwords.json")
    assert "kept" in line.lower() and "/admin/settings" in line, line


# SPEC-CORE-004 (item 3 summary), SPEC-CORE-005 (item 3 summary)
@pytest.mark.parametrize("state", BEFORE_SETUP_STATES)
def test_before_setup_summary_keeps_prompted_lines_and_lists_passwords_as_kept(tmp_path, monkeypatch, state):
    host = _tree(tmp_path, state)
    events = cs.run_events(tmp_path, _answers(host, "n"), monkeypatch)
    summary = _summary(events)

    [pw] = _naming(summary, "passwords.json")
    assert re.fullmatch(r"passwords\.json\s+\(kept — edited in /admin/settings\)", pw), pw
    assert _naming(summary, "drives.json") == ["drives.json     (empty — drives are named at /setup)"]
    assert _naming(summary, "search-config.yml") == ["addons/intelligence/search-config.yml"]


TODAY_SUMMARY = {
    "passwords.json": "passwords.json  (empty — passwords are set at /setup)",
    "drives.json": "drives.json     (empty — drives are named at /setup)",
    "addons/intelligence/search-config.yml": "addons/intelligence/search-config.yml",
}

MISSING_CASES = [
    (AFTER_SETUP, "passwords.json"),
    (AFTER_SETUP, "drives.json"),
    (AFTER_SETUP, "addons/intelligence/search-config.yml"),
    ("no data dir", "drives.json"),
    ("no data dir", "addons/intelligence/search-config.yml"),
]


# SPEC-CORE-004 (I1, I2, I5, item 3), SPEC-CORE-005 (I3, I5, item 3)
@pytest.mark.parametrize(("state", "missing"), MISSING_CASES)
def test_a_missing_gui_file_is_written_and_the_existing_ones_follow_the_table(tmp_path, monkeypatch, state, missing):
    existing = [rel for rel in FILES if rel != missing]
    host = _tree(tmp_path, state, existing=existing)
    events = cs.run_events(tmp_path, _answers(host, "y"), monkeypatch)

    written = tmp_path / missing
    assert written.is_file()
    assert _written(written) == WRITTEN[missing]
    assert _naming(_summary(events), SHORT[missing]) == [TODAY_SUMMARY[missing]]

    for rel in existing:
        if rel == "passwords.json" or state == AFTER_SETUP:
            assert (tmp_path / rel).read_text() == FILES[rel], rel
        else:
            assert _written(tmp_path / rel) == WRITTEN[rel], rel


DIRECTORY_CASES = [
    (AFTER_SETUP, "passwords.json"),
    (AFTER_SETUP, "drives.json"),
    (AFTER_SETUP, "addons/intelligence/search-config.yml"),
    ("no data dir", "passwords.json"),
]


# SPEC-CORE-004 (I11, item 2 directory), SPEC-CORE-005 (I11)
@pytest.mark.parametrize(("state", "as_dir"), DIRECTORY_CASES)
def test_a_kept_file_that_is_a_directory_does_not_stop_the_run(tmp_path, monkeypatch, state, as_dir):
    existing = [rel for rel in FILES if rel != as_dir]
    host = _tree(tmp_path, state, existing=existing)
    (tmp_path / as_dir).mkdir()

    events = cs.run_events(tmp_path, _answers(host, "y"), monkeypatch)

    assert (tmp_path / as_dir).is_dir()
    [line] = _naming(_after_generate(events), SHORT[as_dir])
    assert "kept" in line.lower(), line
    assert (tmp_path / ".env").exists()
    assert (tmp_path / "docker-compose.override.yml").exists()


# SPEC-CORE-004 (item 2 aborted run, item 3 summary), SPEC-CORE-005 (item 3 summary)
def test_a_run_aborted_after_setup_lists_kept_files_and_writes_nothing(tmp_path, monkeypatch):
    host = _tree(tmp_path, AFTER_SETUP)
    events = cs.run_events(tmp_path, _answers(host, "y", generate="n"), monkeypatch)

    for rel, body in FILES.items():
        assert (tmp_path / rel).read_text() == body, rel
    assert not (tmp_path / "docker-compose.override.yml").exists()
    assert not [line for line in _after_generate(events) if "kept" in line.lower()]
    assert any("(kept" in line for line in _summary(events))
