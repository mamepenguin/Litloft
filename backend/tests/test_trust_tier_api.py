"""Trust-tier read and write paths.

Spec: docs/superpowers/specs/2026-08-29-web-clip-promotion.md §5.

Two writers, deliberately asymmetric:

* the public endpoint is a person vouching for a source, so it stamps
  ``trust_reviewed_at``;
* the internal endpoint is an addon declaring a tier as it ingests a file,
  so it must leave that stamp alone.

``POST /filter-file-ids`` grows an optional trust filter rather than a
second data path into core's schema.
"""

from __future__ import annotations

import pytest

from app.models import File
from tests.conftest import TEST_DRIVE


def _seed(db, *, filename="clip.md", tier="verified", reviewed_at=None) -> File:
    file = File(
        filename=filename,
        title=filename,
        drive=TEST_DRIVE,
        folder_path="",
        file_path=filename,
        file_size=10,
        file_type="document",
        mime_type="text/markdown",
        trust_tier=tier,
        trust_reviewed_at=reviewed_at,
    )
    db.add(file)
    db.commit()
    db.refresh(file)
    return file


class TestPublicTrustTierEndpoint:
    def test_demote_sets_tier_and_stamps_review(self, client):
        c, db, _, _ = client
        file = _seed(db)

        resp = c.put(
            f"/api/files/{file.id}/trust-tier", json={"tier": "unverified"}
        )

        assert resp.status_code == 200
        assert resp.json()["trust_tier"] == "unverified"
        assert resp.json()["trust_reviewed_at"] is not None
        db.expire_all()
        assert db.get(File, file.id).trust_tier == "unverified"

    def test_promote_sets_tier_and_stamps_review(self, client):
        c, db, _, _ = client
        file = _seed(db, tier="unverified")

        resp = c.put(
            f"/api/files/{file.id}/trust-tier", json={"tier": "verified"}
        )

        assert resp.status_code == 200
        assert resp.json()["trust_tier"] == "verified"
        assert resp.json()["trust_reviewed_at"] is not None

    def test_promoting_an_already_verified_file_still_stamps_review(self, client):
        """A migrated row is 'verified' but unreviewed; confirming it matters."""
        c, db, _, _ = client
        file = _seed(db, tier="verified", reviewed_at=None)

        resp = c.put(
            f"/api/files/{file.id}/trust-tier", json={"tier": "verified"}
        )

        assert resp.status_code == 200
        assert resp.json()["trust_reviewed_at"] is not None

    @pytest.mark.parametrize("payload", [
        {"tier": "bogus"},
        {"tier": ""},
        {},
        {"tier": "verified", "unexpected": 1},
    ])
    def test_invalid_payload_is_422(self, client, payload):
        c, db, _, _ = client
        file = _seed(db)
        resp = c.put(f"/api/files/{file.id}/trust-tier", json=payload)
        assert resp.status_code == 422

    def test_unknown_file_is_404(self, client):
        c, _, _, _ = client
        resp = c.put(
            "/api/files/aaaaaaaaaaaa/trust-tier", json={"tier": "verified"}
        )
        assert resp.status_code == 404

    def test_response_exposes_trust_fields_on_plain_reads(self, client):
        c, db, _, _ = client
        file = _seed(db, tier="unverified")
        body = c.get(f"/api/files/{file.id}").json()
        assert body["trust_tier"] == "unverified"
        assert body["trust_reviewed_at"] is None


class TestInternalTrustTierEndpoint:
    URL = "/api/internal/files/{}/trust-tier"

    def test_ingest_declaration_does_not_stamp_review(self, client, monkeypatch):
        """An addon has reviewed nothing; only a person stamps the column."""
        monkeypatch.setenv("CORE_INTERNAL_SECRET", "topsecret")
        c, db, _, _ = client
        file = _seed(db)

        resp = c.put(
            self.URL.format(file.id),
            json={"tier": "unverified"},
            headers={"X-Internal-Secret": "topsecret"},
        )

        assert resp.status_code == 204
        db.expire_all()
        row = db.get(File, file.id)
        assert row.trust_tier == "unverified"
        assert row.trust_reviewed_at is None

    def test_ingest_does_not_override_a_viewer_decision(self, client, monkeypatch):
        """A person's ruling wins; the addon must not inherit their stamp.

        Overwriting the tier while ``trust_reviewed_at`` stands would leave
        the addon's decision wearing a human's timestamp, which is exactly
        the distinction the review queue depends on.
        """
        monkeypatch.setenv("CORE_INTERNAL_SECRET", "topsecret")
        c, db, _, _ = client
        file = _seed(db)
        c.put(f"/api/files/{file.id}/trust-tier", json={"tier": "verified"})
        db.expire_all()
        reviewed_at = db.get(File, file.id).trust_reviewed_at

        resp = c.put(
            self.URL.format(file.id),
            json={"tier": "unverified"},
            headers={"X-Internal-Secret": "topsecret"},
        )

        assert resp.status_code == 409
        db.expire_all()
        row = db.get(File, file.id)
        assert row.trust_tier == "verified"
        assert row.trust_reviewed_at == reviewed_at

    def test_unset_secret_fails_closed_with_503(self, client, monkeypatch):
        monkeypatch.delenv("CORE_INTERNAL_SECRET", raising=False)
        c, db, _, _ = client
        file = _seed(db)

        resp = c.put(self.URL.format(file.id), json={"tier": "unverified"})
        assert resp.status_code == 503

    @pytest.mark.parametrize("provided", [None, "wrong"])
    def test_missing_or_wrong_secret_is_403(self, client, monkeypatch, provided):
        monkeypatch.setenv("CORE_INTERNAL_SECRET", "topsecret")
        c, db, _, _ = client
        file = _seed(db)
        headers = {} if provided is None else {"X-Internal-Secret": provided}

        resp = c.put(
            self.URL.format(file.id), json={"tier": "unverified"}, headers=headers
        )
        assert resp.status_code == 403

    def test_invalid_tier_is_422(self, client, monkeypatch):
        monkeypatch.setenv("CORE_INTERNAL_SECRET", "topsecret")
        c, db, _, _ = client
        file = _seed(db)

        resp = c.put(
            self.URL.format(file.id),
            json={"tier": "bogus"},
            headers={"X-Internal-Secret": "topsecret"},
        )
        assert resp.status_code == 422

    def test_unknown_file_is_404(self, client, monkeypatch):
        monkeypatch.setenv("CORE_INTERNAL_SECRET", "topsecret")
        c, _, _, _ = client
        resp = c.put(
            self.URL.format("aaaaaaaaaaaa"),
            json={"tier": "verified"},
            headers={"X-Internal-Secret": "topsecret"},
        )
        assert resp.status_code == 404


class TestFilterFileIdsTrustFilter:
    URL = "/api/internal/filter-file-ids"

    def test_absent_filter_keeps_existing_behaviour(self, client):
        """Every existing caller must be unaffected by the new parameter."""
        c, db, _, _ = client
        good = _seed(db, filename="a.md", tier="verified")
        bad = _seed(db, filename="b.md", tier="unverified")

        resp = c.post(self.URL, json={"file_ids": [good.id, bad.id]})

        assert resp.status_code == 200
        assert set(resp.json()["accessible"]) == {good.id, bad.id}

    def test_verified_filter_drops_unverified(self, client):
        c, db, _, _ = client
        good = _seed(db, filename="a.md", tier="verified")
        bad = _seed(db, filename="b.md", tier="unverified")

        resp = c.post(
            self.URL,
            json={"file_ids": [good.id, bad.id], "trust_tier": "verified"},
        )

        assert resp.json()["accessible"] == [good.id]

    def test_unverified_filter_selects_the_review_queue(self, client):
        c, db, _, _ = client
        good = _seed(db, filename="a.md", tier="verified")
        bad = _seed(db, filename="b.md", tier="unverified")

        resp = c.post(
            self.URL,
            json={"file_ids": [good.id, bad.id], "trust_tier": "unverified"},
        )

        assert resp.json()["accessible"] == [bad.id]

    def test_invalid_trust_tier_is_422(self, client):
        c, db, _, _ = client
        file = _seed(db)
        resp = c.post(
            self.URL, json={"file_ids": [file.id], "trust_tier": "bogus"}
        )
        assert resp.status_code == 422
