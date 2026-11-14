# Send a file Ask question from the keyboard

SPEC-ID: SPEC-ADDON-107

Approval:

## Summary

The Ask tab on a file page (`addons/intelligence/frontend/AskTab.tsx`) sends a question
only through its **質問する** button; Enter inserts a newline. The Ask page
(`addons/intelligence/frontend/Page.tsx`) sends on Enter and inserts a newline on
Shift+Enter. This change gives the file Ask tab the same keys, plus Cmd/Ctrl+Enter, so a
viewer who types a question can send it without reaching for the button, and the two
Ask inputs answer the same keys. It is for any viewer who uses Ask about one file.

## Required items

### 1. Normal flow

1. The viewer types a question in the file Ask tab's text field.
2. The viewer presses Enter (no modifier), Cmd+Enter or Ctrl+Enter.
3. The question is sent exactly as a click on **質問する** sends it at that moment: same
   text, same profile choice, same player position.
4. The field and the thread behave as they do after a button click today.

Shift+Enter at step 2 inserts a newline at the caret and sends nothing.

### 2. Failure cases

- The question is shorter than the minimum (the button is disabled): a sending key does
  nothing; no newline is inserted, nothing is sent.
- An answer is still streaming (the button is disabled): a sending key does nothing; no
  newline is inserted, nothing is sent.
- The Enter is the one that confirms an IME composition (Japanese input), or a key the
  IME still owns: it is left to the IME; nothing is sent and the field gets no extra
  newline.
- A send that fails after it starts fails exactly as a button send does today; this
  change adds no failure path of its own.

### 3. States

The field is in one of: idle and sendable (button enabled), idle and not sendable (too
short), streaming, or composing (IME active). Only "idle and sendable" lets a sending key
start a send. The transitions out of a send are those of the button today.

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
- App-wide keyboard shortcuts do not fire from inside the field (they already ignore
  typing targets); this change relies on that and does not edit the shortcut registry.

### 8. Error behavior

Nothing new is shown or logged. A blocked key press (too short, streaming, IME) is
silent, as a click on the disabled button is.

### 9. User-visible behavior

- Enter, Cmd+Enter and Ctrl+Enter in the file Ask field send the question.
- Shift+Enter inserts a newline.
- Alt/Option+Enter is not bound: it does what the browser does by default.
- Confirming a Japanese conversion with Enter only confirms it; a second Enter sends.
- On a phone's on-screen keyboard, the return key sends, as on the Ask page; a newline
  cannot be typed there.
- The placeholder, the button label and every other text stay as they are.
- `docs/user-guide/keyboard-shortcuts.md` lists the keys of both Ask inputs.

### 10. Non-functional

Runs entirely in the browser on a key press; no extra request, timer or render cost
beyond today's send. The IME guard's grace window is the shared one in
`frontend/src/lib/ime.ts`.

## Touch points

- `addons/intelligence/frontend/AskTab.tsx` (addon repository `addons/intelligence`):
  the question `<textarea>` gains `onKeyDown` and `onCompositionEnd`; the submit logic is
  reused, not duplicated.
- `frontend/src/lib/ime.ts` (`useImeKeyGuard`): read and used, not edited.
- Tests for the Ask tab under `addons/intelligence/frontend/`.
- `docs/user-guide/keyboard-shortcuts.md`: a section for the Ask inputs.
- `docs/specs/INDEX.md`, this spec, `docs/process/reviews/feature-file-ask-enter-submit/`.
- The `addons/intelligence` submodule pointer in the core repository.
- No protected path is edited.

## Invariants

I1. In the file Ask field, Enter without Shift, Cmd+Enter and Ctrl+Enter each start the
same send a click on **質問する** starts at that moment, and never a second send for one
press.
I2. Shift+Enter in the file Ask field inserts a newline and never sends.
I3. An Enter that confirms an IME composition, or any key the IME still owns, never sends
and is not turned into a newline by the handler.
I4. A sending key while the button is disabled (question too short, or an answer
streaming) sends nothing and inserts no newline.
I5. Keys other than Enter (Alt/Option+Enter included) in the file Ask field behave as
before this change.
I6. The Ask page's and the comment section's key behavior is unchanged.

## Checked, no action

- **Alt/Option+Enter as a send key.** Few apps bind it, and on macOS Option+Enter can be
  used for text input. Left to the browser.
- **The comment section.** Comments are often several lines; Enter to post would cause
  accidental posts. It keeps Cmd/Ctrl+Enter. Aligning it is a separate change if wanted.
- **A newline on a phone keyboard.** The Ask page already sends on return there, and a
  question rarely needs a newline. Detecting a touch keyboard to switch the binding was
  not taken; it would make the two Ask inputs differ by device.
- **Cmd/Ctrl+Enter on the Ask page.** Adding it there too would make both inputs fully
  identical, but this change leaves the Ask page untouched (minimal change). A press there
  today already sends, because Enter without Shift sends regardless of Cmd/Ctrl.
- **Escape in the field.** Not bound today and not in the request.
- **A shared hook for "Enter sends" textareas.** Two callers (Ask page, file Ask) do not
  justify a new shared abstraction; each uses `useImeKeyGuard` directly.
