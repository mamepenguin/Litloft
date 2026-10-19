# Invariants: .loft actions into the file menus

## Touch points

- Core `frontend/src/lib/fileAiActions.ts` (new) — the file "AI" menu offer store.
- Intelligence `FileAIActionsButton` and the five offering sections
  (`SuggestedTagsSection`, `SummarySection`, `DetailedSummarySection`,
  `SuggestedChaptersSection`, `VisualDescriptionSection`) and their six test
  files that import the store; label translation moves into the sections.
- Core `componentFixtureParity.test.tsx`, which reads `FileAIActionsButton.tsx`
  as text.
- Media Import `LoftMetadataPanel`, `CaptionStatusBadge` retry, `api.ts`
  `refreshLoft`, new `file-actions-menu` entry, `loftRefresh.ts`, `router.py`
  slot manifest, `slots.ts`, `messages/{en,ja}.json`.
- Core `FileActions` `file-actions-menu` slot and `ToastProvider` (consumed,
  not changed).
- Endpoints called (unchanged): Media Import `POST /link/{id}/stt`,
  `POST /link/{id}/refresh`, `GET` loft metadata.
- Docs: `docs/addons/media-import.md`, `docs/ADDON-DEVELOPMENT.md`.

## Invariants

Core store:

1. Offers are listed in ascending `order`; an offer for one file never appears
   in another file's list.
2. When one offering component unmounts while another mount of the same offer
   id is still mounted, the offer stays listed.
3. `frontend/src/lib/fileAiActions.ts` names no addon and no action id.

Intelligence:

4. For a file with intelligence offers, the "AI" menu lists the same entries as
   before, in the order tags, summary, detailed summary, chapters, visual
   description, each with its current icon and label.
5. An entry leaves the "AI" menu when its section gains content; with no offer
   from any provider, the button disappears.
6. A `busy` offer renders its menu item disabled and the "AI" icon pulsing.

Media Import:

7. On a non-`.loft` file, Media Import offers nothing and its `⋮` entry renders
   nothing.
8. On a `.loft`, the panel offers `media_import.transcribe` whether or not its
   metadata has loaded; choosing it calls `POST /link/{id}/stt` once, toasts
   the result, and `busy` is false again once the request settles.
9. On a `.loft`, choosing "Refresh metadata" in the `⋮` menu calls
   `POST /link/{id}/refresh` once, closes the menu, toasts, and — when it
   succeeds — the mounted panel re-reads the metadata; a failed request toasts
   an error.
10. `CaptionStatusBadge`'s retry still triggers the refresh.

Joined path (checked by hand in the running app after the pointer bump; no
single repo's CI runs both addons): on a `.loft` the "AI" menu shows
the `media_import.transcribe` entry after every intelligence entry, including when
intelligence has nothing left to offer.

## Revisions

- Phase 3 round 1 (F6), approved by the user: invariant 8 and the joined-path
  check name the offer by its id instead of a label the UI does not use.
