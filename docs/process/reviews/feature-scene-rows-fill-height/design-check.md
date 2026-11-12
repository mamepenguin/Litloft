# Design check

at: 2d7882d05f3f6d6da1b7a9106513d6e4d53576ba
design: docs/process/reviews/feature-scene-rows-fill-height/design/

## Decisions read from the design
- Panel: region order = ruler (order 0), tile grid (2), card (4 by default), action row (5) (Panel.dc.html:34,58,73,82)
- Panel: header 40px with "Scenes" 13px/600 and a close button (Panel.dc.html:25-30)
- Panel: body padding 8px 14px 14px, gap 14px (Panel.dc.html:33)
- Panel: ruler 44px tall, labels row 14px / 11px muted (Panel.dc.html:35,49)
- Panel: tile grid columns = max(3, floor((w+8)/120)), gap 12px 8px, 16:9 thumbnail radius 8, 12px centred label (Panel.dc.html:58,60-65,157)
- Panel: card background #2f191b (lighter than the #231216 panel), radius 12, padding 10x12, min-height 122, time 12px muted, label 14px, text 12px muted clamp 2 (Panel.dc.html:17,73-79)
- Panel: action row min-height 36, LEFT = ghost Play/Pause button with icon and "m:ss / total" time, RIGHT = ghost "Regenerate scenes" button (Panel.dc.html:82-93)
- Main: one panel full width below player and pill row; Transcript pill toggles a second panel (Main.dc.html:23-46)
- Two: 2 panels of (980-12)/2 wide at 1400 high = 3 columns x 3 rows (Two.dc.html:20-22, canvas.json title)
- Short: 900 high, fewer than 3 rows fit, so the panel body scrolls (canvas.json)
- Tablet: Scenes tab in the inspector, 768x1024 (canvas.json)
- Phone: sheet with grabber, tab strip (Info / Transcript / Scenes / Detailed summary), no panel header, 358px wide; half = 3 rows scrolling, full = 3 rows (4 from 1000px high) (Phone.dc.html:20-29, canvas.json)

## Findings
### D-1 Panel action row: left Play/time ghost button is not drawn
- design: action row has a left ghost button (play icon + "0:00 / 18:44") and a right "Regenerate scenes" ghost button (Panel.dc.html:82-93)
- implementation: action row shows only "Regenerate scenes" at the right; the left side is empty (or holds the stale note) (r5/main-1024x1400-one-panel-card.png, r5/phone-390x1000-sheet-full.png; ScenesSectionPresenter.tsx:376-399, left is a text span for error/note, no play button)
- visible: at a glance

### D-2 Panel card: background does not stand out from the panel on the workbench
- design: card is #2f191b on a #231216 panel, so the rounded card is visible as a distinct surface (Panel.dc.html:17,23)
- implementation: card uses bg-bg-elevated (ScenesSectionPresenter.tsx:583); inside the workbench panel in the screenshots no card edge or fill is visible, only the text "0:00 / Opening shot of the harbour" (r5/main-1024x1400-one-panel-card.png, r5/two-1024x1400-two-panels.png). On the phone sheet and tablet the card is visible (r5/phone-390x1000-sheet-full.png, r5/tablet-768x1024-scenes-tab.png). The fixture uses a light theme, so the tone relation may differ from the dark design.
- visible: at a glance

### D-3 Visual states drawn only in the fixture's light theme
- design: dark palette (Main.dc.html:17, Panel.dc.html:23)
- implementation: all R-5 screenshots are the light theme; the design's dark contrast cannot be compared (all r5/*.png)
- visible: not checkable from R-5

### D-4 Short (900 high) and Phone half snap: bottom of the action row not shown
- design: Short and Phone half show the scrolling body; the action row is last (Panel.dc.html:82)
- implementation: r5/short-1440x900-one-panel.png is cut off mid-row 3 and r5/short-1440x900-one-panel-scrolled.png was not opened for this check; the tablet shot (r5/tablet-768x1024-scenes-tab.png) ends with the card cut off at the bottom. The action row is not seen in these shots, so its look in the scrolled state is not confirmed from the screenshots I read.
- visible: not checkable from the screenshots read

TOTAL: 4 findings
