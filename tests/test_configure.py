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
import re
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


def test_intelligence_mounts_core_data_dir_read_only(base, tmp_path):
    """The addon reads the core's data through one read-only DIRECTORY mount.

    Never per-file. SQLite runs the core DB in WAL mode and deletes
    data.db-wal / data.db-shm on a clean shutdown; bind-mounting those
    paths makes Docker create a directory in their place at the next
    `up`, and the backend then cannot open its own database.
    """
    intel = base / "addons" / "intelligence"
    intel.mkdir(parents=True)
    (intel / "search-config.yml.example").write_text("features:\n  rag: false\n")

    host = tmp_path / "media"
    host.mkdir()
    answers = ["1", str(host), "media", "3000", "y", "y"]
    proc = _run_configure(base, answers)
    assert proc.returncode == 0, proc.stderr + proc.stdout

    override = (base / "docker-compose.override.yml").read_text()
    assert "- ./data:/data:ro" in override
    # The DB is no longer renamed into place, so the addon is told where
    # it actually is.
    assert "- HOMEVAULT_DB_PATH=/data/data.db" in override


def test_intelligence_mount_masks_the_jwt_signing_key(base, tmp_path):
    """The data directory mount must not hand the addon the JWT key.

    data/.jwt_secret sits beside data.db. An addon that can read it can
    mint a token for any drive group (or __admin__) and call core write
    APIs, which defeats the read-only drive mounts entirely — see the
    compromised-addon threat model in
    .claude/rules/internal-api-policy.md.

    /dev/null is the mask because it always exists on the host, so it
    cannot itself become a Docker-created directory.
    """
    intel = base / "addons" / "intelligence"
    intel.mkdir(parents=True)
    (intel / "search-config.yml.example").write_text("features:\n  rag: false\n")

    host = tmp_path / "media"
    host.mkdir()
    answers = ["1", str(host), "media", "3000", "y", "y"]
    proc = _run_configure(base, answers)
    assert proc.returncode == 0, proc.stderr + proc.stdout

    override = (base / "docker-compose.override.yml").read_text()
    mounts = _mount_entries(override)
    assert "/dev/null:/data/.jwt_secret:ro" in mounts, (
        "./data is mounted without masking .jwt_secret — the addon can "
        "read the core's JWT signing key"
    )
    # The mask is only meaningful if it is applied after the directory.
    assert override.index("- ./data:/data:ro") < override.index(
        "- /dev/null:/data/.jwt_secret:ro"
    ), "the mask must come after the directory mount it overlays"

    # A bind mount needs an existing target. On a first run
    # data/.jwt_secret only appears once the backend has booted, so the
    # healthy gate is what makes the mask creatable at all — without it
    # container creation fails with
    # "openat .jwt_secret: read-only file system".
    assert "condition: service_healthy" in override, (
        "the .jwt_secret mask requires the backend to start first; "
        "depends_on ... service_healthy is load-bearing here"
    )


def _mount_entries(text: str) -> list[str]:
    """Volume entries only — prose that merely names a path is not a mount.

    Works on the generated override and on the commented-out template,
    so the same check can police both.
    """
    return [
        m.group(1)
        for m in (
            re.match(r"\s*(?:#\s*)?- (\S+:\S+)\s*$", line)
            for line in text.splitlines()
        )
        if m
    ]


@pytest.mark.parametrize(
    "sidecar",
    ["./data/data.db", "./data/data.db-wal", "./data/data.db-shm"],
)
def test_configure_never_bind_mounts_the_db_or_its_wal_sidecars(
    base, tmp_path, sidecar
):
    """Regression guard for the mount that took the whole stack down.

    A missing bind-mount source becomes a directory, so any per-file
    mount of the DB or its WAL sidecars is a latent outage.
    """
    intel = base / "addons" / "intelligence"
    intel.mkdir(parents=True)
    (intel / "search-config.yml.example").write_text("features:\n  rag: false\n")

    host = tmp_path / "media"
    host.mkdir()
    answers = ["1", str(host), "media", "3000", "y", "y"]
    proc = _run_configure(base, answers)
    assert proc.returncode == 0, proc.stderr + proc.stdout

    override = (base / "docker-compose.override.yml").read_text()
    offenders = [
        m for m in _mount_entries(override) if m.startswith(f"{sidecar}:")
    ]
    assert not offenders, (
        f"{sidecar} is bind-mounted per file ({offenders}); Docker will "
        "create a directory there whenever SQLite has checkpointed it away"
    )


def test_override_example_matches_configure_on_the_data_mount():
    """The template and the generator must not drift on this mount.

    The example is what a hand-editing operator copies; if it still
    shows per-file mounts the footgun survives in the docs.
    """
    example = (REPO_ROOT / "docker-compose.override.yml.example").read_text()
    mounts = _mount_entries(example)

    assert "./data:/data:ro" in mounts
    assert "/dev/null:/data/.jwt_secret:ro" in mounts
    assert "#     - HOMEVAULT_DB_PATH=/data/data.db" in example
    for sidecar in ("./data/data.db", "./data/data.db-wal",
                    "./data/data.db-shm"):
        offenders = [m for m in mounts if m.startswith(f"{sidecar}:")]
        assert not offenders, (
            f"{sidecar} still bind-mounted per file in the template: "
            f"{offenders}"
        )


# Every published place an operator can copy a compose recipe from.
# Review caught two of these drifting after the generator was fixed;
# pin them so the next edit cannot leave one behind.
_PUBLISHED_RECIPES = [
    "docker-compose.override.yml.example",
    "docs/admin-guide/docker-compose.md",
    "docs/addons/intelligence.md",
    "docs/ADDON-DEVELOPMENT.md",
]


@pytest.mark.parametrize("relpath", _PUBLISHED_RECIPES)
def test_published_recipes_never_mount_the_db_per_file(relpath):
    mounts = _mount_entries((REPO_ROOT / relpath).read_text())
    for sidecar in ("./data/data.db", "./data/data.db-wal",
                    "./data/data.db-shm"):
        offenders = [m for m in mounts if m.startswith(f"{sidecar}:")]
        assert not offenders, (
            f"{relpath} still bind-mounts {sidecar} per file: {offenders}"
        )


@pytest.mark.parametrize("relpath", _PUBLISHED_RECIPES)
def test_published_recipes_mask_the_jwt_key_wherever_data_is_mounted(relpath):
    """Any recipe exposing ./data must mask the signing key in the same block.

    A recipe that mounts the data directory without the mask hands a
    compromised addon the ability to mint __admin__ tokens.
    """
    mounts = _mount_entries((REPO_ROOT / relpath).read_text())
    if "./data:/data:ro" not in mounts:
        pytest.skip(f"{relpath} does not mount the core data directory")
    assert "/dev/null:/data/.jwt_secret:ro" in mounts, (
        f"{relpath} mounts ./data without masking .jwt_secret"
    )


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
