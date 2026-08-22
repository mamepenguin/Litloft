# Quick Note

Quick Note captures a thought from wherever you already are — a video page, search results, the admin dashboard — and files it as a Markdown note without taking you off the screen you were on.

It is part of the core, not an addon. It works with the Knowledge addon disabled.

## Opening the panel

Two ways in, both available on every page:

- Press `N`. Like the other single-character shortcuts, this fires only when no input has focus, which is what keeps it out of the Markdown editor, the search box, and comment fields.
- Use the **Quick note** action in the header. The button works everywhere, including while you are typing in a text field, and on screens that have no active drive at all (the root drive picker, `/admin`, `/admin/settings`).

The panel opens as a dialog over the current page with the cursor already in the note text — you can start typing immediately. `Tab` stays inside the dialog while it is open.

## Nothing is created until you save

The note text lives only in the panel, in browser memory. It is never written to a draft file, to the server, or to browser storage on the way, so:

- **Cancel**, `Esc`, and clicking the backdrop all close the panel and leave nothing behind. No empty file, no stub, no entry in the folder.
- If the note already has text in it, closing asks first — **Discard this note?**, with **Keep editing** and **Discard**. There is no undo after **Discard**.
- Reloading the page loses an unsaved note by design.

Saving does not navigate. The panel closes, a toast confirms where the file landed (`drive/folder/name.md`), and you are still on the page you started from, at the same scroll position, with the same video still playing.

## Choosing where the note goes

The panel shows the destination as one collapsed line — **Destination: `drive` / `folder`** — and expands to a drive selector plus a folder picker when you want to change it.

### The drive

The drive is resolved fresh every time the panel opens, in this order:

1. The drive of the screen you opened the panel from, if you can currently reach it.
2. The drive of your last successful Quick Note save, if you can currently reach it.
3. The only accessible drive, if you have exactly one.
4. Otherwise **nothing is preselected**. The destination section opens itself and waits for you to choose.

There is deliberately no alphabetical fallback for step 4. A drive is a security boundary, so filing a note into the wrong one is worse than asking for one click. The list of drives comes from the server on every open, so a drive you no longer have unlocked is never offered and never quietly reused.

### The folder

Each drive remembers its own Quick Note folder, defaulting to **`Inbox`**. The folder picker also lets you choose the drive root.

- The preference is stored in the browser, per drive, so it is per device and not shared between browsers or viewers.
- It is written **only after a save succeeds**, so a destination the server rejected never becomes your next default.
- Switching drives in the panel switches to that drive's own remembered folder, never leaving the previous drive's path selected.
- If the folder does not exist yet, the server creates it (including intermediate levels) as part of the save. You do not have to create `Inbox` first.

## How the file is named

The filename is derived from the **first non-empty line** of the note and shown live as **Saves as** while you type. That line is not consumed — it stays in the file exactly as you typed it, and no frontmatter or heading is added.

Deriving the name:

- One leading Markdown marker is stripped: an ATX heading (`#` to `######`), a blockquote `>`, or a list marker (`-`, `*`, `+`, `1.`, `1)`) — including a task checkbox directly after a list marker.
- A trailing `.md` is removed, so the extension is not doubled.
- `/`, `\`, and control characters become `-`; runs of whitespace and runs of hyphens are collapsed; leading dots and trailing dots or spaces are dropped.
- The result is capped at 80 characters and 240 bytes of UTF-8, whichever is hit first, without splitting a character.
- `.md` is appended.

If nothing usable survives — the note starts with `###`, or with only punctuation — the file is named `note-YYYYMMDD-HHmmss.md` using your device's local time.

**Name collisions are resolved for you.** If the derived name is already taken in that folder, the server appends ` (1)`, ` (2)`, and so on before the extension; the toast reports the name that was actually used, not the predicted one. A save fails only if 99 numbered variants are all taken.

## What you end up with

An ordinary Markdown file in an ordinary folder. There is no separate notes store, no hidden index, no special record type. The note is immediately visible in the folder browser, and it is searchable, taggable, editable, versioned, and recoverable from trash exactly like any other Markdown file.

## When Save is unavailable

The **Save** button stays disabled until there is non-whitespace text and a confirmed destination. It also refuses in these cases:

| Situation | What the panel does |
|---|---|
| Drive list could not be loaded | Shows **Could not load drives** with a **Retry** action; Save stays disabled until the list is confirmed |
| No drive selected yet | Opens the destination section so you can pick one |
| Note over 1 MB of UTF-8 | Reports the limit; the server enforces the same cap |
| The chosen drive became unreachable | Reports it, re-checks your access, and reopens the destination section so you can pick another |

## Keys

`Cmd/Ctrl+Enter` saves and `Esc` closes — both work with the cursor still in the note text. See [keyboard shortcuts](keyboard-shortcuts.md) for the full set.
