# Design check

at: e4c732356f2244cce9b34636da12fd7d9cbc1cd0
design: docs/process/reviews/feature-watched-ranges-display/design/

## Decisions read from the design
- Main (880x495): seek block inset left/right 16px, bottom 52px, height 40 (Main.dc.html:18)
- Main: band 3px tall at top 7px of the block, full width of the block, pieces radius 1px (Main.dc.html:19-21)
- Main: band levels L1/L2/L3 = white at 0.35/0.6/0.9 (Main.dc.html:55)
- Main: seek track 4px, white/25, buffered white/40, played fill + 12px knob; red #d63031 light, white dark (Main.dc.html:25-29, 61)
- Main: control row = pause, volume, time, spacer, settings, fullscreen; 44px buttons, 20px icons, time 13px (Main.dc.html:33-48)
- Touch (390x220): half-disc feedback on right 38%, white/15, icon 28px + label "20秒" (Touch.dc.html:18-21)
- Touch: bottom-only chrome = time (12px) + fullscreen button only; no transport (Touch.dc.html:22-28)
- Touch: seek block inset left/right 12px, band above track (Touch.dc.html:29-34)
- Cards (1120): VideoCard 16:9, radius 16, duration badge bottom-right, track 4px black/50, white fill pieces, tick 3x10 white with 1px black/50 outline (Cards.dc.html:19-28)
- Cards: VideoCard title 16/22 weight 500, byline 14px muted under it (Cards.dc.html:30-31)
- Cards: FileCard radius 12, shadow, track 3px white/20, accent fill (#d63031 / #e85d5e dark), same tick (Cards.dc.html:37-47, 79-80)
- Cards: FileCard text block padding 12, title 14px/600, length 12px under title, no badge on the thumbnail (Cards.dc.html:48-51)

## Findings
### D-1 Touch: seek bar runs edge to edge, not inset 12px
- design: left 12px, right 12px (Touch.dc.html:29)
- implementation: seek track and band span the whole frame width, from x=0 to x=390 (touch-390-doubletap-bottom-only-light.png, -dark.png)
- visible: at a glance

### D-2 Main: seek bar inset is 8px, design is 16px
- design: seek block left 16px, right 16px (Main.dc.html:18)
- implementation: track and band start about 8px from the frame edge and end 8px from the right edge (main-880-pointer-hover-light.png, -dark.png)
- visible: side by side

### D-3 Touch: skip feedback label and disc
- design: label "20秒", disc fills the right 38% with the icon centred in it (Touch.dc.html:18-21)
- implementation: label "10s", the icon sits at about 75% of the width and the disc edge is a large arc reaching the top (touch-390-doubletap-bottom-only-light.png)
- visible: side by side (label text may be sample data, the position and disc size are not)

### D-4 Main: control row has extra controls
- design: pause, volume, time, settings, fullscreen only (Main.dc.html:33-48)
- implementation: play, back 10, forward 10, time, mute plus a volume slider, settings, fullscreen (main-880-pointer-hover-light.png)
- visible: at a glance

### D-5 FileCard: duration badge on the thumbnail and a date line, design has neither
- design: no badge on the thumbnail; length shown as the 12px line under the title (Cards.dc.html:20 is VideoCard only; FileCard 38-51)
- implementation: FileCard draws a duration badge bottom-right on the thumbnail and a date line (2024/07/10, 10/31) under the title, no length line (cards-filecard-home-1120-light.png, cards-filecard-home-390-dark.png)
- visible: at a glance

### D-6 VideoCard: no byline line
- design: byline 14px muted under the title (Cards.dc.html:31)
- implementation: Continue shelf cards show title only (cards-videocard-videoapp-1120-light.png, -390-light.png); the Regular sources shelf shows a byline but the cards that carry the new track do not
- visible: side by side (may be existing behavior of the shelf rather than this change)

### D-7 Not shown in R-5
- Main design in dark with the red/white indicator is shown (main-880 dark); Cards dark at 1120 exist but only light 1120 and dark 390 were opened for this check; the 4-column row at 1120 is not shown at all (screenshots use the app's 3 and 4 column layouts, not the board's 4 columns for VideoCard). VideoCard at 4 columns and 238px card width cannot be checked.
- visible: cannot be checked

TOTAL: 7 findings
