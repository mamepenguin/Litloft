"""Retention of done rows: SPEC-CORE-032 I11.

The retention step runs in the trash auto-purge task, after its purge step,
once per pass, and its failure is isolated from the purge.
"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import text

from app.main import purge_expired_trash
from app.models import File
from tests.inbox_helpers import db_ts, rows, seed, set_deleted_at, update_row


class _PassEnded(Exception):
    """Ends one pass of the loop without waiting a day for the next one."""


@pytest.fixture()
def one_pass(monkeypatch):
    """Run ``purge_expired_trash`` once, then stop at its sleep."""
    reached_sleep: list[float] = []

    async def fake_sleep(seconds):
        reached_sleep.append(seconds)
        raise _PassEnded

    shim = SimpleNamespace(
        to_thread=asyncio.to_thread,
        sleep=fake_sleep,
        create_task=asyncio.create_task,
    )
    monkeypatch.setattr("app.main.asyncio", shim)

    def run():
        loop = asyncio.new_event_loop()
        try:
            with pytest.raises(_PassEnded):
                loop.run_until_complete(purge_expired_trash())
        finally:
            loop.close()
        assert reached_sleep, "the loop stopped before its sleep"

    return run


def _days_ago(days: int) -> str:
    return db_ts(datetime.now(UTC) - timedelta(days=days))


def test_a_done_row_is_deleted_thirty_days_after_done_at(client, one_pass):
    """SPEC-CORE-032 I11: done rows expire at 30 days; open rows do not."""
    c, db, drive_dir, _ = client
    old = seed(c, db, "old.md")
    recent = seed(c, db, "recent.md")
    open_row = seed(c, db, "open.md")
    update_row(db, old, done_at=_days_ago(31))
    update_row(db, recent, done_at=_days_ago(29))

    one_pass()

    assert rows(db, file_id=old) == []
    assert rows(db, file_id=recent) != []
    assert rows(db, file_id=open_row) != []


def test_a_retention_failure_leaves_the_trash_purge_result_unchanged(
    client, one_pass, caplog
):
    """SPEC-CORE-032 I11: a retention error is logged at WARNING and skipped."""
    c, db, drive_dir, _ = client
    trashed = seed(c, db, "trashed.md")
    assert c.delete(f"/api/files/{trashed}").status_code == 200
    set_deleted_at(db, trashed, _days_ago(31))
    db.execute(text("DROP TABLE IF EXISTS inbox_items"))
    db.commit()

    with caplog.at_level(logging.WARNING):
        one_pass()

    db.expire_all()
    assert db.query(File).filter(File.id == trashed).first() is None
    assert any(record.levelno == logging.WARNING for record in caplog.records)
