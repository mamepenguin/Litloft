# Decisions

decision: continue (user, 2026-11-03, after r1 HUMAN_REVIEW_REQUIRED: "とりあえず実際のバグ修正の方はその方針で", accepting the proposal to keep the markdown cleanup for .md/.markdown/.txt and show other text files' first lines as they are, add a subtitle text/vtt row with no excerpt, and leave non-UTF-8 sources out of scope)
ran_in_app: yes
at: bb32127e80bd6afb3c315c5dbea9ff5923310444
by: agent
evidence: |
  Environment: own scratch stack, compose project `litloft-r5-card-a`, `LITLOFT_PORT=3996`
  (`docker compose -p litloft-r5-card-a -f docker-compose.yml -f .r5/override.yml up -d --build
  backend frontend`). Scratch drive `.r5/drive` mounted at `/app/drives/scratch` through
  `.r5/override.yml`; `drives.json` = `[{"name":"Scratch","path":"/app/drives/scratch"}]`,
  `passwords.json` = `[]`, `data/setup_completed` present so the app opens on the library.
  Drove it with Playwright Chromium (`@playwright/test`, viewport 1400x1000, en locale) from
  `.r5/r5.mjs`, `.r5/r5b.mjs`, `.r5/r5c.mjs`, `.r5/mixed.mjs`, `.r5/few.mjs`. Backend scan
  classified the files as intended (checked against `/api/drives/Scratch/files`):
  `hello.py` other/text/x-python, `main.c` other/text/plain, `style.css` other/text/css,
  `app.js` other/text/javascript, `notes.txt` document/text/plain, `report.docx` document/docx,
  `manual.pdf` document/pdf (`has_thumbnail: true`), `data.json` other/application/json,
  `blob.bin` other/application/octet-stream, `track.mp3` audio/audio/mpeg,
  `bundle.zip` archive/application/zip, 28 generated PNGs image/png (`has_thumbnail: true`).

  Screenshots: `docs/process/reviews/fix-source-card-excerpt/shots/`.

  Card grid (`/drive/Scratch`, `grid-scratch.png`; per-card crops `thumb-grid-*.png`):
  - `hello.py`, `main.c`, `style.css`, `app.js` (other + text/*): excerpt drawn. The card shows
    the title and the file's own first lines, e.g. Hello -> "#!/usr/bin/env python3 / \"\"\"A small
    greeting used to check the card excerpt.\"\"\" / def greet(name: str) -> str:".
  - `notes.txt` (document + text/*): excerpt drawn, "Meeting notes / =============".
  - `report.docx` (document + Office extractable, `/drive/Scratch/office`, `grid-office.png`):
    excerpt drawn, "Quarterly report for the loft. / Office excerpt should appear here.".
  - `manual.pdf` (document + pdf): thumbnail drawn (a white page render of the minimal PDF),
    no excerpt, as before.
  - `data.json`, `blob.bin` (other, not text/*): file icon, no excerpt.
  - `track.mp3` (audio), `bundle.zip` (archive): type icon, no excerpt.
  - `few-images/` (`grid-few-images.png`, 2 photos + 4 non-images, so the card grid): both
    images draw their thumbnail and never an excerpt.

  List (`/drive/Scratch`, `list-scratch.png`, `list-scratch-bottom.png`, crops `thumb-list-*.png`;
  same three mixed folders in `mixed.mjs`): the same result per file as the card grid —
  excerpt for `hello.py`, `main.c`, `style.css`, `app.js`, `notes.txt`, `report.docx`;
  thumbnail for `manual.pdf` and the photos; icon for `data.json`, `blob.bin`, `track.mp3`,
  `bundle.zip`. The rows below the fold fetch their excerpt text only after scrolling
  (`list-scratch-bottom.png` shows Hello with its first lines), which is the existing
  intersection-observer behaviour, not a missing excerpt.

  Justified grid (folders of 28 photos + 2 non-images, so >=90% of the loaded rows are images
  and the folder packs):
  - `/drive/Scratch/photos` (`justified-photos.png`, 28 photos + `hello.py` + `contact_sheet.py`
    + `manual.pdf`): `hello.py` draws its first lines in the packed cell, `contact_sheet.py`
    (other/text/x-python) too; the photos draw thumbnails; `manual.pdf` draws its thumbnail
    (`justified-hover-manual.png` shows the Manual cell on hover — a thumbnail, not text).
  - `mixed-text/` (`justified-mixed-text.png`): `notes.txt` excerpt, `data.json` icon.
  - `mixed-office/` (`justified-mixed-office.png`): `report.docx` excerpt, `track.mp3` icon.
  - `mixed-archive/` (`justified-mixed-archive.png`): `blob.bin` icon, `bundle.zip` icon.
  - Same folders in the list: identical result.

  Not producible by ordinary use, so not walked: `other` with an Office mime (every Office
  extension in `backend/app/services/filetype.py` classifies as `document`), `audio`/`archive`
  with a `text/*` mime (the mime comes from the extension), and a file with no `mime_type`
  (an unknown extension gets `application/octet-stream`, never null).

  Note on the scratch state: `docker compose ... down` was run at the end. `drives.json`,
  `passwords.json`, `data/` and `.r5/` are scratch files in this working directory and are
  gitignored except `.r5/`; nothing was committed.
pending: none
