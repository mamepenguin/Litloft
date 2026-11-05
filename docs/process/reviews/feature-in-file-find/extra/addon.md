# Review: intelligence addon, per-file find (SPEC-ADDON-061)

Reviewed: addon commit 53b9e1072f1714d6260cd781efe9846d2bbdd854 (diff 13b6b1e..53b9e10), core d68d6d297 (addon_proxy.py read only).
Method: read code, spec, I11, decisions; ran mutants in a throwaway clone with `app/` mounted into `intelligence-rev-b2`; probed `_merge_chunks` against real `ContentExtractor.chunk_text` output.
Baseline: `tests/test_file_find_endpoint.py` 84 passed.

## Findings

### F1. Overlap merge over-merges on repeated text: occurrences silently dropped at chunk boundaries

- file:line: `app/file_find.py:48-53` (`_overlap`), used by `_merge_chunks` at :56-67
- Claim: `_overlap` takes the **longest** suffix/prefix match up to 200. When the text near a chunk boundary repeats with a period p ≤ ~120 chars, a match of 80 + k·p (up to 200) also holds. The merge then treats real new text as replay and drops it. With the default `indexing.text_chunking.overlap` of 80 (text, Markdown, HTML, PDF, EPUB), each chunk boundary inside a repeated region loses (size − 80) characters. That is several whole lines, and every occurrence in them goes missing from `total` and `rows`. Spec step 3 says "longest suffix", so this follows the spec literally. The spec's premise that a match longer than the replay cannot happen is false for periodic text.
- When in ordinary use: a text, Markdown, CSV or log file, a checklist, or lyrics with a chorus, where an identical line of 120 characters or less repeats across a chunk boundary (chunks are 1000 chars) and the searched term is in that line. The bar shows fewer rows than the marks the core draws in `TextLines` / `MarkdownPreview` (those match the full text), so 「n / N」 and the marks disagree.
- Frequency: 2. Impact: 6. The count and rows are silently short, but the lost rows are identical lines, so nothing distinct is unreachable. The mismatch with the marks is visible to someone who looks.
- Evidence: probe `_merge_chunks(ContentExtractor.chunk_text(src, 1000, overlap))` against `_positions` on the source, with pristine 53b9e10 code:
  - `"- [ ] check the lighthouse lamp\n" * 120`, overlap 80: 5 chunks, 120 expected, 108 found (merged 3455 of 3839 chars).
  - a chorus of 40 identical lines, overlap 80: 40 expected, 37 found.
  - CSV with 100 identical rows, overlap 80: 100 expected, 91 found.
  - All three are correct at overlap 200, because 200 is also the cap.
  - 80 random non-periodic prose documents plus 20 CJK documents (overlap 80 and 200) all matched exactly. The merge is right for non-repeating text.
- Introduced (new code).

### F2. Test hole: chunk-order test never has 10 or more chunks, so a lexical `ORDER BY chunk_index` survives

- file:line: `app/file_find.py:114`; test `tests/test_file_find_endpoint.py:167`
- Claim: `fts_text_content.chunk_index` is stored as TEXT. The mutant `ORDER BY chunk_index` (string order: "10" < "2") passes every test, because the reversed-insertion test builds only about 6 chunks.
- Defect it lets through: every file with 10 or more chunks (any text over about 10 KB, or a long PDF page or EPUB section) would merge out of order. Overlaps would not be found, occurrences would double at the `\n` joins, and ordinals would follow the wrong reading order. All of it silent.
- Frequency (of the defect if it regressed): 8. Impact: 8.
- Evidence: mutant `order_text` SURVIVED (84 passed). `ORDER BY ci DESC` and no ORDER BY were killed.
- Introduced (new test file).

### F3. Test hole: the `document_sections` lookup is not scoped to the file under test

- file:line: `app/file_find.py:128`; tests `TestTextKinds` (:224 onward, :271)
- Claim: dropping `WHERE file_id = :file_id` from the section-title query passes every test, because each test seeds sections for one file only.
- Defect it lets through: an EPUB's `section` rows would take section titles from another book's `document_sections` with the same section number, whichever row wins the dict. That includes books on another drive (the title text crosses the drive boundary).
- Frequency (if regressed): 8 (any library with two or more EPUBs). Impact: 8 (wrong locator labels shown silently; another drive's titles leak).
- Evidence: mutant `sections_fileid` SURVIVED.
- Introduced (new test file).

### F4. Test hole: the longest-overlap choice is not pinned

- file:line: `app/file_find.py:50`
- Claim: making the loop ascending (taking the **shortest** match of 20 or more) passes every test. No fixture has a suffix/prefix match shorter than the true replay. On periodic text (see F1) the ascending variant would drop even more. On text where a 20+ char run repeats inside the replay, it would keep part of the replay and double occurrences.
- Defect it lets through: double-counted or lost occurrences in files with repeated phrases near chunk boundaries.
- Frequency (if regressed): 2. Impact: 6.
- Evidence: mutant `overlap_ascending` SURVIVED.
- Introduced (new test file).

### F5. Test hole: the `\n` join character is not pinned

- file:line: `app/file_find.py:66`; test `:182`
- Claim: joining with `" "` (or `"\n\n"`) instead of `"\n"` passes. The newline-join test searches `needle`, which contains no space.
- Defect it lets through: with a space join, a multi-word query such as `slide end next start` could match across two separately chunked Office slides or HTML sections, which the spec says must not be found. With `"\n\n"`, only the snippet text changes.
- Frequency (if regressed): 1. Impact: 3.
- Evidence: mutants `join_space` and `join_double` SURVIVED; `join_empty` was killed.
- Introduced (new test file).

## Mutants killed (restored after each)

Overlap and merge:
- cap 199, 150, 201, 400; floor 19, 21, 1;
- empty join; keeping one replay char (`chunk[overlap-1:]`);
- `ORDER BY ci DESC`; no ORDER BY.

Scan:
- overlapping scan (`at+1`);
- unfolded text;
- raw (unfolded) needle.

Ordinal:
- starting at 1;
- a counter carried across units.

Snippet:
- no `…` bump in `match_start`;
- `match_start` offset.

Kind:
- every text row as `text`;
- section title forced to None;
- section and page rows put in the text family.

Order:
- document key `(family, ordinal, page)`;
- descending page;
- scene before utterance on a tie;
- transcript or scene start replaced by 0;
- `(start, ordinal, kind)` for both sources;
- no sort.

Cap:
- ROW_CAP 1999, 2001;
- `total` capped;
- `truncated` as `>=`;
- last 2000 rows instead of first.

Transcript:
- null-start skip removed.

Scenes:
- `scene_label` added to the searched text;
- inactive runs searched;
- Visual Index gate off for scenes;
- gate off for the visual-run `indexed` check;
- inactive run counting as indexed.

Scope:
- drive filter removed;
- active filter removed;
- file_id filter removed from text, transcript and scene queries.

I11:
- the "any flag" rule;
- audio, video or image mapped to `text_indexed`;
- other kinds mapped to `ocr_indexed`;
- visual run ignored;
- `indexed` always true;
- no `indexed_files` row answering true.

Parity (`test_search_passages.py` plus the find tests):
- EPUB without a page made a section;
- `_passage_kind` passing page None, the file_type, or the mime wrongly.

## Survivors not reported (equivalent or unreachable)

- `limit` without `len(chunk)` in `_overlap`: equivalent. A size beyond the chunk still yields `chunk[overlap:] == ""`.
- LEFT JOIN changed to JOIN on `transcript_chunks`: equivalent. `timestamp_start` is NOT NULL, so the skip drops exactly the unmatched rows.
- `text_content_kind` checking image before page: unreachable. Picture OCR always stores `page=None`.
- `match_length` `len(needle)+0` and the first `ordinal += 0` attempt: no-op mutants of mine, redone or dropped.

## Out of scope (one line)

Two transcript chunks with an identical `timestamp_start` would interleave their rows by ordinal. Whisper chunk starts are strictly increasing, so this does not occur in ordinary use.

TOTAL: 5 findings
