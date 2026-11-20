# Design check

at: e42f2dbe2c80b5f0d19a27d94eba2041b6b81b57
design: docs/process/reviews/feature-peak-jump/design/

## Decisions read from the design
- Main (880x495): jump button sits after 10秒進む, before the time display, 44x44, round, bg rgba(255,255,255,0.15), target-ring icon 20px, title 「よく観た所へ (P)」 (Main.dc.html:44-46)
- Main: label 「よく観た所 1 / 3」, role=status, top 16px, centred, padding 6px 12px, radius 16, bg rgba(0,0,0,0.7), 13px (Main.dc.html:17)
- Main: span band 3px high above the seek bar (bar top 14px inside a 40px box, band top 7px), segments tinted by level (0.35 / 0.6 / 0.9 white), radius 1px (Main.dc.html:19-24, 62-65)
- Main: seek bar 4px track, 12px thumb, played fill red #d63031 (Main.dc.html:25-31)
- Main: control row order pause, back 10, forward 10, jump, time, spacer, settings, fullscreen (Main.dc.html:34-55)
- Touch (390x220): label top 12px, 12px, nowrap (Touch.dc.html:17)
- Touch: bottom row = time left, spacer, jump button (44px round, bg 0.15), fullscreen (Touch.dc.html:19-27)
- Touch: band 3px just above the seek bar at the very bottom, seek bar full width (Touch.dc.html:29-43)

## Findings
### D-1 Main and Touch: jump button has no resting background and is not round
- design: round 44px button with a permanent rgba(255,255,255,0.15) fill (Main.dc.html:44, Touch.dc.html:22)
- implementation: no fill at rest (visible only on hover, as in p03 where the mouse is over it); ControlButton `bar` variant is `rounded-2xl hover:bg-white/15`. On touch there is no fill at all after the press (shots/p03-after-press1.png, shots/p04-after-2s.png, shots/t02-after-press-from-whole.png; ControlButton.tsx:21)
- visible: side by side

### D-2 Touch: label sits 4px lower than designed
- design: top 12px, 12px type (Touch.dc.html:17)
- implementation: label drawn at top ~16px (GestureOverlay container `top-4`) (shots/t02-after-press-from-whole.png, about 48px at 3x; GestureOverlay.tsx:74)
- visible: only by measuring

### D-3 Main: played-spot band shown in R-5 is not comparable to the design's wider segments
- design: five wide spans with three brightness levels, one clearly brighter (Main.dc.html:63)
- implementation: R-5 data produced short ticks, so the level tints and span widths cannot be checked against the design in any shot (shots/p10-frame880-after-press.png)
- visible: cannot be checked in R-5 (level 1/2/3 brightness difference not shown)

TOTAL: 3 findings

## Accepted by the human (2026-11-20, "はい")
- D-1: accepted. Spec D1 sets the button transparent at rest and filled on hover like the other row buttons; the artboards draw it hovered.
- D-2: accepted. The label shares the speed pill's top offset.
- D-3: accepted. The band is SPEC-CORE-140's and is unchanged here.
- R-5 deviations, accepted and left as they are: a jump on a YouTube embed that has never played starts playback (the embed's seek does this for +10 too); on a file over 10 hours at a 524px frame the time display wraps to two lines (no control clipped).
