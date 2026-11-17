# Transcript row actions and correction on a touch screen

SPEC-ID: SPEC-ADDON-125
SPEC-ID: SPEC-ADDON-126

Approval: sha256:a5e89c57569e23df19e2e0a550c010f29423b78a1a32cd2c4d492a8d92705130 Yuichi Senga 2026-11-17

## Summary

On a phone the transcript panel's rows lose about 90px each to two controls that are
always drawn: **修正** (44px wide) and the quote button (32px plus margins). On a 390px
screen that leaves the utterance's text about 220px. This change takes both controls off
the rows on a coarse pointer and draws them under the row the viewer tapped, small, with
a 44px hit area (SPEC-ADDON-125). Correcting an utterance on a coarse pointer then happens
in a dialog with a multi-line field that wraps, instead of the single-line field that
scrolls sideways inside the row (SPEC-ADDON-126). A fine pointer keeps today's behaviour.
It is for the owner reading and correcting transcripts on a phone.

Agreed design: https://claude.ai/artifact/XscPmLxkPZuhX2Dy2mWPhS, saved in
`docs/process/reviews/feature-transcript-touch-actions/design/` (`Main` = today,
`Idle`, `Selected`, `Editing` = the proposal). Where a board and this spec differ, the
spec wins; the differences decided after the boards are listed in §9 under "Departures
from the boards".

Terms:

- **Coarse pointer**: `usePointerMode()` (`frontend/src/components/player/hooks/usePointerMode.ts`)
  answers `"coarse"`. `"fine"` and `"unknown"` are both the **fine** path. The row
  layout switches on the same JS value, not on the CSS `pointer-coarse:` variant, so the
  two cannot disagree.
- **Selected row**: the one row, at most, whose action strip is shown. It is held as the
  utterance's `index` and `start` within the current source.
- **Action strip**: the controls drawn under the selected row.

## Required items

### 1. Normal flow

#### A. Row actions on a coarse pointer (SPEC-ADDON-125)

1. The owner opens the transcript (the inspector tab on a phone, or the panel under the
   player). Every row shows its time and text across the full row width. No row draws
   **修正** or the quote button.
2. The owner taps a row. As today, the media seeks to the row's start and plays, and the
   panel resumes following. The tapped row becomes the selected row and an action strip
   appears under its text, inside the same row block.
3. The strip holds, right-aligned in this order, **修正** (pencil icon + label) and
   **引用** (quote icon + label). **修正** is present only in the 「分割テキスト」 (chunks)
   view; in 「単語」 and the external-subtitle views only **引用** is present.
4. **引用** adds the selected row to the capture basket exactly as the quote button does
   today (`captureCue`: same locator, same quote text). The strip stays.
5. **修正** opens the correction dialog for the selected row (flow B).
6. Tapping another row seeks to it and moves the selection there; the strip leaves the
   old row. Tapping the selected row again seeks again and leaves the strip where it is.
7. As playback advances, the playback highlight moves from row to row; the selection and
   the strip stay on the tapped row.
8. When the transcript reloads (the owner's own save, the follow-up that ends a
   correction, a Refine, a restore, a WS event), the selection is kept if the reloaded
   rows of the same source still have a row with the selected `index` and the same
   `start`; otherwise it is cleared.
9. After a tap, the strip is fully inside the list's visible area: when the following
   scroll does not already show it (for example with no media controller, F4), the list
   scrolls by the least amount that does.

#### B. Correction dialog on a coarse pointer (SPEC-ADDON-126)

1. **修正** in the strip opens a modal dialog, portalled to the page through the existing
   dialog host (`useDialogPortalTarget`), with a dimmed backdrop. The panel stops
   following playback while it is open, as the inline editor does today, and closing the
   dialog does not resume following.
2. The dialog is top-aligned: its top edge 56px below the top of the viewport, 16px side
   margins, at most `max-w-md` (448px) wide and centred horizontally on a wider screen.
3. Its heading is **修正** followed by the row's start time (`formatDuration`, monospace,
   muted), with a close button (X) at the end.
4. Below it, a multi-line text field holds the utterance's current text (never an older
   draft), focused on open with the caret at the end. It wraps and grows with the text
   from 4 lines to at most 5 lines (24px line height); beyond 5 lines the field scrolls
   inside itself, so **保存** stays at a fixed distance below it. Its font size is 16px
   so iOS does not zoom. The 5-line cap keeps **保存** above the keyboard on a 667px-tall
   phone (§10).
5. Below the field, right-aligned: **キャンセル** then **保存**.
6. **保存** sends the same request the inline editor sends today
   (`correctTranscriptUtterance(fileId, index, text, expected_text, expected_start, drive)`,
   with `expected_text` / `expected_start` taken when the dialog opened). An empty text is
   allowed and removes the utterance, as the inline save does (SPEC-ADDON-070). While it
   is in flight, the field is read-only and **保存**, **キャンセル**, the close button and
   Escape do nothing. On success the dialog closes and the transcript reloads, as the
   inline save does.
7. **キャンセル**, the close button and Escape close the dialog and discard the draft;
   the next dialog for any row starts from the stored text.
8. Return pressed outside IME composition does nothing: it inserts no line break and
   does not save. Return and Escape pressed during IME composition go to the IME, as in
   the inline field today (`useImeKeyGuard`). A line break that arrives by paste is
   removed from the field's value, as the single-line field does today. Saving happens
   only through **保存**.
9. Escape reaches the dialog through the page's shortcut stack (`useShortcuts`), as
   `ConfirmDialog` does, and is inactive while a save is in flight.
10. On close, focus is placed once: on the strip's **修正** when it is drawn at that
    moment, otherwise on the row's seek button. A later reload that removes it does not
    move focus again.
11. Opening the dialog clears the panel's error line, which stays hidden while the
    dialog is open. The dialog's own error clears when the owner edits the text and is
    never carried into the next dialog.
12. The dialog closes and its draft is discarded when the file changes or when the
    source view switches by itself (the chunks become unavailable after a reload).
    A reload that no longer has the utterance leaves the dialog open (F6).

#### C. Fine pointer (unchanged)

Rows reveal **修正** and the quote button on hover and focus; **修正** turns the row into
the inline single-line field; Enter saves and Escape cancels. A click on a row seeks and
selects nothing; no action strip and no dialog is drawn on the fine path.

### 2. Failure cases

| # | When | What happens |
|---|---|---|
| F1 | The file is busy when the strip is drawn | **修正** in the strip is shown disabled, as the row button is today. **引用** stays enabled. |
| F2 | Save answers `busy`, `too_long`, `line_break`, `last_utterance`, 404 or another error | The dialog stays open with the draft; the message `errorText` gives today is shown inside the dialog under the field and not in the panel's error line. The buttons are enabled again. |
| F3 | Save answers `changed` | As today: the draft is discarded, the dialog closes and the transcript reloads; the message is shown in the panel's error line. |
| F4 | No media controller (nothing to seek) | Tapping a row still selects it and draws the strip; there is no seek. |
| F5 | A source switch or a file change | The selection is cleared, and an open dialog closes with its draft discarded (B12). A reload follows A8. |
| F6 | The transcript reloads while the dialog is open | The dialog stays open with its draft and the `expected_text` / `expected_start` it opened with, as the inline editor does today; a later save that no longer matches answers `changed` (F3). The selection underneath follows A8. |
| F7 | The pointer mode changes | An open dialog or inline editor stays until it is closed. Becoming fine clears the selection; a dialog closed after that leaves no selection and no strip. Becoming coarse with the inline editor open keeps it as today (its row with **保存** / **キャンセル**, the other rows disabled), and no row can be selected until it closes. |

### 3. States

Per transcript panel (the inspector tab and the panel under the player each have their
own):

- **No selection** → (tap a row, coarse) → **Selected(i)**.
- **Selected(i)** → (tap row j) → **Selected(j)**; → (tap row i) → **Selected(i)**;
  → (reload that keeps row i, A8) → **Selected(i)**; → (reload that loses row i, source
  switch, file change, pointer becomes fine) → **No selection**.
- **Selected(i)** → (**修正**) → **Dialog open(i)**.
- **Dialog open(i)** → (save succeeds) → **Selected(i)** or **No selection** by A8 after
  the reload; → (`changed`) → as A8 after the reload, with the message; → (other save
  error) → **Dialog open(i)** with a message; → (**キャンセル**, X, Escape) →
  **Selected(i)**, or **No selection** if the pointer became fine meanwhile (F7);
  → (file change, automatic source switch) → **No selection**, draft discarded;
  → (reload, pointer change) → **Dialog open(i)**.
- The fine path keeps today's states: **Not editing** ↔ **Inline editing(i)**. An inline
  editor that is open when the pointer becomes coarse stays in **Inline editing(i)** until
  it closes, then **No selection**.

Not allowed: a strip on the fine path; a dialog opened while the pointer is fine; an
inline editor opened while the pointer is coarse; a dialog and an inline editor at once;
more than one strip; more than one dialog.

### 4. Data read and written

None new. The correction request and the capture basket entry are unchanged. The
selection lives only in component state; nothing is stored in localStorage or on the
server.

### 5. External services

None.

### 6. Authorization

Unchanged. The correction route's checks (`X-Lit-Drive`, busy, expected text) are the
same request as today.

### 7. Effect on existing features

- `TranscriptSection` is rendered both as the inspector tab and as the panel under the
  player (`player-side`); both get the change, each with its own selection.
- Following and resume-following: a row tap still calls `seekTo`, which resumes
  following; the dialog suspends following as the inline editor does. The strip's
  appearance pushes the rows below it down by one strip height; following and the saved
  scroll place must still land on the active row.
- The rows behind the dialog are not dimmed (`opacity-50` applies to the inline editor
  only), and nothing stays dimmed or disabled after the dialog closes.
- Picture text (`PictureTextSection`) already uses a multi-line field and is not
  changed.
- SPEC-ADDON-070 flow A step 1 says **修正** is "always [shown] on a coarse pointer" and
  step 2 describes a single-line field. On a coarse pointer this spec replaces both: the
  control is in the strip and the field is in the dialog. None of SPEC-ADDON-067/068/070's
  invariants (I1–I15) concerns the row layout or the field, so nothing is listed under
  Revises.
- Existing tests: in `addons/intelligence/frontend/TranscriptSection.test.tsx`, the
  "per-row capture buttons" assertions on `pointer-coarse:` classes (always-visible quote
  button, `pointer-coarse:before:-inset-1.5`, `pointer-coarse:min-h-11` on rows) describe
  today's coarse layout and are replaced by this spec's coarse-path tests. Their
  fine-path halves (hover/focus reveal, the capture entry) stay and guard I9. In
  `TranscriptSectionCorrections.test.tsx` the inline-editor tests stay as the fine-path
  guard; tests that assume a coarse pointer, if any, move to the dialog.

### 8. Error behavior

As F1–F3. Nothing new is logged.

### 9. User-visible behavior

Coarse pointer:

- Rows: time + text, full width, no controls, at least 44px tall. The playback highlight
  is unchanged (`bg-accent/10`, accent text).
- Selected row: the row and its strip sit in one block with a `bg-bg-elevated`
  background and the row's radius. When the selected row is also the playing row, the
  playback highlight (`bg-accent/10`, accent text) is drawn instead.
- Strip: under the selected row's text, right-aligned, 12px between the two buttons,
  8px of padding above and below the buttons so their extended hit areas stay inside the
  block and off the row's own seek area and the next row. Each button is 28px tall,
  12px medium text, a 12px lucide icon (`Pencil`, `Quote`) before the label, no
  background, `text-text-muted`, `text-text-primary` on hover and press; its hit area is
  extended to at least 44×44px by a transparent pseudo-element. Labels: ja **修正** /
  **引用**, en **Edit** / **Quote** (new key `transcriptQuote`). Each button's accessible
  name is its visible label.
- Dialog: `role="dialog"`, `aria-modal="true"`, named by its heading (18px semibold).
  `rounded-2xl`, `bg-bg-card`, `shadow-lg`, padding 20px, 16px between heading, field and
  buttons, 12px between the two buttons, z-50, backdrop `bg-black/60`. A tap on the
  backdrop does nothing, so a typed draft is not lost to a stray tap. The close button
  is 44×44px with the accessible name `common.close`. The field is `rounded-2xl`,
  `bg-bg-elevated`, a focus ring, 16px text. **キャンセル** is the shared `Button`
  secondary (`bg-sand`), **保存** the shared `Button` primary (`bg-accent`), both 44px
  tall.
- The touch hint text `Esc / ↵` is not shown (already hidden on a coarse pointer).

Fine pointer: no visible change.

Departures from the boards: the strip buttons have 8px vertical padding (the board has
6px below and none above); the selected row's block is `bg-bg-elevated` when it is not
playing (the board shows only the playing case); **キャンセル** is `bg-sand` per
`DESIGN.md` "Modals / Dialogs" (the board uses the elevated colour); the field grows to
5 lines then scrolls (the board shows a fixed 4 rows); the close button is 44×44px (the
board draws 32×32); the dialog is capped at 448px wide (the board is phone-width only).
Where this spec gives no value (for example the strip buttons' 8px horizontal padding),
the board's value applies.

Docs: the **Correcting a transcript** paragraph of `docs/user-guide/viewers-and-players.md`
and the **A transcript** paragraph of `docs/addons/intelligence.md` say today that each
line offers **修正** and that Enter saves. Both are qualified for a touch screen: tap a
line to show **修正** and **引用** under it; **修正** opens a dialog that saves only with
**保存**. The intelligence page's sentence about "a button on each line that adds it to the
capture basket" gets the same qualification.

### 10. Non-functional

- No new network calls. One extra state value per panel.
- The text column on a 390px-wide phone grows from about 220px to about 310px.
- Touch targets stay at least 44×44px.
- With the on-screen keyboard up, **保存** stays visible on a phone as short as 375×667.
  Taking 300px as the keyboard, the dialog's **保存** must end above y = 367px with a
  2,000-character utterance.
- Layout is measured in a real browser: a `frontend/e2e-components` scene mounts the real
  `TranscriptSection` directly (not through the transcript slot stub), with its fetches
  answered by stubs in the style of `frontend/e2e-components/stubs/`, and is registered
  in the fixtures like the other scenes. It runs in a Playwright context with `hasTouch`
  and `isMobile`, and first asserts that `(pointer: coarse)` matches. At 390×844 and
  375×667 it measures the text column width, each strip button's hit area and its
  distance from the seek area and the next row, the dialog's top and side offsets, and
  the bottom of **保存** with a 2,000-character utterance. R-5 checks the same on the
  running app.

## Touch points

- `addons/intelligence/frontend/TranscriptSection.tsx` (addon submodule): row rendering,
  selection state, the strip, the coarse-pointer dialog, key handling in the dialog field.
- A new file beside it for the dialog (e.g. `TranscriptEditDialog.tsx`) to keep
  `TranscriptSection.tsx` from growing.
- `addons/intelligence/frontend/TranscriptSection.test.tsx`,
  `addons/intelligence/frontend/TranscriptSectionCorrections.test.tsx` (see §7).
- `addons/intelligence/frontend/messages/ja.json`, `en.json`: `transcriptQuote`.
- `frontend/e2e-components/`: a new scene and spec for the real `TranscriptSection`.
- `frontend/src/components/player/hooks/usePointerMode.ts`: read, not changed.
- `frontend/src/components/DialogPortal.tsx`, `frontend/src/components/Button.tsx`,
  `frontend/src/hooks/useShortcuts.ts`: read, not changed.
- `frontend/src/components/MobileInspectorSheet.tsx`: read, not changed (its drawer takes
  Escape; see Checked, no action).
- `docs/user-guide/viewers-and-players.md`, `docs/addons/intelligence.md`.
- Core submodule pointer bump for `addons/intelligence`.
- Rules passed through: `DESIGN.md` (Modals / Dialogs, touch targets, z-index, "a dialog
  opened from inside the sheet portals to the page"), `.claude/rules/frontend-conventions.md`.
- No protected path is edited.

## Invariants

I1. On a coarse pointer, a transcript row that is not selected draws no edit control and no quote control, in every source view.
I2. On a coarse pointer, at most one row shows the action strip, and it is the row the viewer tapped last; a change of the playback highlight never moves or removes it, and a reload removes it only when the reloaded rows have no row with its index and start.
I3. A row tap seeks exactly as before this change (same `seekTo(cue.start)` call) on both pointer types, whether or not it selects the row.
I4. The strip's **修正** appears only in the chunks view and is disabled while the file is busy; the strip's **引用** is never disabled by busy, adds the same capture-basket entry as today's quote button for that row, and leaves the strip in place.
I5. On a coarse pointer, **修正** never turns the row into an inline field; it opens one dialog, starting from the stored text, whose save sends the same request, with the text, expected text and expected start the inline editor would send.
I6. In the dialog, Return outside IME composition neither saves nor inserts a line break, Return and Escape during composition reach the IME, and the saved text contains no line break; only **保存** saves.
I7. While a save is in flight, nothing in the dialog sends a second save or closes it; a failed save other than `changed` keeps the dialog open with the draft unchanged and shows the error inside it only; `changed` closes it, reloads, and shows the message in the panel.
I8. A typed draft is lost only through **キャンセル**, the close button, Escape, `changed`, a file change, or an automatic source switch: a backdrop tap, a reload, a pointer-mode change and a playback tick leave the dialog and its draft as they were, and the field cannot be edited while a save is in flight.
I9. While the pointer is fine, rows, the inline editor and its keys (Enter saves, Escape cancels) behave exactly as before this change, no strip is drawn, and a row's **修正** opens the inline editor, never the dialog.
I10. Every control in the strip and the dialog has a hit area of at least 44×44px, and a strip button's hit area overlaps neither the selected row's seek area nor another row.
I11. Showing, moving or keeping the strip leaves the tapped row visible with its strip fully in view, and with a strip present the following scroll still brings the playing row into view and the saved scroll place still restores the same row.

## Checked, no action

- **Long press, swipe actions or a per-row `…` menu.** Rejected with the user: a long
  press collides with iOS text selection, and a `…` button still costs 44px per row.
- **An edit-mode toggle in the header.** Rejected with the user: a quote would need two
  extra taps.
- **Selecting without seeking.** Tapping a row to quote it also seeks and plays. The user
  accepted this when choosing the tapped-row strip; the tap keeps a single meaning.
- **Closing the strip by tapping outside, or tapping the selected row.** Not added. The
  strip costs one short line; a second gesture to dismiss it adds a state for no gain.
- **Dialog for the fine pointer.** Not changed; the user asked for the phone only.
- **Backdrop tap cancels**, as `NameInputDialog` does. Not taken: an accidental tap would
  throw away a typed correction.
- **A focus trap in the dialog.** Not added; the app's other dialogs (`NameInputDialog`,
  `ConfirmDialog`) have none, and a coarse pointer has no Tab key in normal use.
- **Escape collapsing the inspector sheet.** On a phone the expanded sheet is a Radix
  layer that takes Escape on the page, so Escape in the dialog may also collapse the sheet,
  unmount the panel and drop the draft. `ConfirmDialog` opened from the same panel behaves
  the same today. Escape on a phone needs a hardware keyboard; changing the sheet is out of
  scope.
- **The playback highlight's index.** The highlight compares `cue.index` with a position
  from `findIndex`; after an empty save leaves a gap the two can differ. This is
  pre-existing; the selected-and-playing rule in §9 uses the same comparison and does not
  fix it.
- **Keyboard shortcuts doc.** The dialog adds no page shortcut; Escape acts only inside
  the dialog (SPEC-ADDON-070 decision 13 applies).
- **The en accessible name of today's quote button** ("Add the {time} line to the capture
  basket"). Unchanged on the fine path; the strip's **引用** uses its visible label.
- **The capture basket's own feedback after 引用.** Unchanged; whatever it shows today it
  shows from the strip.
- **First frame on a phone.** `usePointerMode()` answers `"unknown"` until its effect
  runs, so the first frame is the fine layout. The row controls' `pointer-coarse:`
  classes (always visible, extended hit area) are dropped, since a coarse pointer never
  shows those controls; without them the first frame's controls are hover-only and
  invisible on a phone. A fine pointer never matched those classes, so I9 holds. R-5
  confirms no flash.
- **Picture text editing.** Already a multi-line field in its own section; untouched.
