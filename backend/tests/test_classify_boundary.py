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
    ".org": ("document", "text/plain"),
    ".adoc": ("other", "text/plain"),
    ".cc": ("other", "text/plain"),
    ".cfg": ("other", "text/plain"),
    ".conf": ("other", "text/plain"),
    ".cpp": ("other", "text/plain"),
    ".cs": ("other", "text/plain"),
    ".cts": ("other", "text/plain"),
    ".cxx": ("other", "text/plain"),
    ".dart": ("other", "text/plain"),
    ".ex": ("other", "text/plain"),
    ".exs": ("other", "text/plain"),
    ".go": ("other", "text/plain"),
    ".gradle": ("other", "text/plain"),
    ".graphql": ("other", "text/plain"),
    ".hpp": ("other", "text/plain"),
    ".ini": ("other", "text/plain"),
    ".java": ("other", "text/plain"),
    ".jsx": ("other", "text/plain"),
    ".kt": ("other", "text/plain"),
    ".kts": ("other", "text/plain"),
    ".lua": ("other", "text/plain"),
    ".mts": ("other", "text/plain"),
    ".php": ("other", "text/plain"),
    ".proto": ("other", "text/plain"),
    ".r": ("other", "text/plain"),
    ".rb": ("other", "text/plain"),
    ".rs": ("other", "text/plain"),
    ".scala": ("other", "text/plain"),
    ".sql": ("other", "text/plain"),
    ".svelte": ("other", "text/plain"),
    ".swift": ("other", "text/plain"),
    ".tf": ("other", "text/plain"),
    ".tfvars": ("other", "text/plain"),
    ".toml": ("other", "text/plain"),
    ".ts": ("other", "text/plain"),
    ".tsx": ("other", "text/plain"),
    ".vue": ("other", "text/plain"),
    ".yaml": ("other", "text/plain"),
    ".yml": ("other", "text/plain"),
    ".zsh": ("other", "text/plain"),
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


def test_a_source_file_is_still_text_to_everything_that_reads_the_mime():
    """The bucket is what Litloft does with the file; the mime is what its
    bytes are. Only the first moved."""
    for extension in list(MOVED_OUT_OF_DOCUMENT) + [".ts", ".rs", ".go"]:
        file_type, mime = classify("x" + extension)
        assert file_type == "other"
        assert mime.startswith("text/"), extension


def test_the_two_families_the_ledger_recorded_are_reachable_now():
    assert classify("pic.webp") == ("image", "image/webp")
    assert classify("clip.m2ts") == ("video", "video/mp2t")


def test_the_ambiguous_family_answers_one_way():
    """`.mts` names an AVCHD stream and a TypeScript ESM module. One answer,
    the same as the rest of its family."""
    assert classify("a.ts") == classify("a.cts") == classify("a.mts")
    assert classify("a.mts") == ("other", "text/plain")


def test_prose_markup_is_a_document_and_source_is_not():
    assert classify("guide.rst")[0] == "document"
    assert classify("notes.org")[0] == "document"
    assert classify("table.csv")[0] == "document"
    assert classify("table.tsv")[0] == "document"
    assert classify("main.py")[0] == "other"
