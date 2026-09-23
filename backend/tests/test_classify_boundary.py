"""What phase 2 moved, declared row by row.

The golden fixture records what the classifier answered before any of this.
Phase 1 reproduced it exactly; this phase does not, and every row where it
differs is named here. Editing this file is how the decision is recorded — a
row that moves without an edit here fails, and so does an edit here without the
move.
"""

import json
from pathlib import Path

import pytest

from app.services.filetype import (
    DEFAULT_CLASSIFICATION,
    _EXTENSION_TABLE,
    classify,
)

GOLDEN = Path(__file__).parent / "fixtures" / "classify_golden.json"


def _parent() -> dict[str, tuple[str, str]]:
    raw = json.loads(GOLDEN.read_text())
    return {
        name[len("sample"):]: tuple(answer)
        for name, answer in raw.items()
        if name.startswith("sample")
    }


# Source code and machine-read data leaving `document`. The mime does not move
# with the bucket: these are text, and the content-write allowlist, the addon
# read allowlist and the indexer all read the mime.
MOVED_OUT_OF_DOCUMENT = {
    ".bat": "text/plain",
    ".c": "text/plain",
    ".css": "text/css",
    ".h": "text/plain",
    ".js": "text/javascript",
    ".ksh": "text/plain",
    ".mjs": "text/javascript",
    ".n3": "text/n3",
    ".pl": "text/plain",
    ".py": "text/x-python",
    ".sgm": "text/x-sgml",
    ".sgml": "text/x-sgml",
    ".vcf": "text/x-vcard",
    ".xml": "text/xml",
}

# Extensions the table never held, which answered `other`/octet-stream by
# default and now answer deliberately.
ADDED = {
    ".webp": ("image", "image/webp"),
    ".m2ts": ("video", "video/mp2t"),
    ".org": ("document", "application/octet-stream"),
    ".adoc": ("other", "application/octet-stream"),
    ".cc": ("other", "application/octet-stream"),
    ".cfg": ("other", "application/octet-stream"),
    ".conf": ("other", "application/octet-stream"),
    ".cpp": ("other", "application/octet-stream"),
    ".cs": ("other", "application/octet-stream"),
    ".cts": ("other", "application/octet-stream"),
    ".cxx": ("other", "application/octet-stream"),
    ".dart": ("other", "application/octet-stream"),
    ".ex": ("other", "application/octet-stream"),
    ".exs": ("other", "application/octet-stream"),
    ".go": ("other", "application/octet-stream"),
    ".gradle": ("other", "application/octet-stream"),
    ".graphql": ("other", "application/octet-stream"),
    ".hpp": ("other", "application/octet-stream"),
    ".ini": ("other", "application/octet-stream"),
    ".java": ("other", "application/octet-stream"),
    ".jsx": ("other", "application/octet-stream"),
    ".kt": ("other", "application/octet-stream"),
    ".kts": ("other", "application/octet-stream"),
    ".lua": ("other", "application/octet-stream"),
    ".mts": ("other", "application/octet-stream"),
    ".php": ("other", "application/octet-stream"),
    ".proto": ("other", "application/octet-stream"),
    ".r": ("other", "application/octet-stream"),
    ".rb": ("other", "application/octet-stream"),
    ".rs": ("other", "application/octet-stream"),
    ".scala": ("other", "application/octet-stream"),
    ".sql": ("other", "application/octet-stream"),
    ".svelte": ("other", "application/octet-stream"),
    ".swift": ("other", "application/octet-stream"),
    ".tf": ("other", "application/octet-stream"),
    ".tfvars": ("other", "application/octet-stream"),
    ".toml": ("other", "application/octet-stream"),
    ".ts": ("other", "application/octet-stream"),
    ".tsx": ("other", "application/octet-stream"),
    ".vue": ("other", "application/octet-stream"),
    ".yaml": ("other", "application/octet-stream"),
    ".yml": ("other", "application/octet-stream"),
    ".zsh": ("other", "application/octet-stream"),
}


@pytest.mark.parametrize("extension", sorted(MOVED_OUT_OF_DOCUMENT))
def test_a_source_file_leaves_document_and_keeps_its_mime(extension):
    was = _parent()[extension]
    assert was[0] == "document", f"{extension} was not a document to begin with"
    assert classify("x" + extension) == ("other", MOVED_OUT_OF_DOCUMENT[extension])
    assert classify("x" + extension)[1] == was[1], "the mime moved with the bucket"


@pytest.mark.parametrize("extension", sorted(ADDED))
def test_an_extension_the_table_never_held_now_answers(extension):
    assert _parent().get(extension, DEFAULT_CLASSIFICATION) == DEFAULT_CLASSIFICATION
    assert classify("x" + extension) == ADDED[extension]


def test_the_table_moved_nothing_that_is_not_declared():
    parent = _parent()
    undeclared = {
        ext: (parent.get(ext), now)
        for ext, now in _EXTENSION_TABLE.items()
        if parent.get(ext, DEFAULT_CLASSIFICATION) != now
        and ext not in MOVED_OUT_OF_DOCUMENT
        and ext not in ADDED
    }
    assert undeclared == {}


def test_no_row_changes_what_an_allowlist_accepts():
    """`PUT /api/files/{id}/content` and `GET /api/internal/files/{id}/content`
    are keyed on the mime, and the second serves a protected drive without a
    drive-unlock check. Naming a bucket must not open either one: a row that
    answered `application/octet-stream` still does.

    Reached once. Forty-three rows were given `text/plain` because a source
    file is text, which turned `.tfvars`, `.conf` and `.ini` from refused into
    served."""
    from app.routers.files import _TEXT_WRITE_ALLOWED_MIMES as WRITE
    from app.routers.internal import _CONTENT_READ_ALLOWED_MIMES as READ

    for extension, expected in ADDED.items():
        mime = expected[1]
        assert mime not in READ, f"{extension} would be readable by an addon"
        assert mime not in WRITE, f"{extension} would be writable"

    for extension, mime in MOVED_OUT_OF_DOCUMENT.items():
        assert classify("x" + extension)[1] == mime, extension


def test_the_two_families_the_ledger_recorded_are_reachable_now():
    assert classify("pic.webp") == ("image", "image/webp")
    assert classify("clip.m2ts") == ("video", "video/mp2t")


def test_the_ambiguous_family_answers_one_way():
    """`.mts` names an AVCHD stream and a TypeScript ESM module. One answer,
    the same as the rest of its family."""
    assert classify("a.ts") == classify("a.cts") == classify("a.mts")
    assert classify("a.mts") == ("other", "application/octet-stream")


def test_prose_markup_is_a_document_and_source_is_not():
    assert classify("guide.rst")[0] == "document"
    assert classify("notes.org")[0] == "document"
    assert classify("table.csv")[0] == "document"
    assert classify("table.tsv")[0] == "document"
    assert classify("main.py")[0] == "other"
