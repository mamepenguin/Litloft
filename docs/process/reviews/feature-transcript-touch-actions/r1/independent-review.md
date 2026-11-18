# Review r1b: transcript touch actions (core 3cedce4f9, addon d5779174)

## Findings

### F-1 (test gap, bucket A, B1): nothing guards "the panel stops following while the dialog is open"

- 起きる条件: The only code that suspends following for the dialog is `editTarget !== null` in the effect at `addons/intelligence/frontend/TranscriptSection.tsx:813-815`. Mutation: change it back to `if (editingIndex !== null) setFollowing(false)`. No unit test fails (`TranscriptSectionTouch.test.tsx` never looks at following or the 「現在位置に戻る」 chip; grep finds neither), and no e2e scene opens the dialog with a playing controller. The R-5 record says so too: "Whether the dialog suspends following was not measured."
- The defect it lets through: every time the owner taps a row on a phone (which resumes following, `seekTo` at :817-827) and then taps 修正, the list keeps scrolling to the playing row behind the modal. When the dialog closes, `focusRow` focuses the strip's 修正, and `focus()` with no `preventScroll` scrolls it back into view. After that, following carries on pulling the list away while the owner checks the row they just corrected. This breaks B1 ("closing the dialog does not resume following").
- 頻度 8 (every correction made while media plays) x 影響 3 for the defect = 24. The gap scores on that defect.
- Evidence: delete `|| editTarget !== null` and run `TranscriptSectionTouch.test.tsx`. It stays green.

### F-2 (bucket A, I11 / B1 "reading ahead wins over following"): the reveal effect scrolls the list while following is suspended

- 起きる条件: `TranscriptSection.tsx:605-608` calls `revealCue(selected.index)` whenever `activeIndex === selectedPosition`, and nothing gates it on `following`. In normal use on a phone: the owner taps row 10, so it is selected and plays. Playback moves on. The owner scrolls up to reread earlier rows, which sets following to false and shows the chip. Then they rewind with the player's own controls (the ±10 s button or the scrub bar) into row 10. `activeIndex` re-enters the selected row, and `revealCue` snaps the list down to row 10 with an instant `scrollTop +=`. The follow effect correctly stays quiet (it is gated on `following`), so this is the one scroll that ignores the suspension. The same thing happens behind an open dialog (B1: the panel stops following while it is open) if playback re-enters the selected row.
- The effect exists to undo the tap's own follow scroll (comment at :597-599). The tap always sets `following` true (`seekTo`), so adding `following &&` to the condition keeps that purpose and removes the yank.
- 頻度 3 x 影響 3 = 9 (below the bar; reported because it breaks a stated rule).
- Evidence: in the e2e scene, tap a row with a controller, set the time past it, wheel or touchmove the list up, then set the time back inside the tapped row. Expect the list's `scrollTop` to stay unchanged; predicted: it jumps to show the row's block. No test covers this.

### F-3 (bucket A, I7 / B12 / F5): a save still in flight when the file changes acts on the new file

- 起きる条件: The dialog's `save` (`TranscriptEditDialog.tsx:91-129`) keeps the `onSaved` / `onChanged` closures from the render where 保存 was tapped. Those closures capture the old `editTarget` (`TranscriptSection.tsx:1352-1361`). If the file changes while the PUT is pending, the `fileId` effect (:332-343) unmounts the dialog, but the promise still resolves into those callbacks:
  - on success, `closeEditDialog(oldTarget)` → `focusRow(old index)` looks the index up in `listRef.current`, which is now the **new file's** list. It focuses that file's row with the same index, and `focus()` scrolls that row into view. `refreshAfterWrite()` refetches the new file, which is harmless.
  - on `changed`, `setActionError(CHANGED_MESSAGE)` puts 「内容が更新されました…」 on a file the owner never edited.
  - An automatic source switch during the save has the same shape (:488-491). There the focus lands on a 単語/外部字幕 row picked by an index from the chunks list.
- How the file changes with the mount reused: autoplay advancing to the next file, or a history back/forward between two file pages (same route, so the mount is reused). The dialog's backdrop blocks taps, so only those paths remain, and only during a save that takes a few hundred milliseconds.
- 頻度 1 x 影響 3 = 3. The inline `saveEdit` already had this shape; the dialog adds the focus scroll.
- Evidence: hold the PUT with `pendingPut`, rerender with `OTHER_FILE`, then resolve it. Predicted: `document.activeElement` is the new file's row button with the old index (give OTHER_FILE two rows so index 1 exists). With a 409 `changed` body, the panel `status` reads CHANGED_MESSAGE under the other file. No test covers this.

### F-4 (bucket A, B12): when the chunks go and no other source is left, the dialog disappears but `editTarget` stays set

- 起きる条件: B12 says the dialog closes and drops its draft when the chunks become unavailable. The code closes it only through the `source` effect (`TranscriptSection.tsx:488-491`). The availability effect returns early when nothing is available (:433), so `source` stays `"chunks"`. The component then returns `null` (:1038), which unmounts the dialog without clearing `editTarget`. While that lasts, the follow-suspend effect (:813-815) keeps following off and the panel error line stays hidden (:1110). When a reload brings the chunks back (for example after a reindex finishes), the dialog reappears on its own with the old target and the stored text, and a save there answers `changed`.
- This needs a reload with no chunks, words or external subtitles, which in practice means a transcript being cleared or rebuilt while the dialog is open.
- 頻度 0–1 x 影響 3. The existing test "closes and discards the draft when the source switches by itself" only covers the case where 単語 remains.
- Evidence: in the touch test harness with `EXTERNAL_TRACKS` empty and the words VTT returning 404, set `files[FILE].chunks = []` and reload, then restore the chunks and reload again. Predicted: `getByRole("dialog")` is present again.

### F-5 (test gap, bucket A, B10 / B11): two spec rules with no test, each a one-line mutation away

Each of these can be removed without any unit or e2e test failing (no test checks `activeElement` / `toHaveFocus` or a dialog error after an edit. F7's "no row can be selected while the inline editor is open" is held twice, by `disabled` on the other rows at :1257 and the early return at :1253, so it is not listed):
- **B10 focus on close.** Delete the `focusRow(target.index)` call at `TranscriptSection.tsx:855`, or make it always focus the seek button. Focus then falls to `<body>` on every close, which costs keyboard and assistive users their place. On a phone this is invisible. Defect: 頻度 8 x 影響 1 = 8.
- **B11 the dialog error clears on edit.** Delete `setError(null)` at `TranscriptEditDialog.tsx:172`. The `busy` / `too_long` message then stays under the field while the owner fixes the text, until the next save. Defect: 頻度 1 x 影響 2.
Both score below the bar. They are listed so that the decision to leave them unguarded is made deliberately.

## Bucket B (odd input / misuse; no reproduction) — counted in TOTAL as B-1..B-4

- B-1: A stored chunk whose text already holds a line break is written into the textarea by `field.value = target.text` (`TranscriptEditDialog.tsx:64`), which bypasses the onChange stripping. Saving it unchanged sends the `\n`, the backend answers `line_break` (`app/routers/files.py`), and `errorText` shows that as 「長すぎます」 (`TranscriptSection.tsx:887`). The inline `<input>` dropped such breaks by value sanitisation. This needs a transcript text containing an interior newline, which the save path never writes.
- B-2: There is no focus trap (accepted in Checked, no action). If an iPad's keyboard or trackpad is attached while the dialog is open, the pointer becomes fine and the fine-path 修正 buttons are drawn behind the modal. Tab can then reach one and open the inline editor while the dialog is open, a state §3 forbids. It needs a hardware keyboard and Tab navigation behind a modal.
- B-3: A paste containing a line break rewrites `event.target.value` (`TranscriptEditDialog.tsx:171`), which sends the caret to the end of the field. Mid-text pastes then continue typing at the end.
- B-4: When a reload renumbers rows while the dialog is open (F6), `focusRow` (:844-850) finds the block by `data-cue-index` alone. On close it can focus, and scroll to, a different row that now holds that index. The spec only promises focus on "the row".

## What I checked and found holding
- `expected_text` / `expected_start` / `index` come from the `editTarget` snapshot taken at open, are unaffected by reloads (F6, I5), and match what the inline editor sends.
- The draft lives in the uncontrolled field. The value-setting effect depends only on `target.text`, and `editTarget` is a stable state object, so clock ticks, reloads and pointer changes do not reset it (I8). The saved text is `fieldRef.current.value`, which is what is shown.
- The dialog's error state dies with the unmount, so it is never carried into the next dialog (B11). Opening clears the panel `actionError`, and the panel error line is hidden while `editTarget` is set.
- Escape goes through `useShortcuts` → `ShortcutsProvider`, which applies `isImeKeystroke`, including the post-compositionend grace window. `close` refuses while `saving`. Return calls `preventDefault` outside composition only (I6).
- The selection is compared with the current source's `cues` by both `index` and `start`. An empty save deletes the row without renumbering (`files.py`), so the emptied selected row clears and the others keep their index. `selectedPosition` and `activeIndex` are both positions, so the reveal comparison is consistent even with a gap. The `isPlaying` index-versus-position mismatch is the accepted pre-existing one.
- Fine path (I9): the inline editor, its keys, `editDraftsRef`, `saveEdit` and the row and button classes for fine and unknown pointers are unchanged apart from dropping the `pointer-coarse:` classes, which never matched a fine pointer. A coarse pointer with the inline editor open keeps it, and the other rows stay disabled (F7).
- Focus on close after a successful save happens before the reload, so it lands on the strip's 修正 while that is drawn. A reload that then removes the row does not refocus (B10).

## Not checked
- Real iOS behaviour: whether a programmatic `focus()` in the effect opens the keyboard, the IME compositionend/keydown order in Safari for this textarea, and whether focusing the strip's 修正 after close shows a `focus-visible` ring on a phone.
- The interaction between the `revealCue` instant scroll and an in-progress smooth follow scroll, beyond the case the e2e covers.
- The MobileInspectorSheet Escape interplay (accepted in the spec).
- Backend paths other than the correction handler; the core docs and design-check artifacts (prose, out of scope).

TOTAL: 9 findings
