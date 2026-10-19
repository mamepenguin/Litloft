# PR-B core review, round 1

Reviewed: `59bb836c9..a83112c1c` (HEAD `a83112c1c`), worktree `/Users/libre/Sources/video_share-epub-index`.
Reviewer: independent subagent, no author context. Tree restored after every mutation; nothing fixed.

## Mutation log

Unit mutations ran against the 11 vitest files the change touches (CI command `pnpm exec vitest run <files>`); reader mutations ran against `e2e-epub/reader.spec.ts -g "opening at a section"` / `e2e-epub/preview.spec.ts` on chromium. Baseline: 11 files, 353 tests green. Runner: `scratchpad/pr-b-r1/mut.py` (+ `unit.json`, `unit2.json`, `e2e.json`, `e2e2.json`).

| id | target | want | got |
|---|---|---|---|
| M01 | drop `"section"` from CARRIED_QUERY_KEYS | kill | kill (page.test redirect row) |
| M02 | isValidOpen: drop the section clause | kill | kill |
| M03 | isValidOpen: `typeof === "number"` instead of isInteger | kill | kill (1.5 row) |
| M04 | isValidOpen: refuse `section: null` | kill | kill |
| M05 | hook: drop the single `- 1` | kill | kill |
| M06 | hook: `n >= 0` | kill | kill (row 0) |
| M07 | hook: drop isInteger | kill | kill (row 1.5) |
| M08 | hook: always post `section: null` | kill | kill |
| M09 | hook: ref not refreshed after first render | live | live (by design: the key remount makes the ref's refresh unobservable) |
| M10 | EpubPreview does not pass initialSection to the hook | kill | kill |
| M11 | FilePreview key = `file.id` only | kill | kill (vitest) |
| M12 | FilePreview key removed | kill | kill |
| M13 | FilePreview drops initialSection | kill | kill |
| M14 | RightPaneFile drops forward | kill | kill |
| M15 | FileDetailFullScreen drops forward | kill | kill |
| M16 | RightPaneFile reads `?page=` as the section | kill | kill |
| M17 | FileDetailContainer drops forward | kill | kill |
| M18a | FileDetailPresenter drops forward (shell branch) | kill | kill |
| M18b | FileDetailPresenter drops forward (collection branch) | kill | kill |
| M19 | ShellLayout drops forward | kill | kill |
| M20 | FileDetailCanvas drops forward | kill | kill |
| M21 | MediaPlayerBlock drops forward | kill | kill |
| M22 | searchMerge: last title wins | kill | kill |
| M23 | searchMerge: `section_title ?? null` (keeps `""`) | live | live — the addon's `_clean_title` returns None for an empty title, so `""` never reaches the wire; not a finding |
| M24 | searchMerge: no sort | kill | kill |
| M25 | searchMerge: `matched_sections: []` on every hit (PDF too) | kill | kill (PDF row) |
| M26 | MatchOverlay href `?page=` | kill | kill |
| M27 | MatchOverlay href `section - 1` | kill | kill |
| M28 | MatchOverlay label always the number | kill | kill |
| M29 | MatchOverlay fallback = bare number | kill | kill (vocabulary detector only) |
| M30 | MatchOverlay empty guard ignores sections | kill | kill |
| M31 | MatchOverlay pill without stopPropagation | kill | kill |
| M32 | MatchOverlay pill without `max-w-[12rem] truncate` | live | live (layout; jsdom cannot hold it — measured below) |
| M33 | MatchOverlay `title=""` on an untitled pill | kill | kill |
| M34 | MergedResultItem href `?page=` | kill | kill |
| M35 | MergedResultItem click goes to `/files/{id}` | kill | kill |
| M36 | MergedResultItem click without stopPropagation | kill | kill |
| M37 | MergedResultItem key handler without preventDefault | live | live |
| M38 | MergedResultItem key handler Enter only | kill | kill (Space row) |
| M39 | MergedResultItem key handler without stopPropagation | kill | live — equivalent in practice: preventDefault already stops the enclosing `<button>`'s activation and GlobalSearch's only keydown handler is on the input. Same shape as the timestamp/page pills. Not a finding. |
| M40 | MergedResultItem label always the number | kill | kill |
| M41 | MergedResultItem fallback = bare number | kill | kill (vocabulary detector only) |
| M42 | MergedResultItem shows only the first section | kill | kill |
| M43 | en `matchedSectionNumber` = `"Section"` (after `merge-addon-messages.mjs`, as CI does) | kill | kill (without the merge step it lives — the setup reads generated `messages/`; CI runs the merge first) |
| E01 | restore: drop `section >= 0` | kill | kill |
| E02 | restore: `<=` length | kill | kill |
| E03 | restore: no length guard | kill | kill |
| E04 | restore: section branch does not return (falls through) | kill | kill |
| E05 | restore: `goTo(section - 1)` | kill | kill |
| E06 | restore: section branch moved after the null-fraction branch (guarded) | kill | live — my mutant was equivalent (reordered two disjoint branches). Replaced by E06b. |
| E06b | restore: a valid fraction outranks the section | kill | kill |
| E07 | restore: post `turned` after landing | kill | kill (inv. 7) |
| E08 | openBook ignores `section` | kill | kill |
| E09 | FilePreview key = `file.id` (real reader, preview harness) | kill | kill |
| E10 | hook without `- 1` (real reader, preview harness) | kill | kill |

Tree restored after every mutant; `git status` clean apart from this file.

## Layout measurement

Real Chromium (Playwright, components harness `playwright-components.config.ts`, compiled `globals.css`), real `MergedResultItem` and real `MatchOverlay`, one result with three long chapter titles (two English ~100 chars, one Japanese with no spaces). Containers: the GlobalSearch panel (`w-full max-w-3xl` inside `px-4`), a card slot in the `cardGridTemplate(0)` grid (FileCard's `mt-2 border-t pt-2` slot), and a list-row text column (`min-w-0 flex-1` beside a `w-16` thumbnail). Temporary arrangement + spec (`scratchpad/pr-b-r1/arrangement.tsx`, `prb-pills.spec.ts`), removed afterwards. Screenshots: `scratchpad/pr-b-r1/pills-375.png`, `pills-1280.png`.

| width | container | pill width | text-overflow / truncated | wraps | overflows container | page h-scroll |
|---|---|---|---|---|---|---|
| 375 | search panel (right edge 359) | 192 (cap) | ellipsis / yes | yes, one per line (tops 73/95/117) | no | no (scrollWidth 375) |
| 375 | grid card slot (150 px wide) | 150 (shrinks to the card) | ellipsis / yes | yes, one per line | no (right == card right) | no |
| 375 | list column (right edge 359) | 192 | ellipsis / yes | yes, one per line | no | no |
| 1280 | search panel (768 px) | 192 | ellipsis / yes | no, three on one row (fit) | no | no |
| 1280 | grid card slot (287 px) | 192 | ellipsis / yes | yes, one per line | no | no |
| 1280 | list column | 192 | ellipsis / yes | no, one row | no | no |

Result: the pills truncate with an ellipsis, wrap inside the row, and never overflow the row or the page at either width. A pill narrower than 12rem (grid card at 375) shrinks to the card because `truncate` sets `overflow: hidden`, which drops the flex item's automatic minimum width. No finding. Not measured: WebKit (the components harness is Chromium only).

## Touch points reached but not listed

The R-0 list names three core touch points: the `/files/{id}` redirect, the reader `open` / `restore()`, and the search pills. The diff also reaches these:

1. **File-to-file navigation inside the drive pane.** `useSelectedFile.selectFile` (used by clicking another file, by `useFileNav` arrow and swipe navigation, and by the image gallery close) copies every query key, so `section` now rides from one file to the next. On `59bb836c9` the key was carried the same way but nothing read it. See F1.
2. **The collection / folder-play full-screen surface.** `/files/{id}?collection=…` (or `folder_play=1`) never redirects. `FileDetailFullScreen` reads `?section=` itself and hands it to the Presenter's collection branch. That is a second entry path, not the redirect.
3. **Folder search results, not only global search.** `MatchOverlay` pills render inside `FileGrid` cards and `FileListRow` rows, the in-drive search views. The list says "search pills" without naming these two hosts.
4. **The host ↔ reader wire contract across a deploy.** `isValidOpen` now refuses an `open` that has no `section` key. The Next bundle and the unversioned static `/epub-reader/` files can come from different releases in a tab that stays open through an update. See F2.
5. **Model-facing and design surfaces.** The MCP `semantic_search` description (read by the agents that call the tool), a new DESIGN.md rule for the pill width, and the core search-vocabulary detector counts (39 → 40).
6. **CI.** `e2e-epub` global setup now vite-builds a preview bundle of the real `FilePreview`, and `server.ts` serves `/preview/` plus `/api/files/<id>/stream`. `eslint.config.mjs` and `.gitignore` change too. This adds CI time and a second bundling path (`next/dynamic` aliased to `React.lazy`) that can drift from the app's own.

## Findings

### F1 — `?section=` follows the reader into other books, which then open at that chapter instead of the reader's place `[introduced]` — Medium — invariant: none broken as written (7 holds). Raises an R-0 question under 6/7.

Reproduction:
- On HEAD, a temporary vitest (removed) rendered `useSelectedFile` with `file=A&section=3` and called `selectFile("B")`. It produced `router.replace("/drive/d/books?file=B&section=3")`.
- `RightPaneFile` then forwards `initialSection=3` to B (held by the existing RightPaneFile deep-link test). `restore()` gives the section priority over B's saved fraction (E06b shows the priority is held by a test).

User path: search, then a chapter pill opens book A at chapter 3. In the same folder the user clicks book B, or presses the next-file key. B opens at its chapter 3 and not where they left off. If they then turn a page, B's stored progress moves to that spot. Reloading A also reopens chapter 3 and not the saved place.

On `59bb836c9` the same URL opens B at its saved fraction, because nothing reads `section`. The same leak exists for `?page=` / `?t=` (pre-existing). For those it misplaces one PDF page or a playback time. Here it silently replaces a book's saved reading position.

Check before patching: is there a shape that does not make this reachable, for example dropping the deep-link keys in `selectFile` when the file changes? That would change the pre-existing `page` / `t` behaviour too, so raise it rather than widen the scope alone.

Possibly the same root, not reproduced: clicking the same chapter pill again for the book already open produces an identical URL. No searchParam changes, so no remount, and the pill looks like it does nothing.

### F2 — an open tab that outlives an update never opens a book `[introduced]` — Low — invariant: none

`reader.js` drops an `open` message that fails `isValidOpen` without replying (`if (state.opened || !isValidOpen(d)) return;`), and `useEpubReader` has no timeout. A host bundle loaded before the update posts `open` without `section`. The reader iframe (`/epub-reader/reader.html`, unversioned) loads fresh from the new release and refuses it. The preview stays on its loading state until the page is reloaded.

Evidence: code reading plus the `isValidOpen` table row `{ bytes, section: null … }` minus the key → false (M02 / M04). Not reproduced across two real builds. This is implementer deviation 1 working as designed; it matters only for users who keep a tab open through `git pull && docker compose up`.

Cheaper shape: treat a missing `section` as `null` (`d.section == null ||`). A missing `fraction` is refused the same way today, so the precedent exists. Whether that is worth doing is the supervisor's call.

TOTAL: 2 findings
