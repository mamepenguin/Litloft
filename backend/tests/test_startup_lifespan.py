"""What ``app/main.py`` does on the way up, and what it refuses to die on.

Three subjects, all reached only at startup:

- ``_load_addons``, the in-process addon loader. It derives its directory
  from ``app/main.py``'s own ``__file__`` and imports ``addons.<name>.router``
  by absolute name, so the only way to run it is to put a package where it
  looks. The test image ships no ``backend/addons``, which is why every line
  below its directory check was unexecuted.
- the lifespan's ``restart_pending`` clear, which must not take the process
  down when the flag cannot be removed.
- ``SlowRequestMiddleware``, the one piece of request-path code in this file.
"""

import importlib
import logging
import shutil
import sys
import textwrap
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.main as main
from app.main import app
from app.services import addon_registry

#: Packages this module writes into ``backend/addons``. Declared rather than
#: discovered: teardown removes exactly these, so a tree that already holds
#: real addons (the runtime image) is left as it was.
_PACKAGE_PREFIX = "zz_test_addon_"


def _write_addon(root: Path, name: str, body: str) -> None:
    package = root / name
    package.mkdir()
    (package / "__init__.py").write_text("")
    (package / "router.py").write_text(textwrap.dedent(body))


@pytest.fixture()
def addons_dir():
    """Yield ``backend/addons``, creating it if the layout has none.

    Both layouts are real: the test image copies only ``backend/app`` and
    ``backend/tests``, so there is no directory; the runtime image has one
    full of addons. Teardown removes only what the test added, plus the
    directory itself when this fixture is what created it.
    """
    root = Path(main.__file__).parent.parent / "addons"
    created_root = not root.exists()
    if created_root:
        root.mkdir()
    init_file = root / "__init__.py"
    created_init = not init_file.exists()
    if created_init:
        init_file.write_text("")

    registry_snapshot = dict(addon_registry._registry)
    loaded_snapshot = dict(main._loaded_addons)
    startup_snapshot = list(main._addon_startup_fns)
    importlib.invalidate_caches()
    try:
        yield root
    finally:
        # Process state first: a failure while removing files must not leave
        # this module's addons registered for every test that follows.
        for module_name in list(sys.modules):
            if module_name == "addons" or module_name.startswith("addons."):
                del sys.modules[module_name]
        addon_registry._registry.clear()
        addon_registry._registry.update(registry_snapshot)
        main._loaded_addons.clear()
        main._loaded_addons.update(loaded_snapshot)
        main._addon_startup_fns[:] = startup_snapshot

        if created_root:
            shutil.rmtree(root)
        else:
            for package in sorted(root.glob(f"{_PACKAGE_PREFIX}*")):
                shutil.rmtree(package) if package.is_dir() else package.unlink()
            if created_init:
                init_file.unlink()
            shutil.rmtree(root / "__pycache__", ignore_errors=True)
        importlib.invalidate_caches()


def _load(root: Path) -> FastAPI:
    """Run the loader against a throwaway app and return it.

    ``root`` is not passed on: ``_load_addons`` computes the directory from
    ``app/main.py``'s ``__file__``. Taking it as an argument is what makes the
    dependency on the ``addons_dir`` fixture visible at each call site.
    """
    importlib.invalidate_caches()
    target = FastAPI()
    main._load_addons(target)
    return target


def _paths(target: FastAPI) -> set[str]:
    return {route.path for route in target.routes}


class TestLoadingAnAddon:
    def test_a_well_formed_addon_is_mounted_registered_and_queued(
        self, addons_dir
    ):
        name = f"{_PACKAGE_PREFIX}good"
        _write_addon(
            addons_dir,
            name,
            '''
            from fastapi import APIRouter

            router = APIRouter()
            ADDON_META = {"label": "Good", "icon": "x", "scope": "drive"}

            @router.get("/api/addons/zz-good/ping")
            async def ping():
                return {"ok": True}

            async def on_startup():
                return None
            ''',
        )

        target = _load(addons_dir)

        assert "/api/addons/zz-good/ping" in _paths(target)
        assert name in addon_registry.get_all()
        assert addon_registry.get(name)["type"] == "in_process"
        assert name in main._loaded_addons
        assert [fn.__module__ for fn in main._addon_startup_fns] == [
            f"addons.{name}.router"
        ]

    def test_an_addon_with_no_scope_keeps_its_routes_and_leaves_the_registry(
        self, addons_dir
    ):
        """The documented split, from ``design-decisions.md`` §Addons.

        ``include_router`` happens before the metadata is judged, so an
        addon rejected by ``_validate_scope`` is hidden from every listing
        while its own routes keep answering. Reading the registry as "what
        is mounted" is the mistake this holds against.
        """
        name = f"{_PACKAGE_PREFIX}noscope"
        _write_addon(
            addons_dir,
            name,
            '''
            from fastapi import APIRouter

            router = APIRouter()
            ADDON_META = {"label": "No scope", "icon": "x"}

            @router.get("/api/addons/zz-noscope/ping")
            async def ping():
                return {"ok": True}
            ''',
        )

        target = _load(addons_dir)

        assert "/api/addons/zz-noscope/ping" in _paths(target)
        assert name not in addon_registry.get_all()
        assert name not in main._loaded_addons

    def test_an_addon_that_raises_on_import_does_not_stop_the_others(
        self, addons_dir
    ):
        """One broken checkout must not cost the user every other addon.

        ``pkgutil.iter_modules`` walks in name order, so the broken package
        is named to come first: a loader that stopped at the exception would
        leave the working one unmounted and the failure would read as "the
        addon directory is empty".
        """
        broken = f"{_PACKAGE_PREFIX}aaa_broken"
        working = f"{_PACKAGE_PREFIX}zzz_working"
        _write_addon(addons_dir, broken, "raise RuntimeError('boom')\n")
        _write_addon(
            addons_dir,
            working,
            '''
            from fastapi import APIRouter

            router = APIRouter()
            ADDON_META = {"label": "Works", "icon": "x", "scope": "global"}

            @router.get("/api/addons/zz-working/ping")
            async def ping():
                return {"ok": True}
            ''',
        )

        target = _load(addons_dir)

        assert "/api/addons/zz-working/ping" in _paths(target)
        assert working in addon_registry.get_all()
        assert broken not in addon_registry.get_all()

    def test_an_addon_with_only_a_startup_hook_is_queued_without_a_router(
        self, addons_dir
    ):
        """``router`` and ``on_startup`` are independent options.

        A background worker with nothing to serve is a legitimate addon, and
        it must not be rejected for having no routes.
        """
        name = f"{_PACKAGE_PREFIX}workeronly"
        _write_addon(
            addons_dir,
            name,
            '''
            async def on_startup():
                return None
            ''',
        )

        target = _load(addons_dir)

        assert _paths(target) == _paths(FastAPI())
        assert name not in addon_registry.get_all()
        assert [fn.__module__ for fn in main._addon_startup_fns] == [
            f"addons.{name}.router"
        ]

    def test_a_bare_module_beside_the_packages_is_skipped_quietly(
        self, addons_dir, caplog
    ):
        """``iter_modules`` reports plain ``.py`` files alongside packages.

        Without the ``ispkg`` guard the loader reaches
        ``import addons.<name>.router`` for a file that has no ``router``
        submodule, and the outcome is the same — no route, nothing registered
        — but every startup logs a traceback for it. The silence is therefore
        what this asserts: measured, dropping the guard leaves the two
        assertions below green and only the log tells the difference.
        """
        stray = addons_dir / f"{_PACKAGE_PREFIX}stray.py"
        stray.write_text("raise RuntimeError('should never be imported')\n")

        with caplog.at_level(logging.ERROR, logger="app.main"):
            target = _load(addons_dir)

        assert _paths(target) == _paths(FastAPI())
        assert f"{_PACKAGE_PREFIX}stray" not in addon_registry.get_all()
        assert "Failed to load addon" not in caplog.text

    def test_a_directory_without_an_init_is_not_walked(self, addons_dir):
        """``backend/addons/__init__.py`` is a required marker, not a formality.

        Measured: the import would work without it — ``addons`` resolves as a
        namespace package on 3.12, and ``addons.<name>.router`` loads fine —
        so the early return is a deliberate gate rather than a guard against a
        failure. What it costs when the marker goes missing is every
        in-process addon, silently and with the UI intact, which is why
        ``setup-addons.sh`` and ``backend/Dockerfile`` each ``touch`` it.
        """
        name = f"{_PACKAGE_PREFIX}orphan"
        _write_addon(
            addons_dir,
            name,
            '''
            from fastapi import APIRouter

            router = APIRouter()
            ADDON_META = {"label": "Orphan", "icon": "x", "scope": "global"}

            @router.get("/api/addons/zz-orphan/ping")
            async def ping():
                return {"ok": True}
            ''',
        )
        init_file = addons_dir / "__init__.py"
        init_body = init_file.read_text()
        init_file.unlink()
        try:
            target = _load(addons_dir)
        finally:
            init_file.write_text(init_body)

        assert "/api/addons/zz-orphan/ping" not in _paths(target)
        assert name not in addon_registry.get_all()


class TestClearingTheRestartPendingFlag:
    """The lifespan removes ``data/restart_pending`` on the way up.

    Both tests re-enter the real lifespan through a second ``TestClient``.
    The ``client`` fixture has already pointed ``config.DATA_DIR`` and the
    engine at the test's own directories and stubbed the scan and the purge,
    so a second entry runs the same startup code against the same redirected
    state. Re-implementing the ``try``/``except`` in the test body would
    assert about a copy of the code and hold nothing.
    """

    def test_the_flag_is_gone_once_the_backend_is_up(self, client):
        """``RestartBanner`` reads this flag. Leaving it set tells the
        operator their config has not taken effect when it has."""
        _c, _db, _drive_dir, data_dir = client
        flag = data_dir / "restart_pending"
        flag.write_text("")

        with TestClient(app) as second:
            assert second.get("/api/health").status_code == 200

        assert not flag.exists()

    def test_a_flag_that_cannot_be_removed_does_not_stop_the_startup(
        self, client, monkeypatch, caplog
    ):
        """The clear is a cosmetic correction to a banner.

        Failing the lifespan over it would take the whole backend down —
        every drive, every file — to fix a stale notice.
        """
        _c, _db, _drive_dir, data_dir = client
        flag = data_dir / "restart_pending"
        flag.write_text("")

        real_unlink = Path.unlink

        def refuse(self, *args, **kwargs):
            if self.name == "restart_pending":
                raise OSError(30, "Read-only file system")
            return real_unlink(self, *args, **kwargs)

        monkeypatch.setattr(Path, "unlink", refuse)

        with caplog.at_level(logging.ERROR, logger="app.main"):
            with TestClient(app) as second:
                assert second.get("/api/health").status_code == 200

        assert flag.exists()
        assert "Failed to clear restart_pending flag" in caplog.text


class TestSlowRequestMiddleware:
    def test_a_request_over_the_threshold_is_named_in_the_log(
        self, client, monkeypatch, caplog
    ):
        """The line names the method and the path, not only the duration.

        A warning that a request was slow, without saying which, sends an
        operator back to the browser to find out.
        """
        c, _db, _drive_dir, _data_dir = client
        monkeypatch.setattr(main, "_SLOW_REQUEST_THRESHOLD_SEC", 0.0)

        with caplog.at_level(logging.WARNING, logger="app.main"):
            response = c.get("/api/health")

        assert response.status_code == 200
        assert "SLOW REQUEST" in caplog.text
        assert "GET" in caplog.text
        assert "/api/health" in caplog.text

    def test_a_request_under_the_threshold_is_not(
        self, client, monkeypatch, caplog
    ):
        c, _db, _drive_dir, _data_dir = client
        monkeypatch.setattr(main, "_SLOW_REQUEST_THRESHOLD_SEC", 3600.0)

        with caplog.at_level(logging.WARNING, logger="app.main"):
            response = c.get("/api/health")

        assert response.status_code == 200
        assert "SLOW REQUEST" not in caplog.text


class TestWhichAddonsCountAsConfigured:
    """``/api/addons/status`` hides an external service whose container is
    not wired up. The two branches below are the ones that say "this addon
    needs no wiring", and hiding an addon that is in fact available is the
    failure they prevent.
    """

    def test_an_in_process_addon_needs_no_compose_wiring(self, client):
        c, _db, _drive_dir, _data_dir = client
        snapshot = dict(addon_registry._registry)
        addon_registry._registry["zz_inproc"] = {
            "label": "In process",
            "icon": "x",
            "type": "in_process",
            "scope": "global",
            "href": "/addons/zz_inproc",
        }
        try:
            body = c.get("/api/addons/status").json()
        finally:
            addon_registry._registry.clear()
            addon_registry._registry.update(snapshot)

        assert "zz_inproc" in body["addons"]

    def test_a_service_declaring_no_target_env_is_kept(self, client):
        """``target_env`` is what names the variable to look at. A proxy
        block without one is declaring that it has no switch, not that it is
        switched off."""
        c, _db, _drive_dir, _data_dir = client
        snapshot = dict(addon_registry._registry)
        addon_registry._registry["zz_noenv"] = {
            "label": "No env",
            "icon": "x",
            "type": "external_service",
            "scope": "global",
            "href": "/addons/zz_noenv",
            "proxy": {"target_default": "http://zz:9999", "routes": []},
        }
        try:
            body = c.get("/api/addons/status").json()
        finally:
            addon_registry._registry.clear()
            addon_registry._registry.update(snapshot)

        assert "zz_noenv" in body["addons"]


class TestAddonStartupHooks:
    """``on_startup`` is awaited inside the lifespan, in registration order.

    An addon's background worker failing to start is the addon's problem.
    Letting it out of the lifespan makes it everyone's: the process never
    finishes coming up, so no drive, no file and no other addon is reachable.
    """

    def test_a_hook_that_raises_does_not_stop_the_backend_or_the_next_hook(
        self, client, monkeypatch
    ):
        ran = []

        async def raises():
            ran.append("raises")
            raise RuntimeError("worker could not start")

        async def succeeds():
            ran.append("succeeds")

        monkeypatch.setattr(main, "_addon_startup_fns", [raises, succeeds])

        with TestClient(app) as second:
            assert second.get("/api/health").status_code == 200

        assert ran == ["raises", "succeeds"]
