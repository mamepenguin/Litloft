"""HTTP tests for PUT /api/internal/files/{id}/chapters.

The endpoint is the promotion boundary for addon-produced chapter
suggestions. Callers submit only chapter values; core owns provenance and
ordering, and accepts the write only with an explicitly configured secret.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.models import File, FileChapter
from app.schemas import ChapterPromotionRequest
from app.services.chapters import replace_chapters
from tests.conftest import TEST_DRIVE


def _seed_file(db, *, filename: str = "chapters.mp4") -> File:
    file = File(
        filename=filename,
        title=filename,
        drive=TEST_DRIVE,
        folder_path="",
        file_path=filename,
        file_size=10,
        file_type="video",
        mime_type="video/mp4",
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


def _seed_existing(db, file_id: str, *, source: str = "extracted") -> None:
    replace_chapters(
        db,
        file_id,
        [
            {
                "start_time": 0.0,
                "end_time": 10.0,
                "title": "Existing",
                "ordering": 0,
            }
        ],
        source,
    )
    db.commit()


def _rows(db, file_id: str) -> list[FileChapter]:
    db.expire_all()
    return (
        db.query(FileChapter)
        .filter(FileChapter.file_id == file_id)
        .order_by(FileChapter.ordering, FileChapter.id)
        .all()
    )


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ({"chapters": [{"start_time": 0, "end_time": 1, "title": " A "}]}, [{"start_time": 0.0, "end_time": 1.0, "title": "A", "ordering": 0}]),
        ({"chapters": [{"start_time": float("nan"), "title": "bad"}]}, []),
        ({"chapters": [{"start_time": 1, "end_time": float("inf"), "title": "ok"}]}, [{"start_time": 1.0, "end_time": None, "title": "ok", "ordering": 0}]),
        ({"chapters": [{"start_time": 1, "title": "   "}]}, []),
        ({"chapters": [{"start_time": 2, "title": "B"}, {"start_time": 1, "title": "A"}]}, [{"start_time": 2.0, "end_time": None, "title": "B", "ordering": 0}, {"start_time": 1.0, "end_time": None, "title": "A", "ordering": 1}]),
    ],
)
def test_addon_validator_parity_cases(raw, expected) -> None:
    """Exact pair table mirrored by Intelligence's contract test."""
    if not expected:
        with pytest.raises(ValueError):
            ChapterPromotionRequest.model_validate(raw)
        return
    request = ChapterPromotionRequest.model_validate(raw)
    assert request.normalised_chapters() == expected


def _put(client, file_id: str, chapters: list[dict], **kwargs):
    headers = {"X-Internal-Secret": "topsecret"}
    headers.update(kwargs.pop("headers", {}))
    return client.put(
        f"/api/internal/files/{file_id}/chapters",
        json={"chapters": chapters},
        headers=headers,
        **kwargs,
    )


class TestInternalChapterSecret:
    @pytest.mark.parametrize("configured", [None, "   "])
    def test_unconfigured_secret_returns_503_without_mutating(
        self, client, monkeypatch, configured
    ) -> None:
        c, db, _, _ = client
        if configured is None:
            monkeypatch.delenv("CORE_INTERNAL_SECRET", raising=False)
        else:
            monkeypatch.setenv("CORE_INTERNAL_SECRET", configured)
        file = _seed_file(db)
        _seed_existing(db, file.id)

        response = _put(
            c,
            file.id,
            [{"start_time": 4, "end_time": None, "title": "New"}],
        )

        assert response.status_code == 503
        assert [row.title for row in _rows(db, file.id)] == ["Existing"]

    @pytest.mark.parametrize("provided", [None, "wrong"])
    def test_missing_or_wrong_secret_returns_403_without_mutating(
        self, client, monkeypatch, provided
    ) -> None:
        c, db, _, _ = client
        monkeypatch.setenv("CORE_INTERNAL_SECRET", "topsecret")
        file = _seed_file(db)
        _seed_existing(db, file.id)
        headers = {} if provided is None else {"X-Internal-Secret": provided}

        response = c.put(
            f"/api/internal/files/{file.id}/chapters",
            json={
                "chapters": [
                    {"start_time": 4, "end_time": None, "title": "New"}
                ]
            },
            headers=headers,
        )

        assert response.status_code == 403
        assert [row.title for row in _rows(db, file.id)] == ["Existing"]

    def test_configured_secret_is_compared_in_constant_time(
        self, client, monkeypatch
    ) -> None:
        from app.routers import internal

        c, db, _, _ = client
        monkeypatch.setenv("CORE_INTERNAL_SECRET", "topsecret")
        file = _seed_file(db)
        calls: list[tuple[str, str]] = []
        real_compare = internal.hmac.compare_digest

        def recording_compare(provided: str, expected: str) -> bool:
            calls.append((provided, expected))
            return real_compare(provided, expected)

        monkeypatch.setattr(internal.hmac, "compare_digest", recording_compare)

        response = _put(
            c,
            file.id,
            [{"start_time": 0, "end_time": None, "title": "Approved"}],
        )

        assert response.status_code == 204
        assert calls == [("topsecret", "topsecret")]


class TestInternalChapterPromotion:
    @pytest.fixture(autouse=True)
    def _configured_secret(self, monkeypatch) -> None:
        monkeypatch.setenv("CORE_INTERNAL_SECRET", "topsecret")

    def test_replaces_whole_set_as_curated_with_dense_core_ordering(
        self, client
    ) -> None:
        c, db, _, _ = client
        file = _seed_file(db)
        _seed_existing(db, file.id)

        response = _put(
            c,
            file.id,
            [
                {"start_time": 0, "end_time": 5, "title": " Opening "},
                {"start_time": "bad", "end_time": 8, "title": "Dropped"},
                {"start_time": 9.5, "end_time": None, "title": "Closing"},
            ],
        )

        assert response.status_code == 204, response.text
        rows = _rows(db, file.id)
        assert [row.title for row in rows] == ["Opening", "Closing"]
        assert [row.ordering for row in rows] == [0, 1]
        assert {row.source for row in rows} == {"curated"}
        assert [(row.start_time, row.end_time) for row in rows] == [
            (0.0, 5.0),
            (9.5, None),
        ]

    def test_curated_input_can_replace_an_existing_curated_set(
        self, client
    ) -> None:
        c, db, _, _ = client
        file = _seed_file(db)
        _seed_existing(db, file.id, source="curated")

        response = _put(
            c,
            file.id,
            [{"start_time": 2, "end_time": 3, "title": "Replacement"}],
        )

        assert response.status_code == 204
        assert [row.title for row in _rows(db, file.id)] == ["Replacement"]

    def test_does_not_invent_time_or_title_limits(self, client) -> None:
        c, db, _, _ = client
        file = _seed_file(db)
        long_title = "x" * 10_000

        response = _put(
            c,
            file.id,
            [{"start_time": -5, "end_time": -10, "title": long_title}],
        )

        assert response.status_code == 204, response.text
        row = _rows(db, file.id)[0]
        assert (row.start_time, row.end_time, row.title) == (
            -5.0,
            -10.0,
            long_title,
        )

    @pytest.mark.parametrize(
        "payload",
        [
            {"chapters": []},
            {"chapters": [{"start_time": "bad", "title": "No time"}]},
            {"chapters": [{"start_time": 0, "title": "   "}]},
        ],
    )
    def test_empty_or_fully_invalid_input_is_422_and_never_deletes(
        self, client, payload
    ) -> None:
        c, db, _, _ = client
        file = _seed_file(db)
        _seed_existing(db, file.id)

        response = c.put(
            f"/api/internal/files/{file.id}/chapters",
            json=payload,
            headers={"X-Internal-Secret": "topsecret"},
        )

        assert response.status_code == 422
        assert [row.title for row in _rows(db, file.id)] == ["Existing"]

    @pytest.mark.parametrize(
        "payload",
        [
            {
                "chapters": [
                    {
                        "start_time": 0,
                        "title": "X",
                        "source": "extracted",
                    }
                ]
            },
            {"chapters": [{"start_time": 0, "title": "X", "ordering": 99}]},
            {"chapters": [{"start_time": 0, "title": "X"}], "source": "curated"},
        ],
    )
    def test_rejects_caller_owned_provenance_ordering_and_extra_fields(
        self, client, payload
    ) -> None:
        c, db, _, _ = client
        file = _seed_file(db)
        _seed_existing(db, file.id)

        response = c.put(
            f"/api/internal/files/{file.id}/chapters",
            json=payload,
            headers={"X-Internal-Secret": "topsecret"},
        )

        assert response.status_code == 422
        assert [row.title for row in _rows(db, file.id)] == ["Existing"]

    @pytest.mark.parametrize("state", ["missing", "trash"])
    def test_returns_404_for_non_active_file(self, client, state) -> None:
        c, db, _, _ = client
        file = _seed_file(db, filename=f"{state}.mp4")
        if state == "missing":
            file.missing_since = datetime.now(UTC)
        else:
            file.deleted_at = datetime.now(UTC)
        db.commit()

        response = _put(
            c,
            file.id,
            [{"start_time": 0, "end_time": None, "title": "X"}],
        )

        assert response.status_code == 404

    def test_returns_404_for_unknown_file(self, client) -> None:
        c, _, _, _ = client

        response = _put(
            c,
            "unknown-file",
            [{"start_time": 0, "end_time": None, "title": "X"}],
        )

        assert response.status_code == 404
