# R-0 invariants — feat/pdf-fullscreen (core 3f1e6284, knowledge ceb4ea1)

1. The inline PDF viewer, "open in new tab", PageUp/PageDown, the page-number box and quoting from the inline viewer behave exactly as at the parent.
2. Opening the full-screen viewer shows the inline viewer's current page; closing it (✕, Esc, f) leaves the inline viewer — and the inspector's Pages tab — on the last page shown.
3. The document is fetched once: opening the full-screen viewer triggers no new request for the PDF file.
4. A pair never shows two pages unless both are known portrait; the first page is always alone; a wide page in spread mode is split into halves.
5. A quote taken in the full-screen viewer carries the page it was selected on (the first page of the selection), or the page in view when nothing is selected; it never carries an anchor.
6. While zoomed, touch swipe and edge tap do not change the page; a mouse drag never changes the page and never pans; a press that starts on a link in the document follows the link and does not page.
7. The full-screen viewer paints over all page chrome at every width (portalled to body, z-[60]), and the rest of the page is inert while it is open.
8. No pdfjs code is evaluated on the server (`/drive/*` document requests stay 200).
9. Core names no addon: the new slot is generic, and without the knowledge addon the viewer works and shows no quote button.

## Revised after r1 (approved by the user)

10. A mouse click, double-click or triple-click on the document never changes the page (and a mouse drag never pans); touch keeps its taps and swipes.
11. Changing the file while the full-screen viewer is open closes it, and it does not reopen on the next file.
12. While the full-screen viewer is open, the keys it binds (← → PageUp PageDown f Esc) reach the viewer and nothing beneath it, even if a context below registers the same key after the viewer opened.

Also decided after r1: the quote button is told it sits on a dark bar (`tone: "on-dark"` in the slot props) and draws as the bar's other controls; a link to a page inside the document goes there, inline and in full screen (the inline half was a pre-existing gap, closed by the same handler).
