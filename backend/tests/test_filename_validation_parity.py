"""Backend half of the filename-validation parity contract.

The inline rename editor (frontend/src/lib/filename.ts) rejects bad names
locally so the user sees the problem without a round-trip, but this
module stays authoritative. Two implementations of one rule drift in
silence, so both sides read
``backend/tests/fixtures/filename_validation.json`` and one of the two
suites fails as soon as they disagree.

The frontend half is
``frontend/src/lib/__tests__/filenameValidation.parity.test.ts``.
"""

import json
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.services.fileops import validate_filename

FIXTURE = Path(__file__).parent / "fixtures" / "filename_validation.json"


def _load_cases():
    doc = json.loads(FIXTURE.read_text())
    return [
        pytest.param(
            case["name"] * case.get("repeat", 1),
            case["valid"],
            id=case["why"],
        )
        for case in doc["cases"]
    ]


CASES = _load_cases()


@pytest.mark.parametrize("name,expected_valid", CASES)
def test_validate_filename_matches_shared_contract(name, expected_valid):
    if expected_valid:
        # Returns the cleaned name; the point here is only that it does
        # not raise.
        assert validate_filename(name)
    else:
        with pytest.raises(HTTPException) as exc:
            validate_filename(name)
        assert exc.value.status_code == 400


def test_fixture_covers_both_outcomes():
    """A table that drifted into all-valid or all-invalid proves nothing."""
    outcomes = {case.values[1] for case in CASES}
    assert outcomes == {True, False}
