"""`configure.py` and the compose template, exercised rather than read.

Neither had any coverage: they live above `backend/`, and the test image's
build context stopped there. Three review rounds on the webhook-secret work
found three bugs in them, and every one was the same shape — one path fixed,
its parallel left behind:

    round 1  addon gate scoped     generator still unwired
    round 2  generator wired       backend half of the pair missing
    round 3  generator complete    hand-written template still one-sided

The feature has two axes, sender/receiver and generated/hand-written, and
each fix covered one axis while leaving the other. So these tests assert the
pairing across both, in all four places it has to hold.
"""

import importlib.util
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

REPO = Path("/app/_repo")
CONFIGURE = REPO / "configure.py"
TEMPLATE = REPO / "docker-compose.override.yml.example"

SECRET = "SEARCH_WEBHOOK_SECRET"

pytestmark = pytest.mark.skipif(
    not CONFIGURE.exists(),
    reason="repo-root files are only present in the test image",
)


def _load_configure():
    spec = importlib.util.spec_from_file_location("configure_under_test", CONFIGURE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _make_repo(tmp_path: Path, *, declares: bool) -> Path:
    """A scratch tree shaped like the project, with one drive and one addon."""
    (tmp_path / "docker-compose.yml").write_text("services:\n  backend: {}\n")
    addon = tmp_path / "addons" / "intelligence"
    addon.mkdir(parents=True)
    hook = {
        "event": "scan.complete",
        "url": "http://intelligence:8100/webhook/scan-complete",
    }
    if declares:
        hook["secret_env"] = SECRET
    (addon / "manifest.json").write_text(json.dumps({"event_hooks": [hook]}))
    (addon / "search-config.yml.example").write_text("llm: {}\n")
    (tmp_path / "srv").mkdir()
    # `configure.py` resolves everything from `Path(__file__).parent`, not
    # the working directory, so it has to sit at the root of the tree it is
    # configuring — which is how it is actually shipped and run.
    shutil.copy(CONFIGURE, tmp_path / "configure.py")
    return tmp_path


def _run_configure(repo: Path) -> subprocess.CompletedProcess:
    """Drive the wizard: one drive, default port, intelligence on, no start.

    The exit status is part of what is asserted. `configure.py` writes
    `event-hooks.json` and the override file *before* it persists the
    generated secret to `.env`, so a crash in that last step — or its
    removal — leaves every file-shaped assertion above still passing while
    both containers interpolate an empty value and the gate silently drops
    back to a no-op. Swallowing the return code hides exactly that.
    """
    answers = "\n".join(
        ["1", str(repo / "srv"), "", "", "y", "", "y", "n"]
    ) + "\n"
    proc = subprocess.run(
        [sys.executable, str(repo / "configure.py")],
        cwd=repo,
        input=answers,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert proc.returncode == 0, (
        f"configure.py exited {proc.returncode}\n"
        f"--- stdout ---\n{proc.stdout}\n--- stderr ---\n{proc.stderr}"
    )
    return proc


def _env_values(repo: Path) -> dict[str, str]:
    """`.env` as a dict. Absent file means nothing was written."""
    env_file = repo / ".env"
    if not env_file.exists():
        return {}
    values = {}
    for line in env_file.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip()
    return values


def _services_with(text: str, variable: str) -> set[str]:
    """Which service blocks actually set `variable` in their environment.

    Matches the assignment (`- NAME=`), never a bare mention. Prose next to
    the setting explains why both halves are needed and therefore contains
    the name — searching for the name alone reports a variable as present
    in a block whose only reference is the comment saying it must be. The
    first draft of this helper did exactly that and waved through the very
    bug it was written for.

    Works on the template as well as generated output: the template's lines
    are commented out, and a reader uncommenting them is the case that
    broke.
    """
    entry = re.compile(rf"^\s*#?\s*-\s*{re.escape(variable)}=")
    service = None
    found: set[str] = set()
    for line in text.splitlines():
        match = re.match(r"^\s*#?\s{0,3}([a-z_]+):\s*$", line)
        if match and match.group(1) in {
            "backend",
            "frontend",
            "intelligence",
            "knowledge",
        }:
            service = match.group(1)
        if service and entry.match(line):
            found.add(service)
    return found


class TestGeneratedCompose:
    def test_both_sides_receive_the_secret(self, tmp_path):
        """Core builds the header in the backend container.

        Passing the value only to the addon leaves core sending
        unauthenticated requests to a service now rejecting them: all seven
        webhooks 403, and indexing stops with no other symptom.
        """
        repo = _make_repo(tmp_path, declares=True)
        _run_configure(repo)

        override = (repo / "docker-compose.override.yml").read_text()
        assert _services_with(override, SECRET) == {"backend", "intelligence"}

    def test_neither_side_receives_it_without_the_declaration(self, tmp_path):
        """A stale `.env` must not arm the receiver on its own.

        The guard used to decide only whether a *new* value was generated,
        while the compose line was written unconditionally — so a value left
        over from an earlier run, or a submodule rolled back to a manifest
        without `secret_env`, rearmed the addon while core sent nothing.
        """
        repo = _make_repo(tmp_path, declares=False)
        (repo / ".env").write_text(f"{SECRET}=left-over-from-before\n")
        _run_configure(repo)

        override = (repo / "docker-compose.override.yml").read_text()
        assert _services_with(override, SECRET) == set()

    def test_the_generated_file_is_valid_yaml(self, tmp_path):
        repo = _make_repo(tmp_path, declares=True)
        _run_configure(repo)

        doc = yaml.safe_load((repo / "docker-compose.override.yml").read_text())
        assert "services" in doc

    def test_event_hooks_carry_the_declaration(self, tmp_path):
        """The other half of the pair: core only sends the header when the
        listener asks for it."""
        repo = _make_repo(tmp_path, declares=True)
        _run_configure(repo)

        hooks = json.loads((repo / "event-hooks.json").read_text())["hooks"]
        listeners = [h for entries in hooks.values() for h in entries]
        assert listeners
        assert all(h.get("secret_env") == SECRET for h in listeners)


class TestGeneratedEnv:
    """The compose lines interpolate `${SEARCH_WEBHOOK_SECRET:-}`.

    Both containers can therefore be wired perfectly and still end up with
    an empty value on both sides — which is the no-op the gate had before
    any of this work. The generated `.env` is the other half of the wiring
    and needs asserting on its own.
    """

    def test_a_secret_is_generated(self, tmp_path):
        repo = _make_repo(tmp_path, declares=True)
        _run_configure(repo)

        secret = _env_values(repo).get(SECRET)
        assert secret, f".env has no usable {SECRET}: {secret!r}"
        # `gen_secret()` is `os.urandom(32).hex()`. Pinning the shape keeps
        # a placeholder or a truncated write from passing as a secret.
        assert re.fullmatch(r"[0-9a-f]{64}", secret), secret

    def test_an_existing_secret_is_reused(self, tmp_path):
        """Rerunning the wizard must not rotate a live secret.

        A new value in `.env` alone would not break anything at rest, but
        it does at runtime: the containers keep the old one until they are
        recreated, and whichever half restarts first starts 403ing.
        """
        repo = _make_repo(tmp_path, declares=True)
        existing = "a" * 64
        (repo / ".env").write_text(f"{SECRET}={existing}\n")
        _run_configure(repo)

        assert _env_values(repo)[SECRET] == existing

    def test_no_secret_is_written_without_the_declaration(self, tmp_path):
        """The guard covers `.env` as well as the compose file.

        Nothing interpolates the leftover value once the compose lines are
        gone, but rewriting it would still hand the next run — against a
        manifest that does declare `secret_env` — a value the addon never
        agreed to, and would say the wizard armed something it did not.
        """
        repo = _make_repo(tmp_path, declares=False)
        (repo / ".env").write_text(f"{SECRET}=left-over-from-before\n")
        _run_configure(repo)

        assert _env_values(repo)[SECRET] == "left-over-from-before"


class TestManifestGuard:
    @pytest.mark.parametrize(
        "hooks,expected",
        [
            ([{"event": "e", "url": "u", "secret_env": SECRET}], True),
            ([{"event": "e", "url": "u"}], False),
            # One unguarded listener fails exactly like none of them, so a
            # partial declaration has to count as no.
            (
                [
                    {"event": "a", "url": "u", "secret_env": SECRET},
                    {"event": "b", "url": "v"},
                ],
                False,
            ),
            ([], False),
        ],
    )
    def test_declaration_must_be_complete(self, tmp_path, hooks, expected):
        addon = tmp_path / "addons" / "intelligence"
        addon.mkdir(parents=True)
        (addon / "manifest.json").write_text(json.dumps({"event_hooks": hooks}))

        configure = _load_configure()
        assert (
            configure.addon_declares_secret_env(tmp_path, "intelligence", SECRET)
            is expected
        )

    def test_missing_manifest_is_not_a_crash(self, tmp_path):
        configure = _load_configure()
        assert (
            configure.addon_declares_secret_env(tmp_path, "intelligence", SECRET)
            is False
        )

    def test_unreadable_manifest_is_not_a_crash(self, tmp_path):
        addon = tmp_path / "addons" / "intelligence"
        addon.mkdir(parents=True)
        (addon / "manifest.json").write_text("{ this is not json")

        configure = _load_configure()
        assert (
            configure.addon_declares_secret_env(tmp_path, "intelligence", SECRET)
            is False
        )


class TestHandWrittenTemplate:
    """The template is a second implementation of the same contract.

    `configure.py` generating it correctly says nothing about the file a
    reader copies by hand, and that gap is what round three found.
    """

    def test_both_sides_are_present(self):
        text = TEMPLATE.read_text()
        assert _services_with(text, SECRET) == {"backend", "intelligence"}

    def test_the_backend_needs_the_addon_url_too(self):
        text = TEMPLATE.read_text()
        assert "backend" in _services_with(text, "INTELLIGENCE_SERVICE_URL")

    def test_it_is_valid_yaml_as_shipped(self):
        doc = yaml.safe_load(TEMPLATE.read_text())
        assert "services" in doc
