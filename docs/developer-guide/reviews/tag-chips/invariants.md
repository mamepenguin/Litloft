# core: chips of recent and frequent tags in the empty tag field — R-0 invariants

Change: with nothing typed, `EditableTagChips` offers the tags that the file's
folder carries — recently used first, the rest by count — so a tag can be
clicked instead of typed through an IME. Typing still filters the drive-wide
list. `folder_path` becomes required on the `file` prop.

1. Once the user has typed, the suggestions are still the **drive-wide** tags
   matched as substrings, at most five.
2. A tag already on the file appears neither as a chip nor as a typed
   suggestion. The comparison ignores case.
3. Whether `localStorage` throws on read, on write, or on the property access
   itself, the tag field still renders and tags can still be **added and
   removed**.
4. A chip is only ever a tag that some file in this file's folder actually
   carries.
5. A tag added by clicking a chip passes the same checks as one typed: length,
   character set, duplicate, and the cap of ten.
6. Opening another file, **or another drive**, never paints the previous
   folder's chips — not for one frame.
7. In a folder whose files carry no tags, the suggestion list does not open.
8. Pressing "add tag" and then clicking elsewhere on the page does not cost
   that first click.

Invariant 4 is one-directional on purpose: it forbids offering a tag the folder
does not carry, and says nothing about offering every tag it does. That is why
r1's finding — a tag created in the session going missing from the chips — broke
no invariant while defeating the feature, and why it was caught by asking what
the change was *for* rather than what it must not break.
