"""Runs configure.py in-process against a controlled tree, recording every prompt.

Shared by the presentation tests and by nothing else; kept out of
test_configure.py so the declared outputs under ``fixtures/configure/`` can be
regenerated from a named commit with the same runner.
"""
from __future__ import annotations

import builtins
import importlib.util
import json
import shutil
from pathlib import Path

HOST_PLACEHOLDER = "{HOST}"

OUTPUTS = [
    "docker-compose.override.yml",
    ".env",
    "event-hooks.json",
    "drives.json",
    "passwords.json",
    "addons/intelligence/search-config.yml",
]


def _hooked_manifest(addon: str, port: int) -> dict:
    return {
        "type": "external_service",
        "event_hooks": [
            {"event": "files.purged", "url": f"http://{addon}:{port}/webhook/files-purged"},
        ],
    }


def build_tree(base: Path, scenario: str) -> Path:
    """Lays out addons and prior files for `scenario`; returns the drive's host dir."""
    host = base / "media-host"
    host.mkdir()
    if scenario in ("all_enabled", "all_declined"):
        intel = base / "addons" / "intelligence"
        intel.mkdir(parents=True)
        (intel / "manifest.json").write_text(json.dumps(_hooked_manifest("intelligence", 8100)))
        (intel / "search-config.yml.example").write_text("features:\n  rag: false\n")
        know = base / "addons" / "knowledge"
        know.mkdir(parents=True)
        (know / "manifest.json").write_text(json.dumps(_hooked_manifest("knowledge", 8200)))
        for bundled in ("media_import", "cloud-sync"):
            (base / "addons" / bundled / "backend").mkdir(parents=True)
            (base / "addons" / bundled / "backend" / "router.py").write_text("")
    if scenario == "all_enabled":
        (base / ".env").write_text("KNOWLEDGE_WEBHOOK_SECRET=k-secret\nCORE_INTERNAL_SECRET=c-secret\n")
    return host


ANSWERS = {
    "all_enabled": ["1", HOST_PLACEHOLDER, "media", "8080", "y", "sk-test", "y", "y"],
    "all_declined": ["1", HOST_PLACEHOLDER, "media", "3000", "n", "n", "y"],
    "no_addons": ["1", HOST_PLACEHOLDER, "media", "3000", "y"],
}


def run(base: Path, answers: list[str], monkeypatch) -> tuple[list[str], str]:
    """Returns the prompts in the order asked, and everything printed."""
    src = Path(__file__).resolve().parent.parent / "configure.py"
    if not (base / "configure.py").exists():
        shutil.copy2(src, base / "configure.py")
    spec = importlib.util.spec_from_file_location(f"configure_{id(base)}", base / "configure.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    queue = list(answers)
    prompts: list[str] = []
    printed: list[str] = []

    def fake_input(prompt: str = "") -> str:
        prompts.append(prompt.strip())
        if not queue:
            raise EOFError
        return queue.pop(0)

    monkeypatch.setattr(builtins, "input", fake_input)
    monkeypatch.setattr(builtins, "print", lambda *a, **k: printed.append(" ".join(map(str, a))))
    monkeypatch.setattr(shutil, "which", lambda _name: None)
    module.main()
    return prompts, "\n".join(printed)


def read_outputs(base: Path, host: Path) -> dict[str, str | None]:
    out: dict[str, str | None] = {}
    for rel in OUTPUTS:
        path = base / rel
        out[rel] = path.read_text().replace(str(host), HOST_PLACEHOLDER) if path.exists() else None
    return out
