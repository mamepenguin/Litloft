# Send an Ask question from the keyboard

SPEC-ID: SPEC-ADDON-107

Approval: sha256:faef5d4dd878ca31de9af3dff91eb892e010e0772d2a1e8a02969ee4a729fb69 Yuichi Senga 2026-11-14

## Summary

The Ask tab on a file page (`addons/intelligence/frontend/AskTab.tsx`) sends a question
only through its **質問する** button; Enter inserts a newline. The Ask page
(`addons/intelligence/frontend/Page.tsx`) sends on any Enter without Shift, so
Alt/Option+Enter sends there too, while common AI chat apps use Alt/Option+Enter for a
newline. This change gives both Ask inputs one rule: Enter, Cmd+Enter and Ctrl+Enter
send; Shift+Enter and Alt/Option+Enter insert a newline. A viewer can send a question
without reaching for the button, and a viewer used to Alt/Option+Enter for a newline does
not send a half-written question by accident. It is for any viewer who uses Ask.

## Required items

### 1. Normal flow

1. The viewer types a question in either Ask input: the file Ask tab or the Ask page.
2. The viewer presses Enter, Cmd+Enter or Ctrl+Enter.
3. The question is sent exactly as a click on that input's send button sends it at that
   moment: the key runs the button's own submit path. On the file Ask tab that is
   **質問する**, with the same text, profile choice and player position. On the Ask page
   that includes clearing the "saved" link of a note saved from the previous answer, which
   an Enter send today skips.
4. The field and the answer area behave as they do after a button click today.

Shift+Enter or Alt/Option+Enter at step 2 inserts a newline at the caret (replacing any
selection), leaves the caret right after it, and sends nothing. When the field is at its
maximum length (the file Ask tab's `maxLength`), both insert nothing.

| Keys | Result |
|---|---|
| Enter | send |
| Cmd+Enter, Ctrl+Enter | send |
| Shift+Enter | newline |
| Alt/Option+Enter | newline |
| Any other combination with Enter (Shift+Alt, or Cmd/Ctrl together with Shift or Alt) | never sends; left to the browser |

So the send condition is: Enter with neither Shift nor Alt/Option held.

### 2. Failure cases

- The question is too short to send (the button is disabled): a sending key does
  nothing; no newline is inserted, nothing is sent.
- An answer is still streaming (the button is disabled): a sending key does nothing; no
  newline is inserted, nothing is sent.
- The Enter is the one that confirms an IME composition (Japanese input), or a key the
  IME still owns: the handler sends nothing, inserts nothing and does not call
  `preventDefault`, so the key is left to the IME and the browser.
- The browser does not insert a newline for Alt/Option+Enter by itself: the field still
  gets the newline (I2); how is the implementation's choice.
- On the Ask page, Ask availability is still being checked: same as too short. Ask is
  unavailable: the field is disabled and receives no keys, as today.
- A send that fails after it starts fails exactly as a button send does today; this
  change adds no failure path of its own.

### 3. States

The field's state has two independent parts. The same model holds for both Ask inputs;
the Ask page's "can send" condition is the one its send button already uses.

**Sendability**

- **too short**: no answer streaming, the text below the input's minimum (the button is
  disabled).
- **sendable**: no answer streaming, the text at least the minimum (the button is
  enabled).
- **streaming**: an answer is being received. On the file Ask tab the field stays
  editable and typed text is kept.

On the Ask page there is also **checking** (Ask availability not yet known; the field is
enabled) and **unavailable** (the field is disabled, as today). checking → too short or
sendable when Ask answers available; checking → unavailable when it answers not
available. In checking, a sending key is dropped and a newline key inserts a newline, as
in too short.

too short ↔ sendable by typing or deleting. sendable → streaming by a sending key or a
button click; the send then changes the field as a button send does today. streaming →
too short or sendable (by the text then in the field) when the answer settles, is
aborted, or the thread is dropped, as today.

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
**none**. In every other state the press is dropped: nothing is sent then, and nothing is
queued to be sent when the state changes. A newline key (Shift+Enter, Alt/Option+Enter)
inserts a newline in every sendability state where the field is enabled, when
composition is **none**.

In **composing** and **just composed**, every Enter, with any modifier, is the IME's: the
handler does nothing and the browser and IME decide. So the first Enter, Shift+Enter or
Alt/Option+Enter inside the grace window may differ from one another (a browser may add a
newline for Shift+Enter and not for Alt/Option+Enter). This is accepted: the window is
about 100 ms right after a conversion is confirmed.

### 4. Data read and written

None new. The key handlers read the field's text and the same "can send" condition the
button uses, and call the same send path. No store, table, file or cache is added or
changed.

### 5. External services

None new. A send reaches the same Ask route the button reaches.

### 6. Authorization

Unchanged. Whoever can use an Ask input can send from it today with the button; the keys
grant nothing more. The checks stay in the core proxy and the addon routes.

### 7. Effect on existing features

- The Ask page: Alt/Option+Enter (and Cmd/Ctrl+Alt+Enter) changes from send to newline or
  browser default. An Enter send now also clears the previous answer's "saved" note
  link, as the button already does. Shift+Enter keeps its behavior.
- The comment section keeps Cmd/Ctrl+Enter to post and Enter for a newline.
- The send buttons keep working as they do.
- App-wide keyboard shortcuts: those registered with `editingOnly: false` fire from inside
  a text field. On the file page and the Ask page none of them is bound to Enter today
  (Quick Note's Ctrl+Enter is bound only while its overlay is open, which takes focus from
  the Ask field). So a press here reaches no other handler. The Ask inputs do not stop
  their keys from propagating; the shortcut registry is not edited.

### 8. Error behavior

Nothing new is shown or logged. A blocked key press (too short, streaming, IME) is
silent, as a click on the disabled button is.

### 9. User-visible behavior

- Enter, Cmd+Enter and Ctrl+Enter in either Ask input send the question.
- Shift+Enter and Alt/Option+Enter insert a newline.
- Confirming a Japanese conversion with Enter only confirms it; a second Enter sends.
- On a phone's on-screen keyboard, the return key usually sends, and then a newline
  cannot be typed. A keyboard that still holds the current word in an open composition
  when return is pressed reports an IME-owned key, so return there types a newline or
  confirms the word instead of sending. Both are accepted; neither is a defect of this
  change.
- The placeholders, button labels and every other text stay as they are.
- `docs/user-guide/keyboard-shortcuts.md` gets a section for Ask with two rows: `Enter`
  sends, `Shift+Enter` or `Option+Enter` inserts a newline. Cmd+Enter is not given its
  own row.

### 10. Non-functional

Runs entirely in the browser on a key press; no extra request, timer or render cost
beyond today's send. The IME guard's grace window is the shared one in
`frontend/src/lib/ime.ts`.

## Touch points

- `addons/intelligence/frontend/AskTab.tsx` (addon repository `addons/intelligence`):
  the question `<textarea>` gains `onKeyDown` and `onCompositionEnd`; the submit logic is
  reused, not duplicated.
- `addons/intelligence/frontend/Page.tsx` (same repository): `handleInputKeyDown`'s send
  condition excludes Alt/Option, it sends through the button's submit path, and
  Alt/Option+Enter inserts a newline.
- The key rule is written in each of the two components. No new addon module holds it, so
  the files that mention `"Enter"` stay those two.
- `frontend/src/lib/ime.ts` (`useImeKeyGuard`): read and used, not edited.
- Tests for both inputs under `addons/intelligence/frontend/`. The IME test reproduces
  the measured event order (composition end, then Enter with `isComposing: false`), with
  the core helper `frontend/src/__tests__/helpers/imeEnter.ts`
  (`confirmConversionThenEnter`) or an equivalent.
- `frontend/src/__tests__/ime-enter-guard.test.ts` (core): add
  `intelligence/frontend/AskTab.tsx` to `ADDON_TEXT_FIELD_ENTER` and raise the addon
  count from 8 to 9, in the same core commit as the submodule pointer bump.
- `docs/user-guide/keyboard-shortcuts.md`: a section for Ask.
- `docs/specs/INDEX.md`, this spec, `docs/process/reviews/feature-file-ask-enter-submit/`.
- The `addons/intelligence` submodule pointer in the core repository.
- No protected path is edited.

## Invariants

I1. In either Ask input, Enter, Cmd+Enter or Ctrl+Enter, while the field is sendable and
not composing, starts the same send a click on that input's send button starts at that
moment (on the file Ask tab: the same text, profile and player position). One press
starts at most one send.
I2. Shift+Enter and Alt/Option+Enter in either Ask input never send. When not composing
and the field is enabled and below its maximum length, each leaves exactly one newline at
the caret, replacing any selection, with the caret right after it, in every sendability
state. At the maximum length both insert nothing.
I3. An Enter that confirms an IME composition, or any key the IME still owns, never sends,
and the handler neither inserts text nor calls `preventDefault` for it.
I4. A sending key while the input's send button is disabled (question too short, an
answer streaming, or on the Ask page Ask unavailable) sends nothing, inserts no newline, leaves the text unchanged, and causes no send
later when the state changes.
I5. Any other Enter combination (Shift+Alt, or Cmd/Ctrl with Shift or Alt) never sends,
and the handler neither inserts text nor calls `preventDefault` for it. Keys other than
Enter in either Ask input behave as before this change.
I6. The comment section's key behavior is unchanged.

## Checked, no action

- **Keeping Alt/Option+Enter as a send key on the Ask page.** Considered for minimal
  change. Not taken: common AI chat apps use it for a newline, and a mistaken send cannot
  be undone while a mistaken newline costs one more key press.
- **Stopping the send keys from reaching document-level shortcuts.** No Enter shortcut
  can fire from either field today (item 7). Left as it is.
- **The comment section.** Comments are often several lines; Enter to post would cause
  accidental posts. It keeps Cmd/Ctrl+Enter. Aligning it is a separate change if wanted.
- **A newline on a phone keyboard.** The Ask page already sends on return there, and a
  question rarely needs a newline. Detecting a touch keyboard to switch the binding was
  not taken; it would make the behavior differ by device.
- **Escape in the field.** Not bound today and not in the request.
- **A shared hook for "Enter sends" textareas.** Two callers; each writes the rule inline
  (Touch points). No addon or core module is added.
- **Undo of an inserted Alt/Option+Enter newline.** Whether one Cmd/Ctrl+Z removes it
  depends on how it is inserted; not required. A typed character is a cheap fix.
