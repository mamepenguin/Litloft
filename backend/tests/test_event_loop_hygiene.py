"""No test module may disturb the thread's current event loop.

`asyncio.run()` sets a fresh loop as current and resets the slot to None on
exit. A test that then calls `asyncio.get_event_loop()` raises
`RuntimeError: There is no current event loop` on 3.12 — which is how one
new test file silently broke twenty-one tests in `test_ws.py`. Both files
passed in isolation, so nothing caught it until the suites were run
together.

`asyncio.new_event_loop()` + `run_until_complete` + `close` does the same
job against a private loop and touches no shared state. That is the
prescribed pattern, and this module enforces it.
"""

import ast
import asyncio
import threading
from pathlib import Path

import pytest

TESTS_DIR = Path(__file__).parent

#: Every asyncio entry point that reads or writes the thread's current-loop
#: slot. `set_event_loop` is the most direct of the three, and was the hole
#: that let this module's own first draft break the rule it enforces.
FORBIDDEN = frozenset({"run", "get_event_loop", "set_event_loop"})


def forbidden_calls(source: str) -> set[str]:
    """Names of forbidden asyncio calls in `source`, alias-resolved.

    Parsed rather than grepped, for two reasons. A docstring explaining why
    a call is banned is not a use of it — and this file is full of exactly
    that. And the textual form misses every way of spelling the call that
    is not literally `asyncio.<name>`:

        import asyncio as aio;  aio.run(...)
        from asyncio import run;  run(...)

    Both were live holes in the first version.
    """
    tree = ast.parse(source)

    # Module aliases: `import asyncio as aio` -> {"aio"}.
    module_aliases: set[str] = set()
    # Direct names: `from asyncio import run as go` -> {"go": "run"}.
    direct_names: dict[str, str] = {}

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == "asyncio":
                    module_aliases.add(alias.asname or alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module == "asyncio":
                for alias in node.names:
                    if alias.name in FORBIDDEN:
                        direct_names[alias.asname or alias.name] = alias.name

    found: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if (
            isinstance(func, ast.Attribute)
            and isinstance(func.value, ast.Name)
            and func.value.id in module_aliases
            and func.attr in FORBIDDEN
        ):
            found.add(func.attr)
        elif isinstance(func, ast.Name) and func.id in direct_names:
            found.add(direct_names[func.id])
    return found


def _scanned_files() -> list[Path]:
    """Every module pytest imports from the test tree.

    `conftest.py` counts: it runs before and around every test, so a stray
    call there would poison the whole session rather than one file. Recurses,
    so a future subpackage is covered without anyone remembering to add it.
    """
    paths = set(TESTS_DIR.rglob("test_*.py")) | set(TESTS_DIR.rglob("conftest.py"))
    return sorted(paths)


@pytest.mark.parametrize(
    "path", _scanned_files(), ids=lambda p: p.name
)
def test_no_thread_global_loop_calls(path: Path):
    if path.name == Path(__file__).name:
        pytest.skip("states the calls it forbids, in prose and in fixtures")

    used = forbidden_calls(path.read_text(encoding="utf-8"))
    assert not used, (
        f"{path.name} calls asyncio.{sorted(used)[0]}(), which reads or "
        "mutates the thread's current event loop and so leaks state into "
        "other test files. Use asyncio.new_event_loop() + "
        "run_until_complete + close, or run the check on its own thread."
    )


class TestTheGuardItself:
    """The checker is only worth as much as its coverage.

    Every case here was a real evasion of the first version: three of the
    four spellings went undetected, and `conftest.py` was not scanned at
    all.
    """

    @pytest.mark.parametrize(
        "source,expected",
        [
            ("import asyncio\nasyncio.run(c())", {"run"}),
            ("import asyncio\nasyncio.get_event_loop()", {"get_event_loop"}),
            ("import asyncio\nasyncio.set_event_loop(None)", {"set_event_loop"}),
            ("import asyncio as aio\naio.run(c())", {"run"}),
            ("from asyncio import run\nrun(c())", {"run"}),
            ("from asyncio import run as go\ngo(c())", {"run"}),
            (
                "import asyncio\nasyncio.set_event_loop(asyncio.new_event_loop())",
                {"set_event_loop"},
            ),
        ],
    )
    def test_detects(self, source: str, expected: set[str]):
        assert forbidden_calls(source) == expected

    @pytest.mark.parametrize(
        "source",
        [
            # The prescribed pattern.
            "import asyncio\nl = asyncio.new_event_loop()\nl.run_until_complete(c())",
            # A same-named method on something that is not asyncio.
            "import other\nother.run(c())",
            "runner.run(c())",
            # Prose about the rule is not a use of it.
            '"""Never call asyncio.run() or asyncio.get_event_loop()."""',
            # An unrelated import of the same name.
            "from subprocess import run\nrun(['ls'])",
        ],
    )
    def test_allows(self, source: str):
        assert forbidden_calls(source) == set()

    def test_conftest_is_scanned(self):
        names = {p.name for p in _scanned_files()}
        assert "conftest.py" in names, (
            "conftest runs around every test, so a stray call there poisons "
            "the whole session"
        )


def test_a_private_loop_leaves_the_slot_untouched():
    """The prescribed pattern really is side-effect free.

    Run on a dedicated thread, which has its own current-loop slot. An
    earlier version asserted this on the main thread by calling
    `set_event_loop(None)` first and never restoring it — leaving exactly
    the shared state this module exists to prevent. A thread makes the
    isolation structural rather than something a `finally` has to remember.
    """
    result: dict[str, object] = {}

    def probe():
        async def noop():
            return 42

        loop = asyncio.new_event_loop()
        try:
            result["value"] = loop.run_until_complete(noop())
        finally:
            loop.close()

        # A fresh thread starts with no current loop, and running a
        # coroutine the prescribed way must not have claimed the slot.
        try:
            asyncio.get_event_loop()
            result["slot_claimed"] = True
        except RuntimeError:
            result["slot_claimed"] = False

    thread = threading.Thread(target=probe)
    thread.start()
    thread.join()

    assert result["value"] == 42
    assert result["slot_claimed"] is False
