"""No test file may leave the thread without a current event loop.

`asyncio.run()` sets a fresh loop as current and resets the slot to None on
exit. Any test that then calls `asyncio.get_event_loop()` raises
`RuntimeError: There is no current event loop` on 3.12 — which is how one
new test file silently broke sixteen tests in `test_ws.py`.

Both sides are now fixed: helpers use a private loop that never touches the
thread-global slot. This pins that, because the failure only appears when
two particular files run in the same session and is invisible to either
file's own test run.
"""

import ast
import asyncio
from pathlib import Path

import pytest

TESTS_DIR = Path(__file__).parent

# Both mutate (or depend on) the thread's current-loop slot, which is shared
# state between test files in the same session.
FORBIDDEN = {"run", "get_event_loop"}


def _test_files():
    return sorted(TESTS_DIR.glob("test_*.py"))


def _asyncio_calls(source: str) -> set[str]:
    """Names of `asyncio.<name>(...)` calls actually made in the source.

    Parsed rather than grepped: a docstring explaining why a call is banned
    is not a use of it, and this file is full of exactly that.
    """
    found: set[str] = set()
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if (
            isinstance(func, ast.Attribute)
            and isinstance(func.value, ast.Name)
            and func.value.id == "asyncio"
        ):
            found.add(func.attr)
    return found


@pytest.mark.parametrize("path", _test_files(), ids=lambda p: p.name)
def test_no_thread_global_loop_calls(path):
    """No test file may disturb the thread's current event loop.

    `asyncio.run()` sets a fresh loop as current and resets the slot to
    None on exit. A test that then calls `asyncio.get_event_loop()` raises
    `RuntimeError: There is no current event loop` on 3.12 — which is how
    one new test file silently broke sixteen tests in `test_ws.py`.

    `asyncio.new_event_loop()` + `run_until_complete` + `close` does the
    same job with no shared state, and is what both sides now use. The
    failure only appears when two particular files share a session, so
    neither file's own run would catch a regression.
    """
    if path.name == Path(__file__).name:
        # This file calls get_event_loop() on purpose, to assert that it
        # raises after the prescribed pattern has run.
        pytest.skip("exercises the calls it forbids")

    used = _asyncio_calls(path.read_text(encoding="utf-8")) & FORBIDDEN
    assert not used, (
        f"{path.name} calls asyncio.{sorted(used)[0]}(), which mutates the "
        "thread's current event loop and breaks other test files. Use "
        "asyncio.new_event_loop() + run_until_complete + close instead."
    )


def test_a_private_loop_leaves_the_slot_untouched():
    """The prescribed pattern really is side-effect free."""
    asyncio.set_event_loop(None)

    async def noop():
        return 42

    loop = asyncio.new_event_loop()
    try:
        assert loop.run_until_complete(noop()) == 42
    finally:
        loop.close()

    # Still unset: running a coroutine did not claim the thread's slot.
    with pytest.raises(RuntimeError):
        asyncio.get_event_loop()
