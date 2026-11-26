# Spec review 1: docs/specs/subtitle-sidecars.md (SPEC-CORE-184/185/186, SPEC-ADDON-187)

Reviewed at e351ab4d7 by a fresh `spec-design-reviewer`, against the related-specs list,
`.claude/rules/`, PROJECT.md and the code. The reviewer had no write tool; its report is
recorded here by the author, one line per finding.

1. §8 is false: rename, move, context menu, batch rename, drag and drop and the detail page drop the 409 `detail` (`api.ts:21-24` and callers). Decide what each entry point shows and whether it is translated from a code. (human / author)
2. `PUT /api/files/batch/move` is per file and answers 200 with `errors`; drag and drop and paste use it. Decide all-or-nothing or per file, and what the user sees. (human)
3. Several owners of a shared sidecar in one operation, or moved one after another to the same place, collide with their own copy. Decide the rule, and whether a byte-identical target counts as taken. (human)
4. The order of one video's own sidecars within one rename is undefined; `movie.mp4` → `movie.ja.mp4` with `movie.srt` and `movie.ja.srt` works today. (author)
5. SPEC-CORE-003 I9 is contradicted without `## Revises`; the known-issues mixed-extension chain becomes a 409 rather than being fixed. (author / human acceptance)
6. SPEC-CORE-030 I11 ("every other upload error shows today's text") is contradicted without `## Revises`. (author)
7. `design-decisions.md` says the scanner never emits `files.purged`; `websocket-events.md` and `file-states.md` are not touch points; commit timing and where the drive goes are unstated. (author)
8. A sidecar no row owns (missing purge, failed delete, `.loft`) blocks operations and cannot be seen or removed from the UI. (human)
9. Longest-stem ownership lets another operation, or an add, silently move a track to another video; trashed and missing rows take part. (human)
10. "Another row still owns it" on purge is ambiguous (recomputed after the purge or before). (human)
11. Missing rows and retired `__missing_` rows count as owners and in `shared_with`. (human)
12. Add and replace: language case, taken by name or by language, extension change landing on an existing name, failed delete of the old file, the language list. (human / author)
13. The new endpoints have no wire contract (fields, `name`, response, status codes, the 5 MB constant, `shared_with`). (author)
14. The player keys tracks by index and keeps old cues after a replace; a rename response carries `subtitles: []`, emptying the list. (author)
15. I2 contradicts the logged, not-rolled-back carry failure. (author)
16. Touch points missing: missing purges, `main.py` `_run_purge_batch`, other `validate_filename` callers, batch move, frontend error paths, knowledge messages and the gitlink bump, two reference pages. (author)
17. The agreed design is not saved under `docs/process/reviews/<topic>/design/` and its decisions are not listed; surfaces undecided. (human)
18. §3 lists no transitions or disallowed transitions. (author)
19. Behaviour with no invariant (subtitle-only folder, dialog, 409 text, drawer text, knowledge notice); I4 fails with an orphan at the destination. (author)
20. `_finish_subtitle_upload` deletes rows without `files.purged`; purging a missing subtitle row deleted the real file in the #490 walk. Low priority. (author)
21. `.loft` sidecars versus SPEC-ADDON-001 I1's wider `<stem>*.vtt` match. Low priority. (author)

TOTAL: 21 findings
