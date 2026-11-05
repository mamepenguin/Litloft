# Triage: r2

## Warnings

- R-5 ran at af285330da8e6d6884dafd1dedf020e80e0340d1, and these files changed since: DESIGN.md, docs/addons/intelligence.md, docs/reference/api.md, docs/user-guide/keyboard-shortcuts.md, docs/user-guide/search.md and 4 more; run R-5 again if any of them changes what a user sees

## Trajectory

This run:
- claude-deep: The two fix commits since r1 add no production branch, state or prediction. f6a756b6f adds only tests (backend normalisation, cap, drive-scope and case tests; frontend chip-removal, quote and cap tests). fe2c93839 adds addon tests and moves the submodule pointer to the commit that holds them. Nothing is patched into the design and nothing was removed. The r1 findings were scope-list notes, so no code fix was owed.
- claude-read: The two fix commits only add tests and move the addon pointer to the commit with the killing tests. Neither adds a branch, state or prediction to production code. No round adds a branch the previous round also added, and no round removes one. This is not patching of the design.

Earlier runs:
- none

C findings so far: 0

## Verdict

Verdict: PASS

Reasons:
- none

## Findings

A: 0
B: 3
C: 0

### claude-deep:F1 — bucket B, LOW, open

Claim: activeOperatorValue finds the token being typed by cutting at the last space, tab or ideographic space. It does not use the tokenizer, so a closed quoted value that contains whitespace and an operator-looking word can be read as a live partial value.
Impact: In the modal, a closed token such as tag:"x tag:y" followed by the caret at the end can offer suggestions. Accepting one rewrites from the last space and corrupts the quoted token. This needs a quoted value that itself contains a space and an operator name, so it is rare for a single user.
Evidence: frontend/src/lib/searchQuery.ts activeOperatorValue: the new guard only returns null when the last token has an open quote. replaceFrom still comes from lastIndexOf on space characters, and PARTIAL is matched against the text after that point. The added tests in searchScopeOperators.test.ts cover only the unterminated-quote case.
Repro: not_reproduced (read-only review; derived from reading the code)
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Derive the active token from tokenize(): take the last token only when it is not closed and has the name form, and compute replaceFrom from its start offset.

</details>

### claude-read:F1 — bucket B, LOW, open

Claim: The menu's tag list does not drop tags that contain a quote character, although folders and collections are filtered with hasQuote.
Impact: A tag whose name starts with a quote is written as tag:"name, which the tokenizer reads as an open quoted value for a different tag, so the chip and the filter do not match the tag the user chose. This needs a tag name containing a quote, which is rare.
Evidence: frontend/src/components/search/SearchQueryHeader.tsx:207-214: tagOptions comes from suggestValues with no hasQuote filter, while folderOptions and collectionOptions filter with hasQuote. The spec (item 6) says a value containing a quote is not offered by the menu.
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

<details><summary>Proposed fix</summary>

> Filter tag options with hasQuote, as the other two lists do.

</details>

### claude-read:F2 — bucket B, INFO, open

Claim: The frontend trims collection names with JS trim() and lowercases with toLowerCase(), while the core uses Python strip() and lower(). The two differ for a few exotic characters.
Impact: A collection value with a character such as U+FEFF or a control separator may be accepted by the parser but be trimmed differently, or be deduplicated differently, by the core. The two sides could then produce a different count or set of names. This is a corner case that normal personal use does not reach.
Evidence: frontend/src/lib/searchQuery.ts normaliseCollection uses value.trim() and interpret uses toLowerCase(). backend/app/routers/drives.py normalize_collections uses raw.strip() and name.lower().
Repro: not_reproduced
Introduced: introduced
Reviewer bucket: B | Author bucket: 

## Not verified

- claude-deep: I ran no tests, no mutation run and no browser layout spec.
- claude-deep: I did not read the addon source on disk, only the diff.
- claude-deep: I did not check the File.folder_path column collation or whether stored paths are always NFC.
- claude-deep: I did not read callers of parseSearchQuery outside the diff.
- claude-deep: I did not exercise the menu's concurrent-load behaviour.
- claude-read: I ran no tests, mutations or the browser layout test.
- claude-read: I did not read the callers of parseSearchQuery outside the diff.
- claude-read: I did not read the addon source on disk beyond the diff.
- claude-read: I did not confirm that the Python and JS whitespace and lowercasing differences are reachable.
- claude-read: I did not read the unchanged suggestValues function.
- claude-verify: Backend normalize_collections, since I only read the frontend and the spec
- claude-verify: Invariants I1-I4, I7, I10 and I14, and the e2e layout
- claude-verify: Test contents and whether they pass
- claude-verify: Addon file_matching.py

TOTAL: 3 findings
