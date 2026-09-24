# Quick Note

Quick Note writes down a thought from any page and files it as a Markdown file, without taking you away from what you were doing. It is part of Litloft itself and needs no addon.

## Opening it

- Press `N` when you are not typing in a field.
- Or press **Quick note** in the header. It works on every page, including the drive picker and the admin pages.

**New note** on the Notes page opens the same panel with that drive, and on **All notes** the chosen folder, already set as the destination.

## Writing and saving

Type the note. Nothing is created until you save.

- **Save** (or `Cmd/Ctrl+Enter`) files the note and closes the panel. You stay where you were, and a message shows where the file went.
- **Save and open** files the note and then opens it, in the editor if one is installed (the [Knowledge addon](../addons/knowledge.md)).
- **Cancel**, `Esc` or a click outside the panel closes it. If you have written something, it asks **Discard this note?** first. A discarded note cannot be recovered.

The unsaved text lives only in the panel. Reloading the page loses it.

## Where the note goes

The **Destination** line shows the drive and folder. Press it to change them.

- **Drive** — the drive you opened the panel from, else the one you last saved to, else your only drive. If none of these applies, choose one; nothing is picked for you.
- **Folder** — each drive remembers the last folder you saved to on this device, starting with `Inbox`. You can also choose the drive root. A folder that does not exist yet is created when you save.

## The filename

The name comes from the first line of the note and is shown under **Saves as** while you type. A leading `#`, `>` or list marker is left out of the name, and characters a filename cannot hold are replaced. The first line stays in the note as you wrote it.

If the first line gives no usable name, the file is named `note-<date>-<time>.md`. If the name is already taken in that folder, ` (1)`, ` (2)` and so on is added; the message after saving shows the name actually used.

The result is an ordinary Markdown file. You can find, tag, edit and trash it like any other.

## When saving fails

| Message | What to do |
|---|---|
| **Could not load drives.** | Press **Retry**. |
| **The note is over the 1 MB limit.** | Shorten the note. |
| **That drive is no longer available. Choose another destination.** | Pick another drive. |
| **That destination was rejected. Change the first line or the folder and try again.** | Change the first line or the folder. |

When saving fails, the panel stays open with your text.

See [keyboard shortcuts](keyboard-shortcuts.md) for the other keys.
