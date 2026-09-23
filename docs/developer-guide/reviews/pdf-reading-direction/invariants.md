# R-0 invariants — feat/pdf-reading-direction (747ba8e6)

1. A PDF whose /ViewerPreferences /Direction is R2L opens the full-screen viewer right to left (pair order, half order, arrow keys, edge taps), and one with L2R left to right, whatever the stored direction.
2. A switch of reading direction made in the viewer of such a document lasts until the viewer closes and never changes the stored `image-viewer:reading-direction`.
3. A document without a declared direction behaves exactly as before: it opens in the stored direction and a switch is stored.
4. The full-screen viewer never opens on a document other than the one on screen, including when the file changes while its preferences are being read.
5. A document whose preferences cannot be read still opens full screen (as undeclared).
6. Everything else about the inline and full-screen PDF viewers is unchanged.
