# Decisions

decision: continue (user, 2026-11-03, after r1 HUMAN_REVIEW_REQUIRED: "とりあえず実際のバグ修正の方はその方針で", accepting the proposal to keep the markdown cleanup for .md/.markdown/.txt and show other text files' first lines as they are, add a subtitle text/vtt row with no excerpt, and leave non-UTF-8 sources out of scope)
ran_in_app: yes
at: 422fa2eae23e9fefe8b337a443c1a3f91e7a08c1
by: agent
evidence: |
  Environment: own scratch stack, compose project `litloft-r5-card-c`, `LITLOFT_PORT=3996`
  (`docker compose -p litloft-r5-card-c -f docker-compose.yml -f .r5/override.yml up -d --build
  backend frontend`). Fresh scratch `data/` with `setup_completed`; `drives.json` =
  `[{"name":"Scratch","path":"/app/drives/scratch"}]`, `passwords.json` = `[]`, and
  `.r5/override.yml` mounts `.r5/drive` at `/app/drives/scratch`. Drove it with Playwright
  Chromium (`@playwright/test` 1.58.2, viewport 1400x1000, deviceScaleFactor 2, en locale)
  from `.r5/r5.mjs` and `.r5/compare.mjs`. The second script fetches the same
  `Range: bytes=0-1023` body the card fetches and compares it with the excerpt element's
  text, so the character checks below are text equality plus a screenshot.

  Classification reported by the app (`/api/drives/Scratch/files`, 41 records):
  `main.c` other/text/plain, `dash.c` other/text/plain, `reset.css` other/text/css,
  `hello.py` other/text/x-python, `catalog.xml` other/text/xml (so the app files `.xml`
  as text), `notes.txt` document/text/plain, `page.html` document/text/html,
  `readme.md` document/text/markdown; `photos/` = 30 generated PNGs image/png plus
  `main.c`, `hello.py`, `catalog.xml`. `sample.vtt` produced no record at all (see below).

  Screenshots: `docs/process/reviews/fix-source-card-excerpt/shots/` (`r2-*`), with the
  list crops enlarged 4x as `zoom-r2-list-*.png`.

  Card grid, `/drive/Scratch` (`r2-cardgrid-scratch.png`; per-card `r2-cardgrid-*.png`).
  The excerpt text for the `other` + `text/*` files was byte-for-byte the file's body
  with only the ends trimmed:
  - `main.c`: `#include <stdio.h>`, `#include <stdlib.h>`, `int main(int argc, char **argv) {`,
    `for (i = 0; i < n; i++) {`, `p->x = 1;`, `printf("%d\n", i);`, `return 0;` — `<stdio.h>`,
    `i < n` and `p->x` are drawn literally, not parsed or escaped (`r2-cardgrid-main.c.png`).
  - `reset.css`: `/* Reset */` as the first line, then `*, *::before, *::after {`,
    `a[href^="http"] { color: red; }` — the comment and the `[` / `^` / `"` characters are
    literal (`r2-cardgrid-reset.css.png`).
  - `hello.py`: `#!/usr/bin/env python3`, the triple-quoted docstring,
    `def f(*args, **kw):`, `return fns[i](x)`, `print(f(1, 2, k=3))` — `*args, **kw` and
    `fns[i](x)` are literal (`r2-cardgrid-hello.py.png`).
  - `catalog.xml`: `<?xml version="1.0" encoding="UTF-8"?>`, `<catalog>`,
    `<book id="b1"><title>Loft</title></book>`, `<book id="b2"><title>Attic</title></book>`,
    `</catalog>` — the XML tags appear as text, not as markup (`r2-cardgrid-catalog.xml.png`).
  - `dash.c` (an extra source file added for the spec's `---` sentence): first line `---`
    stays on the card (three dashes), followed by `#include <stdio.h>`; it is not treated
    as frontmatter (`r2-cardgrid-dash.c.png`).
  - `readme.md` (document): `Heading` (no `#`), `Some bold text and a link here.`
    (`**` and the `[link](https://example.com)` syntax gone), `- one`, `- two` — the
    existing cleanup, unchanged (`r2-cardgrid-readme.md.png`).
  - `notes.txt` (document): the plain body unchanged — `Plain notes for the loft.`,
    `Second line with some words.`, `Third line ends here.` (`r2-cardgrid-notes.txt.png`).
  - `page.html` (document): the existing cleanup, tags removed — `Loft page`,
    `A couple of tags here.` No `<h1>`/`<strong>` text, no doctype (`r2-cardgrid-page.html.png`).

  List, same folder (`r2-list-scratch.png`; crops `zoom-r2-list-*.png` at 4x):
  same text per file as the card grid; `#include <stdio.h>`, `/* Reset */`,
  `#!/usr/bin/env python3` and the XML declaration are visibly literal in the row
  preview. The row preview is a fixed 56px thumbnail, so it draws the first ~2 lines
  of a source file and clips the rest; the excerpt element itself holds the whole
  first kilobyte (measured equal to the stream body for `main.c`, `dash.c`, `reset.css`,
  `hello.py`, `catalog.xml`, `notes.txt`). The `.md`/`.html` rows show the same
  cleaned text as their cards.

  Justified grid, `/drive/Scratch/photos` (`r2-justified-photos.png`):
  `.justified-grid` is present (30 of 33 files carry known dimensions, above the 0.9
  threshold). The three text files fill packed cells and show the same exact excerpts
  as above: `main.c` (`r2-justified-main.c.png`), `hello.py`
  (`r2-justified-hello.py.png`), `catalog.xml` (`r2-justified-catalog.xml.png`). All 30
  photo cells draw an `<img>` thumbnail and none draws a text excerpt (the script counted
  0 image cells with a `text-thumbnail` child). The list of the same folder
  (`r2-list-photos.png`, `r2-list-photos-*.png`) gives the same result.

  `sample.vtt`: no card on any surface, and no excerpt. The scanner treats a subtitle as
  a sidecar, never a record (`backend/app/services/scanner.py`, `is_subtitle_file`), so
  the listing has no `.vtt`/`.srt` row at all (API query for those extensions: `[]`).
  The "no excerpt" row therefore holds in the only state ordinary use produces; the
  file cannot be observed as a card.

  Exact-character check over the three surfaces (excerpt textContent === stream body
  trimmed): true for `main.c`, `dash.c`, `reset.css`, `hello.py`, `catalog.xml`,
  `notes.txt`; `readme.md` and `page.html` differ only by the intended document cleanup,
  which matches the "as before" text above.

  Rendering note, no character differs: the excerpt paragraph uses
  `whitespace-pre-line`, so line breaks are kept but interior indentation is collapsed
  (e.g. `    for (...)` is drawn flush left on the card). The text content retains the
  spaces; the visible characters and line breaks are those of the file. The card grid
  and justified cells show the whole short file; the list preview clips it to its height
  (see above).

  Not producible by ordinary use, so not walked: a subtitle record reaching a listing
  (the scanner drops it), an `other` file with an Office mime, and an `audio`/`archive`
  file with a `text/*` mime (the mime follows the extension).

  Scratch-only files: `.r5/`, `drives.json`, `passwords.json`, `data/`; nothing committed,
  and the stack was brought down with `docker compose -p litloft-r5-card-c -f
  docker-compose.yml -f .r5/override.yml down`.
pending: none
