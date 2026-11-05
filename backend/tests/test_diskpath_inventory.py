"""SPEC-CORE-042 I13: every join of a drive path with a stored path in backend/app is
routed through the resolver or listed as listing-derived with a reason."""
from __future__ import annotations

import ast
import re
import textwrap
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"

STORED = {"file_path", "folder_path"}
RESOLVERS = {"resolve_on_disk", "resolve_parent"}
DRIVE_PART = re.compile(r"drive_path|drive_root|drive_dir|base_dir|base_path|mount|\broot\b|_root\b|dest_dir")

# (path relative to backend/, enclosing function) -> why the stored path is not an NFC
# name that has to be found on disk. An entry without a reason is rejected.
LISTING_DERIVED: dict[tuple[str, str], str] = {}


def _stored_names(fn: ast.AST) -> set[str]:
    """Names assigned once, in this function, from an expression that mentions a stored path."""
    counts: dict[str, int] = {}
    carries: set[str] = set()
    for node in ast.walk(fn):
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            counts[name] = counts.get(name, 0) + 1
            if _mentions_stored(node.value, set()):
                carries.add(name)
    return {n for n in carries if counts[n] == 1}


def _mentions_stored(node: ast.AST, via: set[str]) -> bool:
    for n in ast.walk(node):
        if isinstance(n, ast.Attribute) and n.attr in STORED:
            return True
        if isinstance(n, ast.Name) and (n.id in STORED or n.id in via):
            return True
    return False


def _mentions_drive(node: ast.AST) -> bool:
    return bool(DRIVE_PART.search(ast.unparse(node)))


def _join_parts(node: ast.AST) -> list[ast.AST] | None:
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
        return [node.left, node.right]
    if isinstance(node, ast.JoinedStr):
        return [v.value for v in node.values if isinstance(v, ast.FormattedValue)]
    if isinstance(node, ast.Call):
        f = node.func
        if isinstance(f, ast.Attribute) and f.attr == "joinpath":
            return [f.value, *node.args]
        if isinstance(f, ast.Attribute) and f.attr == "join" and ast.unparse(f.value) in {"os.path", "posixpath"}:
            return list(node.args)
        if isinstance(f, (ast.Name, ast.Attribute)) and (getattr(f, "id", None) or f.attr) in {"Path", "PurePath"} and len(node.args) > 1:
            return list(node.args)
    return None


def _call_name(call: ast.Call) -> str:
    f = call.func
    return f.id if isinstance(f, ast.Name) else f.attr if isinstance(f, ast.Attribute) else ""


def unrouted_joins(source: str) -> list[tuple[str, int]]:
    """(enclosing function, line) of each drive/stored join not inside a resolver call."""
    tree = ast.parse(source)
    parents: dict[ast.AST, ast.AST] = {}
    for p in ast.walk(tree):
        for ch in ast.iter_child_nodes(p):
            parents[ch] = p
    found = []
    for fn in [tree, *[n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]]:
        via = _stored_names(fn)
        for node in ast.walk(fn):
            parts = _join_parts(node)
            if parts is None:
                continue
            owner = node
            while owner in parents and not isinstance(owner, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Module)):
                owner = parents[owner]
            if owner is not fn:
                continue
            if not (any(_mentions_stored(p, via) for p in parts) and any(_mentions_drive(p) for p in parts)):
                continue
            up, routed = node, False
            while up in parents:
                up = parents[up]
                if isinstance(up, ast.Call) and _call_name(up) in RESOLVERS:
                    routed = True
                    break
            if not routed:
                name = "<module>" if isinstance(fn, ast.Module) else fn.name
                found.append((name, node.lineno))
    return sorted(set(found))


class _DetectorChecks:
    def check_a_seeded_unrouted_join_is_found_in_every_form(self):
        src = textwrap.dedent('''
            import os
            def a(drive_path, file):
                return drive_path / file.file_path
            def b(drive_path, file):
                return os.path.join(drive_path, file.file_path)
            def c(drive_path, file):
                return drive_path.joinpath(file.folder_path, "x")
            def d(drive_path, file):
                return Path(drive_path, file.file_path)
            def e(drive_path, file):
                return f"{drive_path}/{file.file_path}"
            def f(drive_path, file):
                rel = file.file_path
                return drive_path / rel
        ''')
        assert [n for n, _ in unrouted_joins(src)] == ["a", "b", "c", "d", "e", "f"]

    def check_a_routed_or_unrelated_join_is_not_reported(self):
        src = textwrap.dedent('''
            def a(drive_path, file):
                return resolve_on_disk(drive_path, file.file_path)
            def b(drive_path, file):
                return resolve_parent(drive_path / file.file_path)
            def c(drive_path, name):
                return drive_path / name
            def d(file):
                return file.folder_path + "/" + file.filename
        ''')
        assert unrouted_joins(src) == []


def test_i13_every_join_of_a_drive_path_with_a_stored_path_is_routed_or_listed():
    _DetectorChecks().check_a_seeded_unrouted_join_is_found_in_every_form()
    _DetectorChecks().check_a_routed_or_unrelated_join_is_not_reported()
    for key, reason in LISTING_DERIVED.items():
        assert reason.strip(), f"{key} is listed without a reason"
    unrouted = []
    for path in sorted(APP.rglob("*.py")):
        rel = f"app/{path.relative_to(APP).as_posix()}"
        for func, line in unrouted_joins(path.read_text(encoding="utf-8")):
            if (rel, func) not in LISTING_DERIVED:
                unrouted.append(f"{rel}:{line} in {func}")
    assert unrouted == []
