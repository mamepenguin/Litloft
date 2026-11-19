"""The stretches of a file a viewer has played, as seekable ranges."""

from sqlalchemy.orm import Session

from app.models import PlayedSegment
from app.schemas import PLAYED_SEGMENT_SECONDS, WatchedRange


def watched_ranges_by_file(
    db: Session, viewer_id: str, durations: dict[str, float]
) -> dict[str, list[WatchedRange]]:
    """One read for every file in a list response, keyed by file id.

    ``durations`` comes from the response's ``watch_progress`` rows, so a
    file listed without one is never read for.
    """
    if not durations:
        return {}

    rows = (
        db.query(PlayedSegment.file_id, PlayedSegment.segment_index)
        .filter(
            PlayedSegment.viewer_id == viewer_id,
            PlayedSegment.file_id.in_(durations),
            PlayedSegment.played_seconds > 0,
        )
        .order_by(PlayedSegment.file_id, PlayedSegment.segment_index)
        .all()
    )

    indexes: dict[str, list[int]] = {file_id: [] for file_id in durations}
    for file_id, segment_index in rows:
        indexes[file_id].append(segment_index)

    return {
        file_id: _runs(segments, durations[file_id])
        for file_id, segments in indexes.items()
    }


def _runs(indexes: list[int], duration: float) -> list[WatchedRange]:
    bounds: list[tuple[int, int]] = []
    first = last = None
    for index in indexes:
        if first is None:
            first = last = index
        elif index == last + 1:
            last = index
        else:
            bounds.append((first, last))
            first = last = index
    if first is not None:
        bounds.append((first, last))

    runs = []
    for a, b in bounds:
        start = a * PLAYED_SEGMENT_SECONDS
        end = (b + 1) * PLAYED_SEGMENT_SECONDS
        if duration > 0:
            end = min(end, duration)
        if end > start:
            runs.append(WatchedRange(start=start, end=end))
    return runs
