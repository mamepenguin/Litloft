"""`_filename_to_title` against the table the frontend reads too.

The search result row decides whether to repeat a filename under a title by
asking whether the title already derives from it. That question has an
answer only if both sides agree on how a title is derived, and they cannot
share code — one is Python in a container, the other TypeScript in a
browser. So they share a table instead.
"""

import json
from pathlib import Path

import pytest

from app.services.fileops import _filename_to_title

FIXTURE = Path(__file__).parent / "fixtures" / "filename_title.json"
CASES = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]


def test_the_whole_table_is_read():
    assert len(CASES) == 26


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["filename"])
def test_matches_the_shared_table(case):
    assert _filename_to_title(case["filename"]) == case["title"]
