"""SPEC-CORE-003, SPEC-ADDON-002: every directory listing in backend/app is classified.

A listing compared against a name stored elsewhere silently misses on a host
that folds Unicode normalization (the DB holds NFC, the disk may hold NFD), and
a glob built from a stored name reads its `[ ] * ?` as syntax. Such a call is
`stored-name` and must normalize or go through `match_siblings`; anything else
is `listing-only`. A new, moved or removed call fails here until it is
classified.
"""
from __future__ import annotations

import ast
from collections import Counter
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"

STORED_NAME = "stored-name"
LISTING_ONLY = "listing-only"

INVENTORY: dict[tuple[str, str, str], tuple[int, str]] = {
    ("app/routers/admin.py", "_get_directory_size", "rglob"): (1, LISTING_ONLY),
    ("app/services/addon_registry.py", "_iter_manifest_files", "glob"): (1, LISTING_ONLY),
    ("app/services/drive_seed.py", "seed_drives_from_mounts", "iterdir"): (1, LISTING_ONLY),
    ("app/services/fileops.py", "_validate_no_duplicates", "iterdir"): (1, STORED_NAME),
    ("app/services/markdown_image_import.py", "initialize_interrupted_jobs", "glob"): (1, LISTING_ONLY),
    ("app/services/scanner.py", "_scan_and_register", "rglob"): (2, LISTING_ONLY),
    ("app/services/sidecar_match.py", "match_siblings", "fnmatch.fnmatchcase"): (1, STORED_NAME),
    ("app/services/sidecar_match.py", "match_siblings", "os.scandir"): (1, STORED_NAME),
    ("app/services/subtitle.py", "detect_subtitles", "iterdir"): (1, STORED_NAME),
    ("app/services/upload.py", "cleanup_abandoned_uploads", "iterdir"): (1, LISTING_ONLY),
}

_METHODS = {"glob", "rglob", "iterdir"}
_MODULE_FUNCS = {
    "glob": {"glob", "iglob"},
    "os": {"listdir", "scandir", "walk"},
    "fnmatch": {"fnmatch", "fnmatchcase", "filter"},
}
_NORMALIZERS = {"match_siblings", "normalize"}


def _listing_call(call: ast.Call, bare: dict[str, str]) -> str | None:
    func = call.func
    if isinstance(func, ast.Attribute):
        receiver = func.value.id if isinstance(func.value, ast.Name) else None
        if receiver in _MODULE_FUNCS and func.attr in _MODULE_FUNCS[receiver]:
            return f"{receiver}.{func.attr}"
        if func.attr in _METHODS:
            return func.attr
        if func.attr == "walk" and receiver != "ast":
            return "walk"
    elif isinstance(func, ast.Name) and func.id in bare:
        return bare[func.id]
    return None


def _called_names(node: ast.AST) -> set[str]:
    names = set()
    for sub in ast.walk(node):
        if isinstance(sub, ast.Call):
            if isinstance(sub.func, ast.Attribute):
                names.add(sub.func.attr)
            elif isinstance(sub.func, ast.Name):
                names.add(sub.func.id)
    return names


def _scan() -> tuple[Counter, dict[tuple[str, str, str], set[str]]]:
    found: Counter = Counter()
    callees: dict[tuple[str, str, str], set[str]] = {}
    for path in sorted(APP.rglob("*.py")):
        rel = path.relative_to(APP.parent).as_posix()
        tree = ast.parse(path.read_text(encoding="utf-8"))
        bare = {
            alias.asname or alias.name: f"{node.module}.{alias.name}"
            for node in ast.walk(tree)
            if isinstance(node, ast.ImportFrom) and node.module in _MODULE_FUNCS
            for alias in node.names
            if alias.name in _MODULE_FUNCS[node.module]
        }

        def visit(node: ast.AST, qual: str, scope: ast.AST) -> None:
            for child in ast.iter_child_nodes(node):
                child_qual, child_scope = qual, scope
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    child_qual = f"{qual}.{child.name}" if qual else child.name
                    child_scope = child
                if isinstance(child, ast.Call):
                    name = _listing_call(child, bare)
                    if name:
                        key = (rel, qual or "<module>", name)
                        found[key] += 1
                        callees[key] = _called_names(scope)
                visit(child, child_qual, child_scope)

        visit(tree, "", tree)
    return found, callees


def test_every_listing_call_is_classified():
    found, _ = _scan()
    assert dict(found) == {key: count for key, (count, _) in INVENTORY.items()}


def test_stored_name_listings_normalize():
    _, callees = _scan()
    unnormalized = [
        key
        for key, (_, category) in INVENTORY.items()
        if category == STORED_NAME and not (callees.get(key, set()) & _NORMALIZERS)
    ]
    assert unnormalized == []


def test_the_scanner_sees_each_call_form():
    source = (
        "import os, glob, fnmatch, ast\n"
        "from os import listdir as ls\n"
        "def f(p, q, tree, query):\n"
        "    p.glob('*'); p.rglob('*'); p.iterdir(); p.walk()\n"
        "    glob.glob('*'); glob.iglob('*'); os.listdir(q); os.scandir(q); os.walk(q)\n"
        "    fnmatch.fnmatch('a', '*'); fnmatch.fnmatchcase('a', '*'); fnmatch.filter([], '*')\n"
        "    ls(q); ast.walk(tree); query.filter(1)\n"
    )
    tree = ast.parse(source)
    bare = {"ls": "os.listdir"}
    names = sorted(
        name
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and (name := _listing_call(node, bare))
    )
    assert names == sorted([
        "glob", "rglob", "iterdir", "walk",
        "glob.glob", "glob.iglob", "os.listdir", "os.scandir", "os.walk",
        "fnmatch.fnmatch", "fnmatch.fnmatchcase", "fnmatch.filter",
        "os.listdir",
    ])
