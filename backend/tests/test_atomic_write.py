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
    atomic_replace,
    atomic_write_bytes,
    atomic_write_text,
)


def test_a_completed_block_replaces_the_destination(tmp_path):
    target = tmp_path / "note.md"
    target.write_text("before", encoding="utf-8")

    atomic_write_text(target, "after")

    assert target.read_text(encoding="utf-8") == "after"
    assert list(tmp_path.iterdir()) == [target]


def test_the_temporary_file_is_a_sibling_of_the_destination(tmp_path):
    """`os.replace` is atomic within a filesystem and raises `EXDEV` across
    one, so the directory is not the caller's to choose."""
    target = tmp_path / "deep" / "note.md"
    seen = []

    with atomic_replace(target) as temporary:
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

    atomic_write_text(target, "after")

    assert stat.S_IMODE(target.stat().st_mode) == 0o644


def test_a_restrictive_mode_the_user_chose_is_also_kept(tmp_path):
    """Preserving beats a flat default: 0600 on a note can be deliberate."""
    target = tmp_path / "secret.md"
    target.write_text("before", encoding="utf-8")
    os.chmod(target, 0o600)

    atomic_write_text(target, "after")

    assert stat.S_IMODE(target.stat().st_mode) == 0o600


def test_a_new_file_gets_what_a_plain_open_would_have_given_it(tmp_path):
    target = tmp_path / "fresh.md"

    atomic_write_text(target, "content")

    expected = 0o666 & ~0o022
    assert stat.S_IMODE(target.stat().st_mode) == expected


def test_an_exception_leaves_the_destination_and_no_debris(tmp_path):
    target = tmp_path / "note.md"
    target.write_text("before", encoding="utf-8")

    with pytest.raises(RuntimeError):
        with atomic_replace(target) as temporary:
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
        with atomic_replace(target) as temporary:
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

    with atomic_replace(target) as temporary:
        temporary.write_bytes(b"new content")
        observed.append(target.read_text(encoding="utf-8"))

    observed.append(target.read_text(encoding="utf-8"))
    assert observed == ["old", "new content"]


def test_bytes_and_text_write_the_same_file(tmp_path):
    binary = tmp_path / "a.bin"
    text = tmp_path / "b.txt"

    atomic_write_bytes(binary, b"\x00\x01")
    atomic_write_text(text, "ほげ")

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
        with atomic_replace(target) as temporary:
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


# The detector this helper's shape makes possible. With one function to reach
# for and nothing to pass but a destination and the contents, "which writes do
# not go through it" is a question about the tree rather than about eight
# hand-rolled implementations of one rule.
#
# Declared as sets, not counted. A file that grows a `mkstemp` or an
# `os.replace` fails this until it is either routed through the helper or
# written down here with its reason — which is the review step the seven broken
# copies never got.
ALLOWED_MKSTEMP = frozenset({"app/services/atomic_write.py"})
ALLOWED_OS_REPLACE = frozenset({
    "app/services/atomic_write.py",
    # Its own contract: a single-generation `.bak`, and an in-place
    # truncate-and-write fallback for when the destination is a bind-mounted
    # file and `rename(2)` returns EBUSY. Neither belongs in a helper whose
    # promise is that the destination is never seen half-written.
    "app/services/config_writer.py",
})


def _files_calling(*attribute_names):
    """Find real calls, by parsing. A substring scan reads prose as code.

    Measured: matching `"os.replace("` reported `thumbnail.py`, whose only
    remaining occurrence is a docstring line quoting the convention. A detector
    that cannot tell a call from a sentence about calls will be argued with
    rather than obeyed.
    """
    import ast

    wanted = set(attribute_names)
    root = pathlib.Path(__file__).resolve().parent.parent / "app"
    found = set()
    scanned = 0
    for path in root.rglob("*.py"):
        scanned += 1
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            function = node.func
            if isinstance(function, ast.Attribute):
                owner = getattr(function.value, "id", None)
                name = f"{owner}.{function.attr}" if owner else function.attr
            else:
                name = getattr(function, "id", None)
            # `str.replace` is everywhere, so the owner is part of the name:
            # `os.replace` and `_os.replace` are the rename, `x.replace` is not.
            if name in wanted or function.__class__ is ast.Name and name in wanted:
                found.add(str(path.relative_to(root.parent)))
    assert scanned > 40, f"the scan reached only {scanned} files, so it proves little"
    return found


def test_no_file_rolls_its_own_temporary_file():
    assert _files_calling("tempfile.mkstemp", "mkstemp") == ALLOWED_MKSTEMP


def test_no_file_renames_over_a_destination_outside_the_helper():
    assert _files_calling("os.replace", "_os.replace") == ALLOWED_OS_REPLACE


def test_every_call_site_passes_a_destination_and_nothing_else():
    """The measure of whether a caller can get it wrong is what it may pass.

    `suffix` and `encoding` were parameters until the callers were counted:
    three passed `suffix=".jpg"` where the destination was already `.jpg`, so
    the knob could only ever be set to the value the helper can derive. This
    asserts the signatures stay closed.
    """
    import inspect

    from app.services import atomic_write

    signatures = {
        name: list(inspect.signature(getattr(atomic_write, name)).parameters)
        for name in ("atomic_replace", "atomic_write_bytes", "atomic_write_text")
    }
    assert signatures == {
        "atomic_replace": ["destination"],
        "atomic_write_bytes": ["destination", "body"],
        "atomic_write_text": ["destination", "body"],
    }
