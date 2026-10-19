# core: IME-confirming Enter — R-0 invariants

Change: add one hook to `frontend/src/lib/ime.ts` and route every core text-field
Enter handler through it. The hook records `compositionend` and answers "does this
keydown belong to the IME" (`isComposing`, `keyCode 229`, or an Enter / Escape
within `COMPOSITION_GRACE_MS` of `compositionend`, consumed once).

Guarded fields (14): FileSaveDialog filename; CollectionDetail name;
CollectionPicker new name; FolderToolbar new folder; SelectionBar batch tag;
ProfileSection nickname; SidebarCollectionsSection create and rename;
EditableTagChips; GlobalSearch; SmartFolderSaveDialog; InlineNameEditor;
PdfPreview page number; ShortcutsProvider (document-level).

1. In each guarded field, an Enter that arrives within `COMPOSITION_GRACE_MS`
   after that field's `compositionend` fires none of its actions (submit, save,
   create, add tag, navigate); the typed text stays in the field.
2. An Enter keydown with `isComposing: true` or `keyCode: 229` fires no action in
   any guarded field.
3. An Enter with no composition before it, or one arriving after the grace
   window, fires the action exactly once, as today. Only one keystroke is
   swallowed per `compositionend`.
4. An Escape within the grace window does not cancel, close or abandon the
   field; the next Escape does.
5. Outside composition, the other keys a guarded field handles behave as today
   (EditableTagChips Backspace removes the last tag and arrows move the
   suggestion; GlobalSearch arrows move the highlight).
6. Handlers declared out of scope are unchanged: Cmd/Ctrl+Enter still posts or
   saves in CommentSection and CollectionDetail's description; Enter / Space
   still opens a row or card (FileListRow, MergedResultItem, useFileCardLink,
   FilterField's menu and trigger).
7. Global shortcuts still ignore the IME-confirming Enter / Escape and still fire
   on ordinary presses.
8. A new core text-field Enter handler that does not go through the hook, or a
   guarded field that stops using it, fails a test.

Declared behaviour change: while an IME is composing (`isComposing` / 229), a
guarded field's handler now ignores every key, not only Enter — GlobalSearch's
arrow keys no longer move the result highlight mid-conversion.

## Revised by the supervisor after r1

9. Inside the grace window, keys other than Enter and Escape pass through and do
   not spend the one swallowed keystroke (InlineNameEditor commits on Tab).
