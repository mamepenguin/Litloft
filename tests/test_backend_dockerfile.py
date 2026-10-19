"""The addon copy step of backend/Dockerfile.

Runs the step's shell script on the host, against a fake build tree, so it
needs neither Docker nor a build:

    python3 -m pytest tests/test_backend_dockerfile.py

UNSPEC: an addon under `addons/` that has a `backend/` directory is in the
backend image, whether or not `backend/addons/` exists on the host
(docs/addons/cloud-sync.md, Installation).
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

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
