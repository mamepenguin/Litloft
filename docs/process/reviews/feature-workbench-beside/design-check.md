# Design check

at: f696dba72f006b5072c7d3f97dec39529706d589
design: docs/process/reviews/feature-workbench-beside/design/

## Decisions read from the design
- Main (1440x900, inspector 384 open, sidebar collapsed): W = 1440-384-32 = 1024, beside when W >= 976 (Main.dc.html:172)
- Main: frame width = 60% of (W-16) = 604.8, 16:9 (Main.dc.html:178-179); frame radius 12px, black (Main.dc.html:237)
- Main: left column = frame, then a row under it with 16px gap, row width = frame width (Main.dc.html:236, 59)
- Main: row = panel chips (32px high, pill, selected = red tint + red border), spacer, beside icon button 32px round (pressed = tinted), then "引用" pill button 32px high (Main.dc.html:59-73, 193, 220)
- Main: panels stacked in a column to the right of the frame, from content top to bottom, gap 12px, width W-16-frameW (Main.dc.html:238)
- Main: panel = rounded 12px card, 40px header with 13px/600 title and close X (Main.dc.html:79-83)
- Main/Narrow: when not beside, "Enlarge panels" icon button shown after the beside button (Main.dc.html:233)
- One: same layout, one panel filling the right column (One.dc.html:17)
- Closed (inspector closed): W=1408, frame 60% = 835.2 (Closed.dc.html:17)
- Below (beside off, inspector closed): frame capped to 50% of H (398 high, 708 wide), panels side by side under the row, beside + enlarge icons both shown (Main.dc.html:181-182, 238, 229-233)
- Narrow (1280, inspector open): W=864 < 976, no beside button, Enlarge shown, panels row under the frame since W >= 656 (Main.dc.html:172, 238)

All five artboards have a matching R-5 shot at the artboard's width. Main's second panel is Note in the design and Scenes in the shot (sample data, not counted).

## Findings
### D-1 Main/One/Closed/Below/Narrow: the "引用" (quote playback position) pill button is missing from the control row
- design: row ends with a 32px-high pill "引用" with a quote icon, to the right of the beside / enlarge icons (Main.dc.html:72)
- implementation: the row has the panel chips and the icon buttons only; nothing after them (r5/Main-1440x900.png, r5/One-1440x900.png, r5/Closed-1440x900.png, r5/Below-1440x900.png, r5/Narrow-1280x900.png). A quote icon exists only in the header and inspector.
- visible: at a glance

### D-2 Below: frame is taller than the design's 50%-of-height cap, and the state is not shown at the design's inspector setting
- design: inspector closed, beside off: frame 708x398 (50% of H=796) (Main.dc.html:181-182; Below.dc.html:17)
- implementation: r5/Below-1440x900.png is taken with the inspector open (W=1024): frame about 750x422, row top about 509. No R-5 shot of Below with the inspector closed, so the artboard's exact state cannot be checked. At W=1024 the design formula also gives 398 high, so the frame is about 24px taller than drawn.
- visible: only by measuring

### D-3 Main/One/Closed: player frame corners look square, design draws 12px radius
- design: border-radius 12px on the frame (Main.dc.html:237)
- implementation: video frame corners look square in r5/Main-1440x900.png and r5/Closed-1440x900.png, while the panel cards are rounded. Not confirmed in code.
- visible: side by side

## Human decisions (2026-11-17)

- D-1 accepted: the quote pill is a `file-preview-actions` entry no addon publishes today; the mock copied it from the earlier workbench mock.
- D-2 accepted: the mock draws two header rows; the app has one, so 50% of the real visible height is 422px. The normal layout is unchanged by this change (I5).
- D-3 accepted: the player frame's corners are the existing player style, not changed by this spec.

TOTAL: 3 findings
