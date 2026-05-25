"""Tests for the shrunk configure.py bootstrap.

configure.py is stdlib-only and is NOT copied into the backend test Docker
image, so these run locally:

    python3 -m pytest tests/test_configure.py

Strategy: copy configure.py into an isolated tmp ``base`` (so addon
presence and generated artifacts are fully controlled), feed the
interactive prompts via stdin as a subprocess, then assert the generated
files.

Spec 2026-05-19-gui-first-setup-cli-bootstrap §3.2 / plan 1a — after
shrinking, configure.py must:

- prompt only host_path + slug per drive, port, and addon yes/no
- write drives.json as an empty [] (footgun guard, no logical content)
- write passwords.json as an empty [] (same footgun guard; [] is
  semantically identical to "no passwords" = all drives public)
- NOT create data/setup_completed (reversal: /setup must run)
- copy search-config.yml.example verbatim when intelligence enabled
- write override.yml with <host_path>:/app/drives/<slug> mounts
- write override.yml with the core thumbnail directory mounted read-only
  into intelligence when intelligence is enabled
- write override.yml with an unconditional RW (no :ro) passwords.json
  bind-mount so /setup and /admin/settings can write it later
- keep event-hooks.json generation untouched
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIGURE_SRC = REPO_ROOT / "configure.py"


@pytest.fixture()
def base(tmp_path):
    """Isolated working tree with configure.py copied in."""
    shutil.copy2(CONFIGURE_SRC, tmp_path / "configure.py")
    return tmp_path


def _run_configure(base: Path, answers: list[str]) -> subprocess.CompletedProcess:
    """Run configure.py in ``base`` feeding ``answers`` to stdin."""
    proc = subprocess.run(
        [sys.executable, str(base / "configure.py")],
        cwd=str(base),
        input="\n".join(answers) + "\n",
        text=True,
        capture_output=True,
        timeout=60,
    )
    return proc


# ── core bootstrap (no addons) ─────────────────────────────────────────────


def test_minimal_run_writes_empty_drives_json(base, tmp_path):
    host = tmp_path / "media"
    host.mkdir()
    # Prompts (shrunk): drive count, host path, slug, port, generate? = y
    answers = [
        "1",            # how many drives
        str(host),      # host path
        "media",        # slug
        "3000",         # port
        "y",            # generate files?
    ]
    proc = _run_configure(base, answers)
    assert proc.returncode == 0, proc.stderr + proc.stdout

    drives_file = base / "drives.json"
    assert drives_file.exists()
    assert json.loads(drives_file.read_text()) == []


def test_minimal_run_does_not_create_setup_completed(base, tmp_path):
    host = tmp_path / "media"
    host.mkdir()
    answers = ["1", str(host), "media", "3000", "y"]
    proc = _run_configure(base, answers)
    assert proc.returncode == 0, proc.stderr + proc.stdout

    sentinel = base / "data" / "setup_completed"
    assert not sentinel.exists(), "configure.py must NOT touch setup_completed (reversal)"


def test_minimal_run_writes_empty_passwords_json(base, tmp_path):
    """Phase 2 §5.9: configure.py now writes an empty [] passwords.json.

    [] is semantically identical to "no passwords" (auth.load_passwords()
    treats absent and [] the same = all drives public). The single-file
    bind-mount needs a real host file so /setup / /admin/settings can
    write it later without hitting the directory footgun.
    """
    host = tmp_path / "media"
    host.mkdir()
    answers = ["1", str(host), "media", "3000", "y"]
    proc = _run_configure(base, answers)
    assert proc.returncode == 0, proc.stderr + proc.stdout

    pw_file = base / "passwords.json"
    assert pw_file.exists(), "configure.py must generate passwords.json (footgun guard)"
    assert json.loads(pw_file.read_text()) == []


def test_override_yml_has_rw_passwords_mount(base, tmp_path):
    """passwords.json must be mounted RW (no :ro) and unconditionally.

    :ro is incompatible with GUI writes (EBUSY / rejected). The mount is
    unconditional regardless of access mode because /setup may create the
    first password entry.
    """
    host = tmp_path / "media"
    host.mkdir()
    answers = ["1", str(host), "media", "3000", "y"]
    proc = _run_configure(base, answers)
    assert proc.returncode == 0, proc.stderr + proc.stdout

    override = (base / "docker-compose.override.yml").read_text()
    assert "- ./passwords.json:/app/passwords.json" in override
    # Must NOT be read-only.
    assert "./passwords.json:/app/passwords.json:ro" not in override


def test_override_yml_has_slug_mount(base, tmp_path):
    host = tmp_path / "myphotos"
    host.mkdir()
    answers = ["1", str(host), "photos", "3000", "y"]
    proc = _run_configure(base, answers)
    assert proc.returncode == 0, proc.stderr + proc.stdout

    override = (base / "docker-compose.override.yml").read_text()
    assert f"{host}:/app/drives/photos" in override


def test_slug_default_is_slugified_basename(base, tmp_path):
    host = tmp_path / "My Media Drive"
    host.mkdir()
    # Accept default slug (blank input) -> slugify(basename(host_path)).
    answers = ["1", str(host), "", "3000", "y"]
    proc = _run_configure(base, answers)
    assert proc.returncode == 0, proc.stderr + proc.stdout

    override = (base / "docker-compose.override.yml").read_text()
    assert f"{host}:/app/drives/my_media_drive" in override


def test_non_default_port_written_to_env(base, tmp_path):
    host = tmp_path / "media"
    host.mkdir()
    answers = ["1", str(host), "media", "8080", "y"]
    proc = _run_configure(base, answers)
    assert proc.returncode == 0, proc.stderr + proc.stdout

    env = (base / ".env").read_text()
    assert "LITLOFT_PORT=8080" in env


def test_two_drives_distinct_slugs(base, tmp_path):
    h1 = tmp_path / "a"
    h2 = tmp_path / "b"
    h1.mkdir()
    h2.mkdir()
    answers = [
        "2",
        str(h1), "alpha",
        str(h2), "beta",
        "3000",
        "y",
    ]
    proc = _run_configure(base, answers)
    assert proc.returncode == 0, proc.stderr + proc.stdout

    override = (base / "docker-compose.override.yml").read_text()
    assert f"{h1}:/app/drives/alpha" in override
    assert f"{h2}:/app/drives/beta" in override
    assert json.loads((base / "drives.json").read_text()) == []


# ── intelligence addon: search-config copied verbatim ──────────────────────


def test_intelligence_copies_search_config_verbatim(base, tmp_path):
    # Provide an intelligence addon with an example config.
    intel = base / "addons" / "intelligence"
    intel.mkdir(parents=True)
    example = intel / "search-config.yml.example"
    example_body = (
        "# Copy to search-config.yml and customize as needed.\n"
        "features:\n"
        '  auto_tags: "false"\n'
        '  summaries: "false"\n'
        "llm:\n"
        '  provider: "disabled"\n'
    )
    example.write_text(example_body)

    host = tmp_path / "media"
    host.mkdir()
    # drive count, host, slug, port, configure intelligence? y, generate? y
    answers = ["1", str(host), "media", "3000", "y", "y"]
    proc = _run_configure(base, answers)
    assert proc.returncode == 0, proc.stderr + proc.stdout

    generated = (intel / "search-config.yml").read_text()
    assert generated == example_body, "search-config.yml must be a verbatim copy"
    # No logical content was rewritten.
    assert json.loads((base / "drives.json").read_text()) == []
    assert not (base / "data" / "setup_completed").exists()


def test_intelligence_mounts_core_thumbnails_read_only(base, tmp_path):
    intel = base / "addons" / "intelligence"
    intel.mkdir(parents=True)
    (intel / "search-config.yml.example").write_text("features:\n  rag: false\n")

    host = tmp_path / "media"
    host.mkdir()
    answers = ["1", str(host), "media", "3000", "y", "y"]
    proc = _run_configure(base, answers)
    assert proc.returncode == 0, proc.stderr + proc.stdout

    override = (base / "docker-compose.override.yml").read_text()
    assert "- ./data/thumbnails:/data/thumbnails:ro" in override


def test_intelligence_disabled_still_no_search_config_rewrite(base, tmp_path):
    intel = base / "addons" / "intelligence"
    intel.mkdir(parents=True)
    (intel / "search-config.yml.example").write_text("features:\n  rag: false\n")

    host = tmp_path / "media"
    host.mkdir()
    # Decline configuring intelligence.
    answers = ["1", str(host), "media", "3000", "n", "y"]
    proc = _run_configure(base, answers)
    assert proc.returncode == 0, proc.stderr + proc.stdout

    assert not (intel / "search-config.yml").exists()

    override = (base / "docker-compose.override.yml").read_text()
    assert "./data/thumbnails:/data/thumbnails:ro" not in override
