"""The startup trash auto-purge: ``main._run_purge_batch`` and its wrapper.

This is the only code in the tree that deletes a user's files from disk
without the user asking at that moment, so the properties held here are the
ones whose failure is unrecoverable: what the cutoff admits, that a file
that cannot be deleted does not take the run down with it, and that the run
ends.

``test_trash.py::test_purge_cleans_empty_folders`` writes the batch query,
the folder collection and the delete out again in its own body instead of
calling ``_run_purge_batch``. It therefore holds nothing about this function:
a defect in the loop leaves it green.
"""

import asyncio
import shutil
import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

import app.main as main
from app.models import File
from tests.conftest import TEST_DRIVE

FIXTURES_DIR = Path(__file__).parent / "fixtures"

# The bound on a run that is supposed to end. ``_run_purge_batch`` re-runs
# its query from the top rather than paging, so a row it cannot delete and
# does not exclude comes back unchanged forever — a failure with no error and
# no end. Any finite bound tells that apart from a slow run; the value only
# has to clear the slowest honest case here, which is one chunk-and-a-half of
# real deletes.
_TERMINATION_TIMEOUT_SECONDS = 20


def _seed_trashed(db, drive_dir, filename, *, days_ago, folder="trash-src", on_disk=True):
    """Insert one soft-deleted row, optionally with a real file behind it."""
    file_path = f"{folder}/{filename}" if folder else filename
    if on_disk:
        target_dir = drive_dir / folder if folder else drive_dir
        target_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy(FIXTURES_DIR / "short_video.mp4", target_dir / filename)
        size = (target_dir / filename).stat().st_size
    else:
        size = 1
    file = File(
        filename=filename,
        title=filename,
        drive=TEST_DRIVE,
        folder_path=folder,
        file_path=file_path,
        file_size=size,
        file_type="video",
        mime_type="video/mp4",
        deleted_at=datetime.now(UTC) - timedelta(days=days_ago),
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


def _cutoff(days=main.TRASH_RETENTION_DAYS):
    return datetime.now(UTC) - timedelta(days=days)


def _run_with_deadline(fn):
    """Call ``fn`` on a thread and fail rather than hang if it does not return.

    ``pytest-timeout`` is not installed here, and a non-terminating
    ``_run_purge_batch`` otherwise stalls the whole suite instead of failing
    one test.
    """
    box = {}

    def target():
        try:
            box["value"] = fn()
        except BaseException as exc:  # surfaced below, on the main thread
            box["error"] = exc

    thread = threading.Thread(target=target, daemon=True)
    thread.start()
    thread.join(timeout=_TERMINATION_TIMEOUT_SECONDS)
    if thread.is_alive():
        pytest.fail(
            f"_run_purge_batch did not return within "
            f"{_TERMINATION_TIMEOUT_SECONDS}s — the batch loop is not making "
            f"progress"
        )
    if "error" in box:
        raise box["error"]
    return box["value"]


class TestWhatTheCutoffAdmits:
    def test_a_row_older_than_the_cutoff_is_deleted_from_disk_and_db(
        self, client
    ):
        c, db, drive_dir, _ = client
        file_id = _seed_trashed(db, drive_dir, "old.mp4", days_ago=31).id
        on_disk = drive_dir / "trash-src" / "old.mp4"
        assert on_disk.exists()

        purged_ids, folders, drives = _run_with_deadline(
            lambda: main._run_purge_batch(_cutoff())
        )

        assert purged_ids == [file_id]
        assert folders == {(TEST_DRIVE, "trash-src")}
        assert drives == {TEST_DRIVE}
        assert not on_disk.exists()
        db.expire_all()
        assert db.query(File).filter(File.id == file_id).first() is None

    def test_a_row_at_the_drive_root_queues_no_folder_cleanup(self, client):
        """``folder_path`` is empty for a file sitting at the drive root.

        Queuing it would hand ``_rmdir_up_to_root`` the root itself. That
        call is refused there too, but the refusal belongs to the walk and
        the row should not reach it.
        """
        c, db, drive_dir, _ = client
        file_id = _seed_trashed(
            db, drive_dir, "root.mp4", days_ago=31, folder=""
        ).id

        purged_ids, folders, drives = _run_with_deadline(
            lambda: main._run_purge_batch(_cutoff())
        )

        assert purged_ids == [file_id]
        assert folders == set()
        assert drives == {TEST_DRIVE}
        assert drive_dir.is_dir()

    def test_a_row_newer_than_the_cutoff_is_left_alone(self, client):
        c, db, drive_dir, _ = client
        file_id = _seed_trashed(db, drive_dir, "recent.mp4", days_ago=29).id
        on_disk = drive_dir / "trash-src" / "recent.mp4"

        purged_ids, folders, drives = _run_with_deadline(
            lambda: main._run_purge_batch(_cutoff())
        )

        assert purged_ids == []
        assert folders == set()
        assert drives == set()
        assert on_disk.exists()
        db.expire_all()
        assert db.query(File).filter(File.id == file_id).first() is not None

    def test_an_active_row_older_than_the_cutoff_is_not_trash(self, client):
        """The window is on ``deleted_at``, not on age.

        A file that has sat in a drive for years has ``deleted_at IS NULL``
        and must never enter the batch. Measured: what refuses it is SQL's
        three-valued logic — ``NULL < cutoff`` evaluates to NULL, so the
        comparison excludes the row on its own and this test is still green
        with the ``isnot(None)`` clause deleted. It holds the outcome rather
        than either clause, which is the property that has to survive
        whichever of them a later edit rewrites.
        """
        c, db, drive_dir, _ = client
        file = _seed_trashed(db, drive_dir, "active.mp4", days_ago=999)
        file.deleted_at = None
        db.commit()
        on_disk = drive_dir / "trash-src" / "active.mp4"

        purged_ids, _folders, _drives = _run_with_deadline(
            lambda: main._run_purge_batch(_cutoff())
        )

        assert purged_ids == []
        assert on_disk.exists()

    def test_a_missing_row_is_not_trash_either(self, client):
        """``missing_since`` and ``deleted_at`` are mutually exclusive states.

        ``design-decisions.md`` §File state: missing files are kept
        indefinitely and are never auto-purged — only an explicit user action
        removes them. A missing row carries ``deleted_at IS NULL``, so it is
        excluded by the same comparison as the test above and for the same
        reason; what is held here is that the two states stay exclusive.
        """
        c, db, drive_dir, _ = client
        file = _seed_trashed(db, drive_dir, "gone.mp4", days_ago=999)
        file.deleted_at = None
        file.missing_since = datetime.now(UTC) - timedelta(days=999)
        db.commit()
        file_id = file.id

        purged_ids, _folders, _drives = _run_with_deadline(
            lambda: main._run_purge_batch(_cutoff())
        )

        assert purged_ids == []
        db.expire_all()
        assert db.query(File).filter(File.id == file_id).first() is not None


class TestARowThatCannotBeDeleted:
    """What happens when ``physical_delete`` raises for a row in the batch.

    The reachable cause is an operator removing a drive in
    ``/admin/settings`` while files from it sit in the trash:
    ``physical_delete`` starts with ``config.get_drive_path``, which raises
    ``ValueError`` for a drive that is no longer in ``drives.json``.
    """

    def test_the_run_ends(self, client, monkeypatch):
        c, db, drive_dir, _ = client
        _seed_trashed(db, drive_dir, "stuck.mp4", days_ago=31)

        def always_raises(session, file):
            raise ValueError(f"Drive not found: {file.drive}")

        monkeypatch.setattr(main, "physical_delete", always_raises)

        purged_ids, folders, drives = _run_with_deadline(
            lambda: main._run_purge_batch(_cutoff())
        )

        assert purged_ids == []
        assert folders == set()
        assert drives == set()

    def test_the_row_survives_so_a_later_run_can_retry_it(
        self, client, monkeypatch
    ):
        c, db, drive_dir, _ = client
        file_id = _seed_trashed(db, drive_dir, "stuck.mp4", days_ago=31).id
        on_disk = drive_dir / "trash-src" / "stuck.mp4"

        def always_raises(session, target):
            raise ValueError("Drive not found")

        monkeypatch.setattr(main, "physical_delete", always_raises)
        _run_with_deadline(lambda: main._run_purge_batch(_cutoff()))

        db.expire_all()
        assert db.query(File).filter(File.id == file_id).first() is not None
        assert on_disk.exists()

    def test_the_rest_of_the_batch_is_still_purged(self, client, monkeypatch):
        c, db, drive_dir, _ = client
        stuck_id = _seed_trashed(db, drive_dir, "stuck.mp4", days_ago=31).id
        ok_one_id = _seed_trashed(db, drive_dir, "ok1.mp4", days_ago=31).id
        ok_two_id = _seed_trashed(db, drive_dir, "ok2.mp4", days_ago=31).id

        real_delete = main.physical_delete

        def raise_for_stuck(session, target):
            if target.id == stuck_id:
                raise ValueError("Drive not found")
            return real_delete(session, target)

        monkeypatch.setattr(main, "physical_delete", raise_for_stuck)

        purged_ids, _folders, _drives = _run_with_deadline(
            lambda: main._run_purge_batch(_cutoff())
        )

        assert set(purged_ids) == {ok_one_id, ok_two_id}
        db.expire_all()
        assert db.query(File).filter(File.id == stuck_id).first() is not None

    def test_its_drive_is_not_announced_as_purged(self, client, monkeypatch):
        """``purged_drives`` feeds the ``files.purged`` broadcast.

        A drive whose only candidate failed contributed no id to the event,
        so naming it tells every listener on that drive to re-read for a
        change that did not happen.
        """
        c, db, drive_dir, _ = client
        _seed_trashed(db, drive_dir, "stuck.mp4", days_ago=31)

        def always_raises(session, target):
            raise ValueError("Drive not found")

        monkeypatch.setattr(main, "physical_delete", always_raises)

        _purged_ids, folders, drives = _run_with_deadline(
            lambda: main._run_purge_batch(_cutoff())
        )

        assert drives == set()
        assert folders == set()


class TestTheBatchLoop:
    def test_more_rows_than_one_chunk_are_all_purged(self, client):
        """The loop re-runs its query rather than paging, so progress comes
        from the committed delete. A chunk-sized population would not tell a
        working loop from one that ran exactly once."""
        c, db, drive_dir, _ = client
        total = main._PURGE_BATCH_SIZE + 50
        expected = set()
        for index in range(total):
            expected.add(
                _seed_trashed(
                    db, drive_dir, f"f{index}.mp4", days_ago=31, on_disk=False
                ).id
            )
        assert len(expected) == total

        purged_ids, _folders, drives = _run_with_deadline(
            lambda: main._run_purge_batch(_cutoff())
        )

        assert set(purged_ids) == expected
        assert len(purged_ids) == total
        assert drives == {TEST_DRIVE}
        db.expire_all()
        assert db.query(File).count() == 0

    def test_a_database_failure_ends_the_run_instead_of_retrying(
        self, client, monkeypatch
    ):
        """The outer handler rolls back and breaks.

        A session that cannot query is not going to start working on the next
        pass, and the loop has no backoff, so retrying is the same spin the
        per-row exclusion exists to prevent.
        """
        c, db, drive_dir, _ = client
        _seed_trashed(db, drive_dir, "old.mp4", days_ago=31)

        class BrokenSession:
            def __init__(self):
                self.rolled_back = False
                self.closed = False

            def query(self, *args, **kwargs):
                raise RuntimeError("database is locked")

            def rollback(self):
                self.rolled_back = True

            def close(self):
                self.closed = True

        sessions = []

        def session_factory():
            session = BrokenSession()
            sessions.append(session)
            return session

        monkeypatch.setattr(main, "SessionLocal", session_factory)

        purged_ids, folders, drives = _run_with_deadline(
            lambda: main._run_purge_batch(_cutoff())
        )

        assert purged_ids == []
        assert folders == set()
        assert drives == set()
        assert len(sessions) == 1
        assert sessions[0].rolled_back is True
        assert sessions[0].closed is True


def _drive_until(make_coro):
    """Run ``make_coro`` on a private loop.

    ``test_event_loop_hygiene.py`` forbids ``asyncio.run`` in a test module:
    it claims the thread's current-loop slot and leaves it cleared, which
    broke twenty-one unrelated tests once. A private loop touches no shared
    state.
    """
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(make_coro())
    finally:
        loop.close()


class _PassRecorder:
    """Stubs for one pass of ``purge_expired_trash``, and what it did.

    ``purge_expired_trash`` loops forever with a 24-hour sleep at the end, so
    a pass is observed rather than awaited: the folder cleanup is the last
    step before that sleep, and signalling from there is what says the pass
    is over.
    """

    def __init__(self, batch_result):
        self.batch_result = batch_result
        self.cutoffs = []
        self.emits = []
        self.cleanups = []
        self.pass_done = asyncio.Event()
        self.emit_seen = asyncio.Event()

    def install(self, monkeypatch):
        def fake_batch(cutoff):
            self.cutoffs.append(cutoff)
            return self.batch_result

        async def fake_emit(event, payload, drives=None):
            self.emits.append((event, payload, drives))
            self.emit_seen.set()

        def fake_cleanup(folders):
            self.cleanups.append(folders)
            self.pass_done.set()

        monkeypatch.setattr(main, "_run_purge_batch", fake_batch)
        monkeypatch.setattr(main.event_hooks, "emit", fake_emit)
        monkeypatch.setattr(
            main, "_cleanup_empty_folders_after_purge", fake_cleanup
        )

    async def run_one_pass(self, *, expect_emit):
        """Drive exactly one pass and stop.

        The emit is fired with ``create_task`` and never awaited, so when the
        cleanup signals, it has been scheduled and not necessarily run.
        ``expect_emit`` says which of the two waits is the honest one: wait
        for the emit itself where one is expected, and where none is, yield
        once so anything already scheduled runs before the absence is
        asserted.
        """
        task = asyncio.create_task(main.purge_expired_trash())
        try:
            await asyncio.wait_for(self.pass_done.wait(), timeout=5)
            if expect_emit:
                await asyncio.wait_for(self.emit_seen.wait(), timeout=5)
            else:
                await asyncio.sleep(0)
        finally:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass


class TestTheScheduledRun:
    def test_the_cutoff_is_the_retention_window_before_now(self, monkeypatch):
        recorder = _PassRecorder(([], set(), set()))
        recorder.install(monkeypatch)

        before = datetime.now(UTC)
        _drive_until(lambda: recorder.run_one_pass(expect_emit=False))
        after = datetime.now(UTC)

        assert len(recorder.cutoffs) == 1
        cutoff = recorder.cutoffs[0]
        window = timedelta(days=main.TRASH_RETENTION_DAYS)
        assert before - window <= cutoff <= after - window

    def test_one_event_carries_every_id_of_the_run(self, monkeypatch):
        """``design-decisions.md`` §Trash: one ``files.purged`` per run, not
        per batch.

        The claim has two halves in two places. That ``_run_purge_batch``
        accumulates across its chunks is held by
        ``TestTheBatchLoop.test_more_rows_than_one_chunk_are_all_purged``,
        against the real function. Held here is the caller's half: whatever it
        is handed goes out in a single emit, with every id in it.
        """
        ids = [f"id{index:09d}" for index in range(main._PURGE_BATCH_SIZE + 50)]
        recorder = _PassRecorder((ids, set(), {"beta", "alpha"}))
        recorder.install(monkeypatch)

        _drive_until(lambda: recorder.run_one_pass(expect_emit=True))

        assert len(recorder.emits) == 1
        event, payload, drives = recorder.emits[0]
        assert event == "files.purged"
        assert payload == {"file_ids": ids}
        assert drives == ["alpha", "beta"]

    def test_nothing_purged_emits_nothing(self, monkeypatch):
        """An empty trash is every run but one. A broadcast on each would
        make every client re-read for no change."""
        recorder = _PassRecorder(([], set(), set()))
        recorder.install(monkeypatch)

        _drive_until(lambda: recorder.run_one_pass(expect_emit=False))

        assert recorder.emits == []

    def test_the_folder_cleanup_runs_whether_or_not_anything_was_purged(
        self, monkeypatch
    ):
        """It sits outside the ``if all_purged_ids`` guard.

        Against today's ``_run_purge_batch`` that placement is not reachable:
        a folder is recorded only on the same success that appends the id, so
        a non-empty folder set always arrives with a non-empty id list. What
        is pinned is the caller's contract with its collaborator — the
        cleanup is owed for every folder returned, not only for a run that
        also had something to broadcast — so a future producer that separates
        the two does not silently lose it.
        """
        folders = {("drive-a", "one/two")}
        recorder = _PassRecorder(([], folders, set()))
        recorder.install(monkeypatch)

        _drive_until(lambda: recorder.run_one_pass(expect_emit=False))

        assert recorder.cleanups == [folders]


class TestEmptyFolderCleanup:
    """``_cleanup_empty_folders_after_purge`` and the walk underneath it.

    Purging the last file in a folder leaves the directory behind, so the
    walk climbs towards the drive root removing what is empty. What it must
    not do is climb past the root, or out of the drive entirely.
    """

    def test_empty_parents_are_removed_up_to_but_not_including_the_root(
        self, client
    ):
        c, _db, drive_dir, _ = client
        leaf = drive_dir / "one" / "two" / "three"
        leaf.mkdir(parents=True)

        main._rmdir_up_to_root(leaf, drive_dir)

        assert not leaf.exists()
        assert not (drive_dir / "one" / "two").exists()
        assert not (drive_dir / "one").exists()
        assert drive_dir.is_dir()

    def test_a_parent_that_still_holds_something_stops_the_walk(self, client):
        """Measured: the ``break`` after a failed ``rmdir`` is an early exit.

        Replacing it with ``pass`` keeps this green — every ancestor of a
        directory that could not be removed still contains it, so each one
        fails in turn and the walk ends at the root anyway. What the test
        holds is that the folder and its contents survive, which stays true
        however the loop is spelled.
        """
        c, _db, drive_dir, _ = client
        leaf = drive_dir / "keep" / "empty"
        leaf.mkdir(parents=True)
        (drive_dir / "keep" / "other.txt").write_text("still here")

        main._rmdir_up_to_root(leaf, drive_dir)

        assert not leaf.exists()
        assert (drive_dir / "keep").is_dir()
        assert (drive_dir / "keep" / "other.txt").read_text() == "still here"

    def test_a_directory_that_is_already_gone_stops_the_walk(self, client):
        """Two rows in one folder both reach here, and the first removal wins.

        The second call finds nothing at the path and must leave the parent
        alone. Measured: the ``is_dir`` check above the ``rmdir`` is an early
        exit and not the refusal — deleting it keeps this green, because
        ``rmdir`` on a path that is not a directory raises ``OSError`` and the
        handler below ends the walk. Held as the outcome, which is what a
        rewrite of either has to preserve.
        """
        c, _db, drive_dir, _ = client
        parent = drive_dir / "parent"
        parent.mkdir()

        main._rmdir_up_to_root(parent / "already-removed", drive_dir)

        assert parent.is_dir()

    def test_the_walk_does_not_leave_the_drive(self, client):
        """``folder_path`` comes out of the database, and the walk resolves
        it against the drive root before climbing. A row carrying a traversal
        would otherwise have this function removing directories on the host.
        """
        c, _db, drive_dir, _ = client
        outside = drive_dir.parent / "outside-the-drive"
        outside.mkdir()

        main._rmdir_up_to_root(drive_dir / ".." / "outside-the-drive", drive_dir)

        assert outside.is_dir()

    def test_the_drive_root_itself_is_never_removed(self, client):
        c, _db, drive_dir, _ = client

        main._rmdir_up_to_root(drive_dir, drive_dir)

        assert drive_dir.is_dir()

    def test_a_drive_that_left_drives_json_does_not_stop_the_others(
        self, client
    ):
        """One unresolvable drive must not cost the rest their cleanup.

        The loop resolves each drive by name, and a drive removed in
        ``/admin/settings`` raises ``ValueError`` there. Letting it escape
        would abandon every folder queued behind it.
        """
        c, _db, drive_dir, _ = client
        leaf = drive_dir / "cleanable"
        leaf.mkdir()

        main._cleanup_empty_folders_after_purge(
            {("no-such-drive", "whatever"), (TEST_DRIVE, "cleanable")}
        )

        assert not leaf.exists()
        assert drive_dir.is_dir()
