"""What `atomic_write` promises, and the one thing it does not.

Each test names the call site that got the property wrong before the helper
existed, because the helper's whole argument is that eight separate
implementations of one rule produced seven separate mistakes.
"""

import os
import pathlib
import stat

import pytest

from app.services.atomic_write import (
    AbandonWrite,
    generating_file,
    replace_file_contents,
    replacing_file,
    write_generated_file,
)


def test_a_completed_block_replaces_the_destination(tmp_path):
    target = tmp_path / "note.md"
    target.write_text("before", encoding="utf-8")

    replace_file_contents(target, b"after")

    assert target.read_text(encoding="utf-8") == "after"
    assert list(tmp_path.iterdir()) == [target]


def test_the_temporary_file_is_a_sibling_of_the_destination(tmp_path):
    """`os.replace` is atomic within a filesystem and raises `EXDEV` across
    one, so the directory is not the caller's to choose."""
    target = tmp_path / "deep" / "note.md"
    seen = []

    with replacing_file(target) as temporary:
        seen.append(temporary)
        temporary.write_bytes(b"x")

    assert seen[0].parent == target.parent
    assert target.read_bytes() == b"x"


def test_the_destination_keeps_the_mode_it_had(tmp_path):
    """`mkstemp` opens at 0600 and `os.replace` carries the source's mode over.

    Seven call sites did this by hand without a `chmod`, so a note edited
    through the app became readable only by the backend's uid — on a bind mount
    the user also reaches from the host.
    """
    target = tmp_path / "note.md"
    target.write_text("before", encoding="utf-8")
    os.chmod(target, 0o644)

    replace_file_contents(target, b"after")

    assert stat.S_IMODE(target.stat().st_mode) == 0o644


def test_a_restrictive_mode_the_user_chose_is_kept_in_a_drive(tmp_path):
    """Preserving beats a flat default for a file the user owns: 0600 on a note
    can be deliberate."""
    target = tmp_path / "secret.md"
    target.write_text("before", encoding="utf-8")
    os.chmod(target, 0o600)

    replace_file_contents(target, b"after")

    assert stat.S_IMODE(target.stat().st_mode) == 0o600


def test_a_generated_file_is_not_pinned_to_the_mode_it_happens_to_carry(tmp_path):
    """The other half of the split, and the reason it is a split.

    A thumbnail at 0600 is not a choice anybody made — it is what the bug this
    helper fixes left behind, and regeneration is the only path by which such a
    file heals. Preserving here would pin it forever. Nobody chmods a cache, so
    there is nothing to preserve.
    """
    target = tmp_path / "thumb.jpg"
    target.write_bytes(b"stale")
    os.chmod(target, 0o600)

    write_generated_file(target, b"fresh")

    assert stat.S_IMODE(target.stat().st_mode) == 0o666 & ~0o022


def test_the_temporary_file_is_hidden_from_the_scanner(tmp_path):
    """The leading dot is the only thing keeping a half-written file out of the
    index.

    `scanner.py` and `markdown_relations.py` each wrote `<name>.tmp`, which is
    not hidden and which `classify` calls `other`, so a scan racing a rewrite
    indexed the temporary as a file of its own. Both now come through here.
    """
    for opener in (replacing_file, generating_file):
        target = tmp_path / "note.md"
        with opener(target) as temporary:
            assert temporary.name.startswith("."), temporary.name
            assert temporary.suffix == ".md"
            temporary.write_bytes(b"x")


def test_a_new_file_gets_what_a_plain_open_would_have_given_it(tmp_path):
    target = tmp_path / "fresh.md"

    write_generated_file(target, b"content")

    expected = 0o666 & ~0o022
    assert stat.S_IMODE(target.stat().st_mode) == expected


def test_an_exception_leaves_the_destination_and_no_debris(tmp_path):
    target = tmp_path / "note.md"
    target.write_text("before", encoding="utf-8")

    with pytest.raises(RuntimeError):
        with replacing_file(target) as temporary:
            temporary.write_bytes(b"half")
            raise RuntimeError("generator exploded")

    assert target.read_text(encoding="utf-8") == "before"
    assert list(tmp_path.iterdir()) == [target]


def test_abandoning_is_not_an_error_and_still_leaves_nothing(tmp_path):
    """`write_thumbnail_atomically`'s generator reports failure by returning
    `False`, so "do not publish this" needs a spelling that is not an error.
    """
    target = tmp_path / "thumb.jpg"

    with pytest.raises(AbandonWrite):
        with replacing_file(target) as temporary:
            temporary.write_bytes(b"partial")
            raise AbandonWrite

    assert not target.exists()
    assert list(tmp_path.iterdir()) == []


def test_a_reader_never_sees_a_partially_written_file(tmp_path):
    """The property the discipline exists for: the destination holds the old
    bytes until it holds all of the new ones."""
    target = tmp_path / "note.md"
    target.write_text("old", encoding="utf-8")
    observed = []

    with replacing_file(target) as temporary:
        temporary.write_bytes(b"new content")
        observed.append(target.read_text(encoding="utf-8"))

    observed.append(target.read_text(encoding="utf-8"))
    assert observed == ["old", "new content"]


def test_bytes_and_text_write_the_same_file(tmp_path):
    binary = tmp_path / "a.bin"
    text = tmp_path / "b.txt"

    replace_file_contents(binary, b"\x00\x01")
    write_generated_file(text, "ほげ".encode())

    assert binary.read_bytes() == b"\x00\x01"
    assert text.read_text(encoding="utf-8") == "ほげ"


def test_an_interrupt_during_assembly_also_leaves_no_debris(tmp_path):
    """Why cleanup is in a `finally` and not an `except Exception`.

    A `return` out of the block cannot leak — `contextlib` resumes the
    generator and the write is published — so `BaseException` is the whole
    difference between the two spellings.
    """
    target = tmp_path / "note.md"
    target.write_text("before", encoding="utf-8")

    with pytest.raises(KeyboardInterrupt):
        with replacing_file(target) as temporary:
            temporary.write_bytes(b"half")
            raise KeyboardInterrupt

    assert target.read_text(encoding="utf-8") == "before"
    assert list(tmp_path.iterdir()) == [target]


def test_a_generator_that_reports_failure_publishes_nothing(tmp_path):
    """`write_thumbnail_atomically` is the caller that turns a `False` into
    `AbandonWrite`; without it a failed generator's partial output is renamed
    over a thumbnail the endpoint may be serving."""
    from app.services.thumbnail import write_thumbnail_atomically

    destination = tmp_path / "thumb.jpg"
    destination.write_bytes(b"the previous thumbnail")

    def failing_generator(source, target):
        pathlib.Path(target).write_bytes(b"partial output")
        return False

    assert write_thumbnail_atomically(failing_generator, "src.mp4", str(destination)) is False
    assert destination.read_bytes() == b"the previous thumbnail"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["thumb.jpg"]


# The detector this helper's shape makes possible. With one place to reach for
# and nothing to pass but a destination and the contents, "which writes do not
# come through here" is a question about the tree.
#
# **The population is by role, not by spelling.** The first version of this asked
# about two spellings of four and passed while `scanner.py` and
# `markdown_relations.py` renamed through `Path.replace` and two routers created
# through `os.open(O_EXCL)`. Every spelling that publishes a file's contents is
# below, declared as a set: a file that grows one fails this until it is either
# routed through the helper or written down with its reason.
ROLES = {
    # `os.replace(tmp, dst)` / `_os.replace(...)`
    "rename-by-os": frozenset({
        "app/services/atomic_write.py",
        # Its own contract: a single-generation `.bak`, and an in-place
        # truncate-and-write fallback for a bind-mounted destination where
        # `rename(2)` returns EBUSY. Neither belongs behind a promise that a
        # destination is never seen half-written.
        "app/services/config_writer.py",
    }),
    # `tmp.replace(dst)` — `Path.replace` takes one argument, which is what
    # tells it apart from `str.replace`.
    "rename-by-path": frozenset(),
    # `os.open(..., O_CREAT | O_EXCL)` — reserving a path, not replacing one.
    # Exclusivity is the point in both: a rename would clobber, and these must
    # fail with 409 when the target exists.
    "create-exclusive": frozenset({
        "app/routers/drives.py",
        "app/services/fileops.py",
    }),
    # A hand-rolled temporary is how all four spellings started.
    "hand-rolled-temporary": frozenset({"app/services/atomic_write.py"}),
}


def _files_by_role():
    """Find real calls, by parsing. A substring scan reads prose as code.

    Measured, both cheaper versions first: matching `"os.replace("` as text
    reported `thumbnail.py`, whose only occurrence is a docstring quoting the
    convention; matching the bare attribute `replace` reported six more files,
    because `str.replace` is everywhere.
    """
    import ast

    root = pathlib.Path(__file__).resolve().parent.parent / "app"
    found = {role: set() for role in ROLES}
    scanned = 0
    for path in root.rglob("*.py"):
        scanned += 1
        name = str(path.relative_to(root.parent))
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if not isinstance(node, ast.Call):
                continue
            function = node.func
            if not isinstance(function, ast.Attribute):
                continue
            owner = getattr(function.value, "id", None)
            attr = function.attr
            if attr == "replace" and owner in ("os", "_os"):
                found["rename-by-os"].add(name)
            elif attr == "replace" and len(node.args) == 1 and not node.keywords:
                found["rename-by-path"].add(name)
            elif attr == "mkstemp":
                found["hand-rolled-temporary"].add(name)
            elif attr == "open" and owner in ("os", "_os"):
                flags = ast.dump(node)
                if "O_EXCL" in flags or "O_CREAT" in flags:
                    found["create-exclusive"].add(name)
    assert scanned > 40, f"the scan reached only {scanned} files, so it proves little"
    return found


def test_no_write_publishes_a_file_outside_the_helper():
    assert _files_by_role() == {role: set(allowed) for role, allowed in ROLES.items()}


def test_the_declared_roles_are_the_spellings_that_were_actually_found():
    """Four, not two. Recorded because the count moved once already, the same
    way `addon_proxy`'s "three guard spellings" turned out to be five."""
    assert set(ROLES) == {
        "rename-by-os",
        "rename-by-path",
        "create-exclusive",
        "hand-rolled-temporary",
    }


def test_every_call_site_passes_a_destination_and_nothing_else():
    """The measure of whether a caller can get it wrong is what it may pass.

    `suffix` and `encoding` were parameters until the callers were counted:
    three passed `suffix=".jpg"` where the destination was already `.jpg`, so
    the knob could only ever be set to the value the helper can derive. The mode
    policy is not a parameter either — it is which function you call. This
    asserts all four signatures stay closed.
    """
    import inspect

    from app.services import atomic_write

    signatures = {
        name: list(inspect.signature(getattr(atomic_write, name)).parameters)
        for name in (
            "replacing_file",
            "generating_file",
            "replace_file_contents",
            "write_generated_file",
        )
    }
    assert signatures == {
        "replacing_file": ["destination"],
        "generating_file": ["destination"],
        "replace_file_contents": ["destination", "body"],
        "write_generated_file": ["destination", "body"],
    }
