# Source code preview — invariants

Declared before the first review. `origin/develop..3411c56c`.

1. Line numbers do not appear in the result of `Selection.toString()` over the
   viewer's block.
2. Line numbers do not appear in the text a
   `TreeWalker(container, NodeFilter.SHOW_TEXT)` collects from that block.
3. A quote passed as `?highlight=` is wrapped in
   `mark.ask-citation-highlight`, as it was before the block was split into
   lines.
4. The text the block renders is **character for character** the file that was
   fetched, with CR folded to LF. Nothing is lost, duplicated or reordered by
   splitting it into lines.
5. A file that opened in the viewer before this change still opens and still
   shows all of its text: `.py`, `.c`, `.txt`, `.json`, `.csv`, `.js`, `.css`.
6. A file whose name names no language shows **all** of its text, without
   colour. Not a blank block, not a truncated one.
7. The uncoloured path and the over-limit path do **not** interpret the file's
   bytes as markup. A file containing `<script>` produces no script element.
8. `app.bin`, `photo.raw`, `a.out` and `.DS_Store` are not rendered as text.
9. The number of lines drawn equals the number of lines in the file: not one
   more for a trailing break, not one fewer without one.
10. A CRLF file is not drawn with every line double-spaced.
11. A file over either limit still shows all of its text, and says on screen
    why it has no numbers and no colour.
12. A quote captured from the viewer (the capture basket) contains no line
    number.

## Revision 1 — raised by the first round, approved by the supervisor

13. The gutter changes neither the height of a line nor the left edge of the
    block. Every line of a file the viewer numbers is one row tall unless the
    text itself wraps, at any line count up to `MAX_DECORATED_LINES`; and the
    number is inset from the block's edge by the same padding the text gets on
    the other three sides.

The first twelve are all on one axis — what is *in* the block's text — which
was the right axis for the risk the change carried, and on that axis the
change was clean. But the change's *purpose* was to draw something new beside
the text, and nothing in the list said anything about what is drawn. The one
region this change added was the only region with no invariant over it, and
that is exactly where the defect landed: a three-digit number did not fit its
box and wrapped inside it, making every line from 100 onward two rows tall.
The user found it by opening a 1206-line file.

## What these are about

The viewer draws one element per line so a CSS counter can number it. The
block's text is read by two other things — the citation search walks its text
nodes, the capture basket serialises a selection of it — so what is *in* that
text, and what is only drawn, is the axis most of these are on.
