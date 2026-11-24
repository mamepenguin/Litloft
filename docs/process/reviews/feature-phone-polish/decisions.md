# Decisions

decision:
ran_in_app: yes
at: 4ba623abc77ff2437f9a9a487a3ad0d20937c773
by: agent
evidence: Ran the parallel stack (r5_stack.py clone/up, http://video-share-phone-polish.localhost:3101), drove it with headless Chromium (Playwright) at viewports 320 and 393, locale ja and en (NEXT_LOCALE cookie), on drive Home and on folder page /drive/<d>/Knowledge. Opened the Add menu in each of the 8 combinations. Every row (Upload files / Upload folder / New folder and the ja equivalents, plus the 3 addon rows below the divider) measured 36px high (one line), scrollWidth <= clientWidth (not clipped), and the menu box stayed inside the viewport (left 16px, right 196px en / 217px ja, viewport 320 or 393; document scrollWidth equals viewport). Home and folder page show the same 6 rows (3 core + 3 addon). Folder cards on drive Home at 393px (ja: 13件, 9件, 130件; en: 13 items): second line is only the count. Screenshots in /private/tmp/claude-502/shots/ (e.g. ja-320-submenu.png, en-320-home.png, ja-393-home.png, ja-320-folder.png). Stack destroyed afterwards.
pending: none for the scoped checks. Note for the author: the folder page lists subfolders as list rows (name + count), not cards; the card grid is on the drive Home, which is where the card check was made. A real browser window or device was not used (headless Chromium emulation of viewport width only).

design-check D-1: accepted by the owner on 2026-11-17 ("差を受け入れる"); the "フォルダ" label was illustration on the canvas, not part of this change.
