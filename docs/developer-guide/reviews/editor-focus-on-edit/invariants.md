# R-0 invariants: focus the note editor when leaving preview (knowledge 7c688e2)

1. preview -> edit and preview -> split put document.activeElement inside the CodeMirror content, via both the toggle and Ctrl+Shift+\, whether viewMode is owned by core MarkdownDocumentLayout (chrome context) or by the standalone Editor.
2. Entering edit/split from preview never changes the document text or the selection range.
3. split -> edit, edit -> split, and any -> preview never move focus and never scroll.
4. Switching view modes never triggers a save, an autosave, or a version record.
5. `?edit=1` on creation still lands focused in edit mode (existing autoFocus).
6. A mode switch while content is loading, or while a version restore is running, never makes the editor accept input.
7. The existing focus() callers (toolbar actions, wiki autocomplete, file-link insert) keep their current behaviour: no added scroll.

## Revision after r1 (approved by the user)
8. A mode switch before the editor has mounted (while loading, or a file change that lands in edit) throws nothing and does not move focus.
