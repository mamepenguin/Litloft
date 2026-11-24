"""The addon copy step of backend/Dockerfile.

Runs the step's shell script on the host, against a fake build tree, so it
needs neither Docker nor a build:

    python3 -m pytest tests/test_backend_dockerfile.py

UNSPEC: an addon under `addons/` that has a `backend/` directory is in the
backend image, whether or not `backend/addons/` exists on the host
(docs/addons/cloud-sync.md, Installation).
"""
from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

import pytest

DOCKERFILE = Path(__file__).resolve().parent.parent / "backend" / "Dockerfile"
STAGING = "/tmp/_all_addons"


def _copy_step() -> str:
    """The RUN instruction that copies the staged addons, as one shell line."""
    text = DOCKERFILE.read_text().replace("\\\n", " ")
    runs = [
        line[len("RUN "):]
        for line in text.splitlines()
        if line.startswith("RUN ") and STAGING in line
    ]
    assert len(runs) == 1, f"expected one RUN using {STAGING}, found {len(runs)}"
    return runs[0]


def _addon(root: Path, name: str, *, backend: bool, manifest: bool) -> None:
    addon = root / name
    addon.mkdir(parents=True)
    if backend:
        (addon / "backend").mkdir()
        (addon / "backend" / "__init__.py").write_text("")
    if manifest:
        (addon / "manifest.json").write_text("{}")


def _run_copy_step(tmp_path: Path, *, host_addons_dir: bool) -> Path:
    """Run the step as RUN does (`sh -c`, no `-e`) with WORKDIR at ``tmp_path/app``.

    Returns the image's ``addons/``.
    """
    app = tmp_path / "app"
    app.mkdir()
    if host_addons_dir:
        # What `COPY backend/addon[s]/ ./addons/` leaves when setup-addons.sh ran.
        (app / "addons").mkdir()
    staging = tmp_path / "all_addons"
    # cloud-sync sorts first and has a backend but no manifest.
    _addon(staging, "cloud-sync", backend=True, manifest=False)
    _addon(staging, "intelligence", backend=False, manifest=True)
    _addon(staging, "media_import", backend=True, manifest=False)

    script = re.sub(re.escape(STAGING), str(staging), _copy_step())
    subprocess.run(["sh", "-c", script], cwd=app, check=True)
    return app / "addons"


def test_backend_addons_copied_without_host_addons_dir(tmp_path: Path) -> None:
    addons = _run_copy_step(tmp_path, host_addons_dir=False)

    assert (addons / "cloud-sync" / "__init__.py").is_file()
    assert (addons / "media_import" / "__init__.py").is_file()
    assert (addons / "intelligence" / "manifest.json").is_file()


def test_backend_addons_copied_with_host_addons_dir(tmp_path: Path) -> None:
    addons = _run_copy_step(tmp_path, host_addons_dir=True)

    assert (addons / "cloud-sync" / "__init__.py").is_file()
    assert (addons / "media_import" / "__init__.py").is_file()
    assert (addons / "intelligence" / "manifest.json").is_file()


REPO = DOCKERFILE.parent.parent
JS_RUNTIMES = ("node", "nodejs", "deno", "bun", "quickjs")
FAKE_PIP = """#!/bin/sh
req=""
while [ $# -gt 0 ]; do
  if [ "$1" = "-r" ]; then req="$2"; shift; fi
  shift
done
echo "pip $(basename "$(dirname "$req")")" >> "$ADDON_STEP_LOG"
if grep -q FAIL "$req"; then
  echo "FAKE-PIP-ERROR $(basename "$(dirname "$req")")" >&2
  exit 1
fi
"""


def _addon_names() -> set[str]:
    names = set(re.findall(r"path\s*=\s*addons/(\S+)", (REPO / ".gitmodules").read_text()))
    names.update(p.name for p in (REPO / "addons").iterdir() if p.is_dir())
    return names | {n.replace("_", "-") for n in names} | {n.replace("-", "_") for n in names}


def test_spec_addon_142_i7_the_backend_image_files_name_no_addon_and_no_js_runtime() -> None:
    """SPEC-ADDON-142 I7: the runtime is declared by the addon, not by core."""
    for path in (DOCKERFILE, REPO / "backend" / "requirements.txt"):
        text = path.read_text().lower()
        for word in sorted(_addon_names()) + list(JS_RUNTIMES):
            assert not re.search(rf"(?<![\w-]){re.escape(word.lower())}(?![\w])", text), (
                f"{path.name} names {word!r}"
            )


def _install_steps() -> list[str]:
    """The RUN instructions that install the addons' own dependencies, in file order."""
    text = DOCKERFILE.read_text().replace("\\\n", " ")
    steps = [
        line[len("RUN "):]
        for line in text.splitlines()
        if line.startswith("RUN ")
        and STAGING not in line
        and "addons/" in line
        and ("requirements.txt" in line or "install.sh" in line)
    ]
    joined = " ".join(steps)
    assert "requirements.txt" in joined and "install.sh" in joined, steps
    return steps


def _install_addon(app: Path, name: str, *, req: str | None, install: str | None) -> None:
    addon = app / "addons" / name
    addon.mkdir(parents=True)
    (addon / "__init__.py").write_text("")
    if req is not None:
        (addon / "requirements.txt").write_text("FAIL\n" if req == "fail" else "# ok\n")
    if install is not None:
        code = 1 if install == "fail" else 0
        (addon / "install.sh").write_text(
            f'echo "install {name}" >> "$ADDON_STEP_LOG"\n'
            + (f'echo "FAKE-INSTALL-ERROR {name}" >&2\n' if code else "")
            + f"exit {code}\n"
        )


def _run_install_steps(tmp_path: Path, addons: dict[str, tuple[str | None, str | None]]):
    """Run the steps as `docker build` does: each with `sh -c`, stopping at the first failure.

    Returns the last step's exit code, the steps' output with stderr merged, and the
    log of which pip installs and install.sh scripts ran.
    """
    app = tmp_path / "app"
    (app / "addons").mkdir(parents=True)
    (app / "addons" / "__init__.py").write_text("")
    for name, (req, install) in addons.items():
        _install_addon(app, name, req=req, install=install)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for pip in ("pip", "pip3"):
        (bin_dir / pip).write_text(FAKE_PIP)
        (bin_dir / pip).chmod(0o755)
    log = tmp_path / "steps.log"
    log.write_text("")
    env = {
        **os.environ,
        "PATH": f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}",
        "ADDON_STEP_LOG": str(log),
    }
    code, output = 0, ""
    for step in _install_steps():
        done = subprocess.run(
            ["sh", "-c", step], cwd=app, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        code, output = done.returncode, output + done.stdout
        if code != 0:
            break
    return code, output, log.read_text().splitlines()


@pytest.mark.parametrize(
    "addons",
    [
        pytest.param({}, id="no-addon"),
        pytest.param({"photo_diary": (None, None)}, id="backend-dir-with-neither-file"),
        pytest.param(
            {"cloud-sync": ("ok", "ok"), "media_import": ("ok", None), "photo_diary": (None, None)},
            id="every-install-succeeds",
        ),
    ],
)
def test_spec_core_139_i8_the_install_steps_succeed_when_every_install_succeeds(
    tmp_path: Path, addons,
) -> None:
    """SPEC-CORE-139 I8: exit 0 with no addon, with neither file, and when all succeed."""
    code, output, ran = _run_install_steps(tmp_path, addons)

    assert code == 0, output
    expected = {f"pip {n}" for n, (req, _) in addons.items() if req} | {
        f"install {n}" for n, (_, install) in addons.items() if install
    }
    assert sorted(ran) == sorted(expected)


@pytest.mark.parametrize(
    "addons, failing, untried",
    [
        pytest.param(
            {"a_first": ("fail", None), "b_later": ("ok", "ok")},
            "FAKE-PIP-ERROR a_first", ["pip b_later", "install b_later"],
            id="requirements-fails-before-one-that-succeeds",
        ),
        pytest.param(
            {"a_first": ("ok", None), "b_last": ("fail", None)},
            "FAKE-PIP-ERROR b_last", [],
            id="requirements-fails-last",
        ),
        pytest.param(
            {"a_first": (None, "fail"), "b_later": (None, "ok")},
            "FAKE-INSTALL-ERROR a_first", ["install b_later"],
            id="install-sh-fails-before-one-that-succeeds",
        ),
        pytest.param(
            {"a_first": (None, "ok"), "b_last": (None, "fail")},
            "FAKE-INSTALL-ERROR b_last", [],
            id="install-sh-fails-last",
        ),
    ],
)
def test_spec_core_139_i8_a_failed_addon_install_fails_the_build(
    tmp_path: Path, addons, failing, untried,
) -> None:
    """SPEC-CORE-139 I8 and item 2: non-zero, the failing command's output last, later addons untried."""
    code, output, ran = _run_install_steps(tmp_path, addons)

    assert code != 0, output
    assert [line for line in output.splitlines() if line.strip()][-1] == failing
    for entry in untried:
        assert entry not in ran
