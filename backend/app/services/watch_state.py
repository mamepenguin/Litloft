"""The viewer's watch state: their history row, joined, and its three-way bucket."""

from typing import Literal

from sqlalchemy import and_, case

from app.models import File, WatchHistory

WatchState = Literal["in_progress", "unwatched", "finished"]
WATCH_KEYS: tuple[WatchState, ...] = ("in_progress", "unwatched", "finished")


def join_watch(query, viewer_id: str):
    """Attach the viewer's own history row to each file, if any."""
    return query.outerjoin(
        WatchHistory,
        and_(
            WatchHistory.file_id == File.id,
            WatchHistory.viewer_id == viewer_id,
        ),
    )


def watch_bucket():
    known = WatchHistory.duration > 0
    # Multiplied out so the 90% boundary involves no float rounding.
    finished = and_(
        known, WatchHistory.playback_position * 10 >= WatchHistory.duration * 9
    )
    started = and_(known, WatchHistory.playback_position > 0)
    return case(
        (finished, "finished"), (started, "in_progress"), else_="unwatched"
    )
