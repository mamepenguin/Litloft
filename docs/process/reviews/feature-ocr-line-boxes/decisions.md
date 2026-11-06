# Decisions

decision:
ran_in_app: yes
at: 8f13a48058f848832f365eaf65ab2e390aa9b610
by: agent
evidence: |
  Environment. Compose project `litloft-r5-boxes`, LITLOFT_PORT=3995, own
  `.r5/override.yml`, scratch drive `scratch` at `.r5/drive`, scratch core
  data `.r5/data`, scratch addon data `.r5/intelligence`. Backend, frontend
  and the intelligence addon were built from this checkout; the addon
  submodule is at 25d169f68f786f77fb7528fbb785ed597a1ef8a4. `.r5/search-config.yml`
  sets `features.image_ocr: on_index`, `llm.provider: disabled`, and turns
  video-frame and scanned-PDF OCR off. UI language ja via NEXT_LOCALE=ja.
  The stack on port 3000 was not touched. The real `data/` was not used;
  the model cache was cloned into the scratch addon data only.

  Pictures and word coordinates. An HTML page was rendered in Playwright's
  Chromium and screenshotted at deviceScaleFactor 1; each word is a
  `<span data-word>` and its `getBoundingClientRect` was written to
  `.r5/words.json` together with the page size. `landscape.png` is
  1100x800, `portrait.png` 800x1600 (so the 70vh view scales it down),
  `heic-rotated.heic` uses a 900x600 source. `landscape-rotated.jpg` and
  `heic-rotated.heic` were made by rotating the screenshot 90 degrees CW
  and writing orientation 8 (JPEG EXIF; HEIC irot through pillow-heif's
  encoder in the intelligence container), so they display upright. The
  browser reports natural sizes 1100x800 and 900x600 for them; the HEIC
  is served as the core's oriented JPEG preview. OCR finished for all four
  (index details `status.ocr: true`, one `picture_texts` row each). The
  drive also held `notes.txt`, `document.pdf` (Playwright PDF) and
  `clip.mp4` (Samantha speech, transcribed by whisper local).

  1. One known word. Each picture was opened from its file page and find in
  this file was opened from the toolbar button. The find layer is
  `<svg data-find-boxes>` with one `<polygon data-find-box="mark|current">`
  per distinct quad. The rects below are against the contain-fitted painted
  picture; "delta" is polygon bbox minus the word's mapped rect in px;
  "overlap" is the clipped polygon area divided by the word's area.
  - landscape.png, search AMOUNT: 1 polygon, 0 current, 1 mark. Painted
    rect 784.0x570.2 at (256,196). Word rect 100.5x27.1 at (295.9,342.3).
    Delta left -2.1, top +2.6, right +63.4, bottom -0.9. Word centre
    inside: yes. Overlap 86.8%. The right delta is the OCR line
    "AMOUNT: 2480": the whole line is outlined. The zoom shows the
    translucent outline on "AMOUNT: 2480".
    shots/r5-01-landscape-find-AMOUNT.png, ...-zoom.png.
  - portrait.png, search RECEIPT: 1 polygon, 0 current, 1 mark. Painted
    315.0x630.0 (the 70vh bound). Word rect 88.7x24.4 at (515.7,275.9).
    Delta left 0, top +3.5, right +50.3, bottom -2.8. Centre inside: yes.
    Overlap 74.2%; the line is "RECEIPT 8821".
    shots/r5-01c-portrait-find-RECEIPT.png, ...-zoom.png.
  - landscape-rotated.jpg, search AMOUNT: natural 1100x800, upright. 1
    polygon, 0 current, 1 mark. Painted 784.0x570.2. Delta -2.1/+2.6/
    +64.1/-0.9. Centre inside: yes. Overlap 86.8%.
    shots/r5-09a-jpeg-rotated-find-AMOUNT.png, ...-zoom.png.
  - heic-rotated.heic, search QUARTER: natural 900x600, upright. 1 polygon,
    0 current, 1 mark. Painted 784.0x522.7. Word rect 178.9x43.6 at
    (475.8,325.8). Delta left -167.5 (the line starts at TURNED), top +5.2,
    right +2.1, bottom -1.7. Centre inside: yes. Overlap 80.5%.
    HEICPHOTO title: 1 polygon, delta left -3.5, top +9.6, right 0,
    bottom -6.1, centre inside, overlap 77.8%.
    shots/r5-09b-heic-rotated-find-QUARTER.png, ...-zoom.png,
    shots/r5-09c-heic-title-find-HEICPHOTO.png.

  2. Stepping. With find open, the next-hit button (or Enter) made one
  polygon current and the others marks; the image element's rect and
  window scroll were identical before and after.
  - landscape.png, 2480: 2 polygons. 0 current/2 marks initially; step 1
    made the "TOTAL 2480 JPY" quad current (the other stayed a mark);
    step 2 moved current to the "AMOUNT: 2480" quad and the TOTAL quad
    returned to the mark style. Image rect and scroll (0,0) unchanged.
    shots/r5-02-landscape-find-2480-step1.png, ...step2.png.
  - portrait.png, ITEM: 5 polygons; step 1 current on the first ITEM line,
    step 2 on the second. Image rect and scroll unchanged.
    shots/r5-per-portrait-2.png.
  - landscape-rotated.jpg, 2480: 2 polygons; current moved as on
    landscape.png; image rect and scroll unchanged.
    shots/r5-per-jpeg-2.png.
  - heic-rotated.heic, E: 7 polygons; current bbox changed from
    (308.3,255.2)-(690.7,310.1) to (308.3,331.0)-(656.7,367.6); image
    rect and scroll unchanged. shots/r5-per-heic-2.png, ...2b-current.png.

  3. Repeated word and a phrase across lines.
  - REFERENCE occurs twice on one OCR line. landscape.png: 2 answer rows,
    1 polygon (the shared quad is drawn once), 0 current. Both REFERENCE
    centres are inside it; overlap 85.7% for each. After one step the
    same single polygon was current.
    shots/r5-03a-landscape-find-REFERENCE.png, ...step1.png.
    portrait.png: 2 rows, 1 polygon, both centres inside, overlap 82.5%.
    landscape-rotated.jpg: 2 rows, 1 polygon, 88.5/88.6%.
    heic-rotated.heic: 2 rows, 1 polygon, 84.6% for both.
    shots/r5-per-portrait-3a.png, r5-per-jpeg-3a.png,
    r5-per-heic-3a.png.
  - A phrase across two OCR lines could not be typed. The find input is a
    single-line `<input type="text">`: filling it with "STARTS\nSECONDHALF"
    leaves "STARTS SECONDHALF", and that returns 見つかりません. So a
    newline needle is not reachable through the find bar. The answer
    itself supports it: GET .../find?q=STARTS%0ASECONDHALF returns 1 row
    with 2 boxes on landscape.png, portrait.png and the rotated JPEG.
    shots/r5-03b-landscape-phrase-newline.png.

  4. Resize with find open. Outlines stayed on the word; numbers are
  overlap / centre inside / painted size.
  - landscape.png AMOUNT: 1440x900 784.0x570.2, 86.8%; 900x900
    866.2x630.0, 86.8%; 1700x1000 962.5x700.0, 86.8%. 1 polygon each.
  - portrait.png PORTRAIT: 900x900 315.0x630.0, 76.4% (title quad);
    1700x1000 350.0x700.0, 76.4%. 2 polygons each.
  - landscape-rotated.jpg AMOUNT: 900x900 866.2x630.0, 86.8%; 1700x1000
    962.5x700.0, 86.8%.
  - heic-rotated.heic QUARTER: 900x900 868.0x578.7, 80.5%; 1700x1000
    900.0x600.0, 80.5%.
    shots/r5-04-*.png, r5-per-*-4-*.png.
    At 900 px wide the picture is wider than the visible pane and is
    clipped by the existing `overflow-hidden`; the layer is clipped with
    it, not drawn over the inspector: a CLERK search had a polygon bbox
    reaching x=816 while the screenshot shows the highlight cut at the
    pane edge (shots/r5-04b-landscape-CLERK-900x900.png). The visible
    word boxes were still on their words.

  5. Close, reopen, another picture. Close removed the layer (0 polygons,
  no `[data-find-boxes]`); searching again restored it; opening another
  picture left no layer and no find bar.
  - landscape.png: 1 -> 0 -> 1 -> another picture 0.
  - portrait.png: 2 -> 0 -> 2 -> landscape-rotated.jpg 0.
  - landscape-rotated.jpg: 1 -> 0 -> 1 -> heic-rotated.heic 0.
  - heic-rotated.heic: 1 -> 0 -> 1 -> landscape.png 0.
    shots/r5-05a/b/c.png, r5-per-*-1.png.

  6. Correction and restore through 画像の文字. portrait.png, search
  PORTRAIT: 2 rows and 2 polygons (the title and PORTRAITREF), 0 current;
  title quad centre inside, overlap 76.4%.
  - 修正 opened the textarea with the full machine text; PORTRAIT was
    replaced with PORTRAIX in both places and 保存 was clicked. The badge
    修正済み appeared and the section showed the corrected text.
  - Search RECEIPT (still in the text): 1 hit, 0 polygons, no layer. The
    検索 tab listed the row with the corrected snippet; the API row had no
    boxes field.
    shots/r5-06c-portrait-find-RECEIPT-corrected-no-boxes.png.
  - 元の結果に戻す opened the modal with 「修正をすべて取り消し、機械が
    出した元の結果に戻します。」 and キャンセル/戻す; 戻す removed the
    badge and restored the text.
  - Search PORTRAIT again: 2 rows, 2 polygons; the same title box numbers
    (delta -2.0/+5.5/+1.3/-4.3, overlap 76.4%) as before the correction.
    shots/r5-06a-portrait-find-PORTRAIT-before.png,
    r5-06b-portrait-text-corrected.png,
    r5-06d-portrait-find-PORTRAIT-restored.png.

  7. A picture read before this feature. The portrait's `picture_lines`
  row was deleted with sqlite3 inside the intelligence container (1 -> 0;
  the other 3 pictures still had rows). The page was reloaded and RECEIPT
  searched: 1 hit in the find bar and the row was listed in 検索, 0
  polygons and no layer; the API row had no boxes.
  shots/r5-07-portrait-no-lines-row-reloaded.png.
  No page errors. The addon log had no error or warning in this window
  (the only warning in the whole log is the pre-existing sentence
  transformers version notice at startup). The browser console showed
  only pre-existing, unrelated requests: 404 /api/files/{id}/exif, 404
  /api/addons/intelligence/files/{id}/visual_description and 502
  /api/addons/knowledge/... (the knowledge addon is not running in this
  stack); none came from find or the lines. The portrait's OCR was later
  reindexed with the ordinary reindex action for the per-picture checks;
  its lines row (1) and boxes returned.

  8. Pointer behaviour with outlines. With the AMOUNT outline visible,
  clicking at the polygon centre produced mousedown/click on the IMG,
  right-click produced contextmenu on the IMG (default not prevented, no
  custom menu), and dragging produced dragstart on the IMG. URL, scroll,
  image rect and polygon count were unchanged. Without outlines the same
  events hit the IMG and nothing moved; a native image drag starts in
  both cases. The layer is aria-hidden="true", computed pointer-events
  none, position absolute; the mark fill is the translucent highlight
  with no stroke, the current one adds the accent stroke.
  shots/r5-08a/b.png.

  9. Rotated pictures. Both display upright.
  - landscape-rotated.jpg: natural 1100x800; the AMOUNT outline contains
    the word centre, overlaps 86.8%, deltas -2.1/+2.6/+64.1/-0.9.
  - heic-rotated.heic: natural 900x600 (oriented preview); the QUARTER
    outline contains the centre, overlaps 80.5%, deltas -167.5/+5.2/
    +2.1/-1.7, the left delta because the OCR line begins at TURNED. The
    HEICPHOTO title outline overlaps 77.8% with right delta 0.
    They sit on the words; no orientation offset was seen, so there is
    nothing to report as off.

  10. Other viewers. notes.txt: 1 hit, 0 polygons, no layer. document.pdf:
  1 hit on p.1, 0 polygons, no layer (the PDF's own text mark is the
  existing one). clip.mp4: 1 utterance hit at 00:00, 0 polygons, no layer.
  The 404s for visual_description/picture-text on non-picture files are
  the same pre-existing optional-addon requests. shots/r5-10a/b/c.png.

pending: |
  None for this change. The PROJECT.md agent_cannot_verify items (iOS on a
  device, real-LAN playback, audio/video as heard/seen) do not bear on a
  picture-page outline and were not exercised.
