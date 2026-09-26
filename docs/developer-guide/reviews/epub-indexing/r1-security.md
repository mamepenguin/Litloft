# R1 security review: EPUB input-safety defences (intelligence addon)

Reviewed: `c3e4fa3` (range `afe25d1..c3e4fa3`), detached worktree
`/Users/libre/Sources/intelligence-epub-review-s`. Tree restored with
`git checkout -- .` after every mutation.

Test command (image `intelligence-review-s`, rebuilt after each mutation):
`pytest tests/test_epub_extractor.py tests/test_epub_indexing_e2e.py tests/test_document_sections.py tests/test_zip_names.py tests/test_search_router_sections.py -q --no-cov`
(`--no-cov` is the speed switch `pytest.ini` documents). Mutations in
`app/search.py` / `app/routers/files.py` additionally ran
`tests/test_search.py` / `tests/test_chunk_excerpt.py`, where their tests live.

Baseline: 77 passed.

## Mutation log

| # | defence | mutation | want | result | killing test |
|---|---|---|---|---|---|
| M1a | 1 strict parse | `_parse_strict`: delete `StartDoctypeDeclHandler` | kill | killed | `test_opf_with_doctype_is_refused` |
| M1b | 1 strict parse | `_parse_strict`: delete `EntityDeclHandler` | live (an entity decl needs an internal subset, which fires the DOCTYPE handler first) | live | - (redundant by construction) |
| M1c | 1 strict parse | `_parse_strict`: drop the whole expat probe | kill | killed | `test_billion_laughs_in_container_returns_empty`, `test_opf_with_doctype_is_refused` |
| M2a | 2 pre-pass | `_refuse_entities`: delete `EntityDeclHandler` | kill | killed | `test_entity_declaration_in_section_is_refused`, `test_entity_declaration_in_nav_falls_back_to_ncx` |
| M2b | 2 pre-pass | "error before root" branch `if not root_started` -> `if False` | kill | killed | `test_malformed_before_root_skips_only_that_section` |
| M2c | 2 pre-pass | `_toc_titles`: remove the `_refuse_entities(data)` call | kill | killed | `test_entity_declaration_in_nav_falls_back_to_ncx` |
| M2d | 2 pre-pass | `_extract_sections`: remove the `_refuse_entities(data)` call | kill | killed | `test_entity_declaration_in_section_is_refused`, `test_malformed_before_root_skips_only_that_section` |
| M2e | 2 pre-pass | delete `SetParamEntityParsing(NEVER)` | live (NEVER is pyexpat's default; no external-entity handler is set) | live | - (redundant) |
| M2f | 2 pre-pass | run `_refuse_entities` only for the nav, not the NCX (`if parse is _nav_entries:`) | kill | **live** | none - see F1 |
| M3a | 3 read cap | `_read_member`: `f.read(cap + 1)` -> `f.read()` | kill | killed | `test_reads_are_bounded_on_decompressed_bytes` |
| M3b | 3 read cap | `_read_member`: never skip over-cap (`return data`) | kill | killed | `test_reads_are_bounded_on_decompressed_bytes`, `test_member_over_cap_skipped_rest_indexed`, `test_toc_over_cap_skipped_rest_indexed` |
| M3c | 3 read cap | `_read_xml_member` uses `SECTION_MAX_BYTES` | kill | killed | `test_toc_over_cap_skipped_rest_indexed`, `test_encryption_xml_over_cap_skips_all_sections` |
| M3d | 3 read cap | section read uses `XML_MAX_BYTES` | kill | killed | `test_member_over_cap_skipped_rest_indexed` |
| M3e | 3 read cap | off-by-one: `len(data) > cap + 1` | kill | killed | same three as M3b |
| M4a | 4 `_resolve` | drop fragment strip | kill | killed | `test_nav_titles_first_entry_wins`, `test_ncx_used_when_no_nav[*]` |
| M4b | 4 `_resolve` | drop `unquote` | kill | **live** | none - see F2 |
| M4c | 4 `_resolve` | drop pre-join `path.startswith("/")` | live (post-normpath `/` check still catches it) | live | - (redundant pair with M4g) |
| M4d | 4 `_resolve` | drop `"\\" in path` | kill | **live** | none - see F2 |
| M4e | 4 `_resolve` | drop `":" in path` | kill | **live** | none - see F2 |
| M4f | 4 `_resolve` | drop both `..` checks | kill | killed | `test_href_traversal_ignored` |
| M4g | 4 `_resolve` | drop post-normpath `startswith("/")` | live (pre-join check catches it; `opf_dir` is itself resolved) | live | - (redundant pair with M4c) |
| M4h | 4 `_resolve` | drop `resolved == ".."` only | live (`".."` names no member) | live | - (equivalent) |
| M5a | 5 `SECTION_MAX` | drop `[:SECTION_MAX]` | kill | killed | `test_section_cap_2000` |
| M5b | 5 `TEXT_MAX_CHARS` | drop `[:budget]` | kill | killed | `test_book_text_cap_stops_and_keeps_extracted` |
| M5c | 5 `TEXT_MAX_CHARS` | drop `budget -= len(markdown)` | kill | killed | `test_book_text_cap_stops_and_keeps_extracted` |
| M5d | 5 `TEXT_MAX_CHARS` | drop `budget > 0` from `wants_text` (keep reading/parsing after the budget is spent) | kill | **live** | none - see F3 |
| M5e | 5 `TITLE_MAX` | drop `[:TITLE_MAX]` | kill | killed | `test_title_whitespace_collapsed_and_capped_at_200` |
| M5f | 5 `SECTION_MAX` | `page_count` from the capped list | live (not a budget: page_count reports the spine length) | live | - |
| M6a | 6 encryption | `readable`: ignore the listed set | kill | killed | `test_encryption_xml_listed_section_skipped`, `test_encryption_xml_listed_nav_is_not_read` |
| M6b | 6 encryption | `readable`: drop `encrypted is not None` | kill | killed | `test_unparseable_encryption_xml_skips_all_sections`, `test_encryption_xml_over_cap_skips_all_sections` |
| M6c | 6 encryption | unparseable -> `frozenset()` instead of `None` | kill | killed | `test_unparseable_encryption_xml_skips_all_sections` |
| M6d | 6 encryption | over-cap -> `frozenset()` instead of `None` | kill | killed | `test_encryption_xml_over_cap_skips_all_sections` |
| M6e | 6 encryption | `_extract_sections` skips the `readable` check | kill | killed | 3 encryption tests |
| M6f | 6 encryption | `_toc_titles` skips the `readable` check | kill | killed | `test_encryption_xml_listed_nav_is_not_read`, `test_unparseable_encryption_xml_skips_all_sections` |
| M7a | 7 never-raise | outer `except Exception` -> `except ZeroDivisionError` | kill | killed | `test_billion_laughs_in_container_returns_empty`, `test_opf_with_doctype_is_refused`, `test_corrupt_zip_returns_empty`, `test_truncated_zip_returns_empty`, `test_mutated_books_never_raise` |
| M7b | 7 never-raise | per-section `except` narrowed | kill | killed | `test_entity_declaration_in_section_is_refused`, `test_zip_encrypted_member_skipped_rest_indexed`, `test_malformed_before_root_skips_only_that_section` |
| M7c | 7 never-raise | per-TOC `except` narrowed | kill | killed | `test_entity_declaration_in_nav_falls_back_to_ncx` |
| M7d | 7 never-raise | encryption.xml `except` narrowed | kill | killed | `test_unparseable_encryption_xml_skips_all_sections` |
| M8 | 8 path check | delete `validate_file_path` guard | kill | killed | `test_validate_file_path_false_returns_empty` |
| M9a | 9 file_id key | `replace_document_sections`: `DELETE` without `WHERE file_id` | kill | killed | `test_replace_deletes_previous_rows`, `test_load_section_titles_filters_pages` |
| M9b | 9 file_id key | `load_section_titles`: drop the `(file_id, page) in wanted` filter | kill | killed | `test_load_section_titles_filters_pages` |
| M9c | 9 file_id key | `load_section_titles`: drop the SQL `WHERE file_id IN` | live (the Python `wanted` filter still applies; cost only) | live | - (redundant) |
| M9e | 9 file_id key | `_build_results`: drop `if fid == file_id` | kill | killed | `test_search.py::TestChunkIndexAndSections::test_build_results_loads_titles_for_epub_matches_only` |
| M9f | 9 file_id key | `_build_results`: drop the EPUB mime filter | kill | killed | same |
| M9g | 9 reindex | `index_text_content` zero-chunk path: drop `replace_document_sections` | kill | killed | `test_reindex_to_zero_chunks_deletes_rows` |
| M9h | 9 reindex | `index_text_content` main path: drop `replace_document_sections` | kill | killed | `test_chunk_page_and_row_use_section_number`, `test_reindex_replaces_rows`, `test_reindex_to_zero_chunks_deletes_rows` |
| M9i | 9 excerpt | `get_chunk_excerpt`: `is_book = True` | kill | killed | `test_chunk_excerpt.py::TestDocumentExcerpt::test_returns_text_with_page`, `::test_pdf_excerpt_unchanged` |
| M9j | 9 excerpt | excerpt title: take the first loaded value instead of `.get((file_id, page))` | live (one pair requested, so equivalent) | live | - (equivalent) |
| M9k | 9 Ask | `_to_citation_dict`: `is_book = True` | kill | killed | 3 tests in `test_rag_service.py::TestEpubSectionLocations` |

`_build_results` loads titles only for file ids present in `files`, which is
already filtered by `drive` and `active`, and each result takes only its own
`fid`; the search router builds `dict(r.section_titles)` per result. The
excerpt endpoint loads the title for the `file_id` that `_get_indexed_file_or_404`
has just checked against the caller's drive. No cross-file or cross-drive path
was found apart from F4.

## Defence 10: parsers downstream of the pre-pass (by reading, plus two probes in the image)

- Member reads: `_read_member` is the only `zf.open` / `read` in `epub.py`
  (grep); container, OPF and encryption.xml go through `_read_xml_member`
  (XML cap), sections through `_read_member(..., SECTION_MAX_BYTES)`.
- Container, OPF, encryption.xml: expat probe refusing any DOCTYPE, then
  `ElementTree.iterparse` (expat, no external-entity handler). No DOCTYPE can
  reach ElementTree.
- Nav: `_refuse_entities` then bs4 `"lxml"` (lxml `HTMLParser`). NCX:
  `_refuse_entities` then bs4 `"xml"`, which bs4 4.15 builds as
  `etree.XMLParser(target=self, recover=True, huge_tree=False, encoding=...)`,
  i.e. lxml defaults `load_dtd=False`, `no_network=True`,
  `resolve_entities='internal'`. DTD loading and external-entity resolution
  are never enabled; internal entities would be resolved by lxml itself, so the
  pre-pass is what stands in front of them (see F1).
- Sections: `_refuse_entities` then `_first_heading` (bs4 lxml HTML) and
  `html_to_markdown` (bs4 lxml HTML, then html2text on `str(soup)`, which uses
  the stdlib `html.parser` and knows only the HTML5 named entities).
- Probe (bs4 4.15.0, lxml 6.1.3, libxml2 2.14.6): bs4 `"lxml"` on
  `<!DOCTYPE html [<!ENTITY x "EXPANDED">]>...&x;` yields `']>&x;&x;'`, no
  expansion. bs4 `"xml"` on an NCX with an internal subset yields an empty
  tree, while raw `etree.XMLParser(recover=True)` on the same bytes expands
  `&t;` to `EXPANDED`.
- Every nav/NCX/section parse in `epub.py` is preceded by `_refuse_entities`
  in the same `try`. No path reaches a parser without the pre-pass. The only
  other caller of `html_to_markdown` is the existing `HtmlExtractor`.

## Findings

### F1 - Low - [introduced] - invariant 2 - `app/extractors/epub.py:338-346`
The entity pre-pass on the **NCX** is not held by any test. Mutation M2f
(run `_refuse_entities` for the nav only) leaves all 77 tests green. The only
entity test on a TOC (`test_entity_declaration_in_nav_falls_back_to_ncx`)
declares the entity in the nav. Today the survivor causes no expansion,
because bs4 4.15's `"xml"` builder returns an empty tree for any document
with an internal subset (probe above). That protection comes from bs4, not
from this code. lxml's own default is `resolve_entities='internal'`, and
`requirements.txt` pins only `beautifulsoup4>=4.12` / `lxml>=5.0`, so a
dependency change could make the NCX expand declared entities without any
test going red. A test with an entity-declaring NCX and no nav, asserting
that no title contains the expansion, would hold this once bs4 stops masking
it. Today it would pass under the mutation too.

### F2 - Low - [introduced] - no invariant broken (1/2/9 unaffected); invariant 4 correctness - `app/extractors/epub.py:181-188`
Three `_resolve` clauses survive mutation: `unquote` (M4b), the backslash
rejection (M4d) and the colon rejection (M4e). None of them is a security
boundary. `_resolve`'s output is only used as a key into the in-memory
`entries` dict of the same archive: nothing touches the filesystem or the
network, and the `..` rejection that does matter is held
(`test_href_traversal_ignored`). The `unquote` survivor is a correctness gap.
Without it a percent-encoded href (`chapter%201.xhtml`, common for names with
spaces or non-ASCII) resolves to no member, and that section's text and
title silently drop out. No test uses a percent-encoded href.

### F3 - Low - [introduced] - invariant 1 (resource bound) - `app/extractors/epub.py:384`
The `budget > 0` term in `wants_text` is not held (M5d survives). Without it,
once `TEXT_MAX_CHARS` is spent, every remaining HTML section (up to
`SECTION_MAX` = 2000, each up to 5 MiB decompressed) is still read, entity
pre-passed, soup-parsed and converted to Markdown, only for the result to be
sliced to `[:0]`. The output is identical, so only a read-count or
parse-count assertion (like the `ZipExtFile.read` spy in
`test_reads_are_bounded_on_decompressed_bytes`) can catch it. The per-member
caps still bound each read, so the effect is CPU and time on a hostile or
very large book, not unbounded memory.

### F4 - Low - [introduced] - Drives rule / invariant 5 - `app/rag/service.py:373-383`
In `_to_citation_dict`'s defensive `source_file is None` branch, the new
`section_title` field is looked up with `section_title(citation.file_id, ...)`
for a file id that is **not** in the retrieved candidates. In that branch
`distrusted` is False, so a `section N` marker is accepted. If the branch were
ever reached, it would return the section title of an arbitrary indexed file,
possibly in another drive, without any drive check. Today it is unreachable:
`parse_answer(raw, allowed)` and `_parse_citation(raw, allowed_file_ids)`
drop file ids outside the candidate set first. The branch exists because the
code does not rely on that gate, and in that branch the title should be
`None` rather than a lookup. No test exercises it.

TOTAL: 4 findings
