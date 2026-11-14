# Send a file Ask question from the keyboard

SPEC-ID: SPEC-ADDON-107

Approval:

## Summary

The Ask tab on a file page (`addons/intelligence/frontend/AskTab.tsx`) sends a question
only through its **質問する** button; Enter inserts a newline. The Ask page
(`addons/intelligence/frontend/Page.tsx`) sends on Enter and inserts a newline on
Shift+Enter. This change gives the file Ask tab exactly the Ask page's rule: Enter
sends unless Shift is held. So a viewer who types a question can send it without reaching
for the button, and the two Ask inputs answer the same keys. Cmd+Enter and Ctrl+Enter
send under that rule, as they already do on the Ask page. It is for any viewer who uses Ask about one file.

## Required items

### 1. Normal flow

1. The viewer types a question in the file Ask tab's text field.
2. The viewer presses Enter without Shift (with or without Cmd, Ctrl or Alt/Option).
3. The question is sent exactly as a click on **質問する** sends it at that moment: same
   text, same profile choice, same player position.
4. The field and the thread behave as they do after a button click today.

Shift+Enter at step 2, with or without other modifiers, inserts a newline at the caret
and sends nothing.

| Keys | Result |
|---|---|
| Enter | send |
| Cmd+Enter, Ctrl+Enter, Alt/Option+Enter | send |
| Cmd+Alt+Enter, Ctrl+Alt+Enter | send |
| Shift+Enter | newline (browser default) |
| Shift with any of Cmd, Ctrl, Alt, plus Enter | left to the browser, never a send |

This is the Ask page's rule (`e.key === "Enter" && !e.shiftKey`), unchanged.

### 2. Failure cases

- The question is shorter than the minimum (the button is disabled): a sending key does
  nothing; no newline is inserted, nothing is sent.
- An answer is still streaming (the button is disabled): a sending key does nothing; no
  newline is inserted, nothing is sent.
- The Enter is the one that confirms an IME composition (Japanese input), or a key the
  IME still owns: the handler sends nothing and does not call `preventDefault`, so the
  key is left to the IME and the browser exactly as on the Ask page.
- A send that fails after it starts fails exactly as a button send does today; this
  change adds no failure path of its own.

### 3. States

The field's state has two independent parts.

**Sendability**

- **too short**: no answer streaming, fewer than the minimum non-space characters (the
  button is disabled).
- **sendable**: no answer streaming, at least the minimum (the button is enabled).
- **streaming**: an answer is being received. The field stays editable; typed text is
  kept.

too short ↔ sendable by typing or deleting. sendable → streaming by a sending key or a
button click; the send clears the field, as a button send does today. streaming → too
short or sendable (by the text then in the field) when the answer settles (answered or
failed) or the thread is dropped, as today.

**Composition**

- **none**: no IME composition.
- **composing**: a composition is open in the field.
- **just composed**: the grace window (`COMPOSITION_GRACE_MS` in `frontend/src/lib/ime.ts`)
  right after a composition ends.

none → composing when the IME opens a composition; composing → just composed when it
ends; just composed → none when its first Enter or Escape is consumed, or the window
passes. Composition changes in any sendability state, streaming included, and does not
change sendability.

A sending key starts a send only when sendability is **sendable** and composition is
**none**. In every other state the press is
dropped: nothing is sent then, and nothing is queued to be sent when the state changes.

### 4. Data read and written

None new. The key handler reads the field's text and the same "can send" condition the
button uses, and calls the same send path. No store, table, file or cache is added or
changed.

### 5. External services

None new. The send reaches the same Ask route the button reaches.

### 6. Authorization

Unchanged. Whoever can see the Ask tab can send from it today with the button; the keys
grant nothing more. The checks stay in the core proxy and the addon route.

### 7. Effect on existing features

- The Ask page keeps its keys (Enter sends, Shift+Enter newline) and is not edited.
- The comment section keeps Cmd/Ctrl+Enter to post and Enter for a newline.
- The **質問する** button keeps working as it does.
- App-wide keyboard shortcuts: those registered with `editingOnly: false` fire from inside
  a text field. On a file page none of them is bound to Enter today (the ones active there
  are Cmd/Ctrl+\ and dialog Escapes; Quick Note's Ctrl+Enter is bound only while its
  overlay is open, which takes focus from the Ask field). So a press here reaches no other
  handler. The Ask field does not stop its keys from propagating, the same as the Ask
  page; the shortcut registry is not edited.

### 8. Error behavior

Nothing new is shown or logged. A blocked key press (too short, streaming, IME) is
silent, as a click on the disabled button is.

### 9. User-visible behavior

- Enter without Shift in the file Ask field sends the question, whatever other modifier
  is held (the table in item 1).
- Shift+Enter inserts a newline.
- Confirming a Japanese conversion with Enter only confirms it; a second Enter sends.
- On a phone's on-screen keyboard, the return key behaves as on the Ask page: it usually
  sends, and then a newline cannot be typed. A keyboard that still holds the current word
  in an open composition when return is pressed reports an IME-owned key, so return there
  types a newline or confirms the word instead of sending. Both are accepted; neither is
  a defect of this change.
- The placeholder, the button label and every other text stay as they are.
- `docs/user-guide/keyboard-shortcuts.md` lists the keys of both Ask inputs as two rows,
  `Enter` (send) and `Shift+Enter` (newline). Cmd/Ctrl+Enter is not given its own row,
  because it is covered by "Enter without Shift".

### 10. Non-functional

Runs entirely in the browser on a key press; no extra request, timer or render cost
beyond today's send. The IME guard's grace window is the shared one in
`frontend/src/lib/ime.ts`.

## Touch points

- `addons/intelligence/frontend/AskTab.tsx` (addon repository `addons/intelligence`):
  the question `<textarea>` gains `onKeyDown` and `onCompositionEnd`; the submit logic is
  reused, not duplicated.
- `frontend/src/lib/ime.ts` (`useImeKeyGuard`): read and used, not edited.
- Tests for the Ask tab under `addons/intelligence/frontend/`. The IME test reproduces
  the measured event order (composition end, then Enter with `isComposing: false`), with
  the core helper `frontend/src/__tests__/helpers/imeEnter.ts`
  (`confirmConversionThenEnter`) or an equivalent.
- `frontend/src/__tests__/ime-enter-guard.test.ts` (core): add
  `intelligence/frontend/AskTab.tsx` to `ADDON_TEXT_FIELD_ENTER` and raise the addon
  count from 8 to 9, in the same core commit as the submodule pointer bump.
- `docs/user-guide/keyboard-shortcuts.md`: a section for the Ask inputs.
- `docs/specs/INDEX.md`, this spec, `docs/process/reviews/feature-file-ask-enter-submit/`.
- The `addons/intelligence` submodule pointer in the core repository.
- No protected path is edited.

## Invariants

I1. In the file Ask field, an Enter press without Shift (with or without Cmd, Ctrl or
Alt/Option), while the field is sendable and not composing, starts the same send a click on **質問する** starts
at that moment: the same text, profile and player position. One press starts at most one
send.
I2. An Enter press with Shift held, whatever other modifier, never sends and is left to
the browser; Shift+Enter alone inserts a newline.
I3. An Enter that confirms an IME composition, or any key the IME still owns, never sends
and is not turned into a newline by the handler.
I4. A sending key while the button is disabled (question too short, or an answer
streaming) sends nothing, inserts no newline, leaves the text unchanged, and causes no send
later when the state changes.
I5. Keys other than Enter in the file Ask field behave as before this change.
I6. The Ask page's and the comment section's key behavior is unchanged.

## Checked, no action

- **Excluding Alt/Option+Enter from sending.** Considered, so that Alt+Enter would stay
  with the browser. Not taken: the two Ask inputs would then differ on that key, and the
  Ask page is not edited in this change.
- **Stopping the send keys from reaching document-level shortcuts.** No Enter shortcut
  can fire from the field on a file page today (item 7), and the Ask page does not stop
  them either. Left as it is.
- **The comment section.** Comments are often several lines; Enter to post would cause
  accidental posts. It keeps Cmd/Ctrl+Enter. Aligning it is a separate change if wanted.
- **A newline on a phone keyboard.** The Ask page already sends on return there, and a
  question rarely needs a newline. Detecting a touch keyboard to switch the binding was
  not taken; it would make the two Ask inputs differ by device.
- **Escape in the field.** Not bound today and not in the request.
- **A shared hook for "Enter sends" textareas.** Two callers (Ask page, file Ask) do not
  justify a new shared abstraction; each uses `useImeKeyGuard` directly.
