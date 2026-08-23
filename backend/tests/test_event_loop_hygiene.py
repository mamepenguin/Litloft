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

#: `asyncio.Runner()` claims the slot too, measured on 3.12: the current
#: loop is set while it runs and reset afterwards, exactly like
#: `asyncio.run`. Passing any `loop_factory` avoids it — CPython only calls
#: `set_event_loop` when `loop_factory is None` — so the keyword is the
#: discriminator rather than a style preference.
GUARDED_CONSTRUCTORS = frozenset({"Runner"})
LOOP_FACTORY_KEYWORD = "loop_factory"


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
                    if alias.name in FORBIDDEN | GUARDED_CONSTRUCTORS:
                        direct_names[alias.asname or alias.name] = alias.name

    def _resolve(func: ast.expr) -> str | None:
        if (
            isinstance(func, ast.Attribute)
            and isinstance(func.value, ast.Name)
            and func.value.id in module_aliases
        ):
            return func.attr
        if isinstance(func, ast.Name):
            return direct_names.get(func.id)
        return None

    found: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = _resolve(node.func)
        if name is None:
            continue
        if name in FORBIDDEN:
            found.add(name)
        elif name in GUARDED_CONSTRUCTORS:
            takes_own_loop = any(
                kw.arg == LOOP_FACTORY_KEYWORD for kw in node.keywords
            )
            if not takes_own_loop:
                found.add(name)
    return found


def _scanned_files() -> list[Path]:
    """Every module pytest imports from the test tree.

    Every `.py` under the test tree, not a glob of test names. pytest's
    default `python_files` is `test_*.py` **and** `*_test.py`, and this
    project does not override it — so a `foo_test.py` runs while a
    name-matching scan looks straight past it. Helper modules that tests
    import can break the slot just as effectively, and `conftest.py` is the
    worst case of all: it runs around every test, so one stray call there
    poisons the session rather than a file.

    Matching the whole tree costs nothing and cannot fall behind a pytest
    setting.
    """
    return sorted(TESTS_DIR.rglob("*.py"))


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
            # Measured on 3.12: a bare Runner sets the current loop while it
            # runs and clears it afterwards, exactly like asyncio.run.
            ("import asyncio\nwith asyncio.Runner() as r:\n    r.run(c())", {"Runner"}),
            ("import asyncio as aio\naio.Runner()", {"Runner"}),
            ("from asyncio import Runner\nRunner()", {"Runner"}),
            ("import asyncio\nasyncio.Runner(debug=True)", {"Runner"}),
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
            # A Runner that brings its own loop never touches the slot —
            # CPython only calls set_event_loop when loop_factory is None.
            (
                "import asyncio\n"
                "with asyncio.Runner(loop_factory=asyncio.new_event_loop) as r:\n"
                "    r.run(c())"
            ),
            "import asyncio\nasyncio.Runner(debug=True, loop_factory=f)",
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

    def test_scan_is_not_limited_to_one_naming_pattern(self, tmp_path, monkeypatch):
        """pytest collects `*_test.py` as well, and this project does not
        override `python_files`. A scan keyed on `test_*.py` would run past
        a file pytest happily executes."""
        import tests.test_event_loop_hygiene as mod

        for name in ("test_a.py", "b_test.py", "helper.py", "conftest.py"):
            (tmp_path / name).write_text("x = 1\n", encoding="utf-8")
        monkeypatch.setattr(mod, "TESTS_DIR", tmp_path)

        found = {p.name for p in mod._scanned_files()}
        assert found == {"test_a.py", "b_test.py", "helper.py", "conftest.py"}


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
