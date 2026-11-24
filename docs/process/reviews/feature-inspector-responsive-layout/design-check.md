# Design check

at: 4efad1144a2395eb47c639fb526faa613e3968f3
design: docs/process/reviews/feature-inspector-responsive-layout/design/

Sample data differs (design: ホームサーバーの構成を見直す, 24:18, avatar "S"; app: a Pokemon video, 17:46, a person icon). Title wrapping to two lines, the extra quote icon in the top bar, the thumbnail image, and the avatar are not counted as differences.

## Decisions read from the design
- Main (1180x820): top bar 48px, breadcrumb row 44px (Main.dc.html:49,58); breadcrumb right side = find, transcript-below toggle (pbottom), inspector toggle (pright, pressed bg #2f191b) (:64-66)
- Main: tree collapsed, video column flex:1 with 16px padding, frame 16:9 radius 12 at x=16 (:70-72); inspector aside 384px, border-left, bg #231216, full row height (:91)
- Main: tab strip is first row of aside: Info / Related / Transcript / Ask, 13px, selected = bright + 2px accent underline (:92-97, css :17-18)
- Main: header block padding 16/16/4: h1 18px/700 (:99); duration 12px muted under it (:100); chips row Like/Favorites/Verified (:101-105); second row AI + more (:106-109); "+ Add tag" 12px (:110)
- Main: header and the sections are separated by a 1px rule with 8px margin (:112); rows "Visual index · 24 scenes" and "Comments", 13px, film/msg icon left, down chevron right (:113-114)
- MiniLandscape (1133x650, Transcript): same beside layout, aside 384px, Transcript tab selected (MiniLandscape.dc.html:92-97); sub-row Text chunks / Words segments left, "Clean up with AI" right (:99-104); cue list full aside width, time then text (:105-115)
- MiniLandscapeInfo (1133x650, Info): same as Main at 1133 (not read in full; same family as Main)
- Portrait (820x1180): stacked; video full width with 16px padding (Portrait.dc.html:68); inspector section below with tab strip (12px padding), seg row, cue list to full width minus 20px padding (:89-114); only find + one toggle (pbottom, pressed) in breadcrumb row (:64-65)
- SmallWindow (900x700): stacked; frame fixed 536px wide, centered (SmallWindow.dc.html:67); controls bar: seek bar above, play/back/fwd/time left, vol/gear/max right (:69-80); inspector Info has the header on ONE row: h1 16px + duration left, Like/Favorites/AI/more right (:94-104); "+ Add tag" under it (:105); rows Visual index / Comments with 20px padding (:106-107)
- MiniPortrait (744x1133): phone sheet form: 48px back + title + find + menu row (MiniPortrait.dc.html:43-48); video full-bleed 16:9 (:50-66); sheet radius 16 with grabber, tabs, then Transcript content (:68-92)
- PhoneInfo (390x844): 48px row back / title / find / menu (PhoneInfo.dc.html:48-53); full-bleed video, controls (:55-71); sheet with grabber, tabs, Info: h1 18px, duration 13px, chip row wrapping Like Favorites Verified AI more, "+ Add tag" 13px (:82-92); rule then Visual index / Comments rows 15px (:94-97)

## Findings
### D-1 Main / MiniLandscapeInfo / SmallWindow / PhoneInfo: no rule between the header block and the sections
- design: 1px rule (rgba(255,255,255,0.08)) with 8px margin above, 4px padding, sections 16px apart (Main.dc.html:112; PhoneInfo.dc.html:94)
- implementation: "Scenes" sits about 8px under "+ Add tag" with no rule; Scenes and Comments rows have no padding rhythm like the design (r5/1180x820-video-info-dark-artboard-Main.png; r5/390x844-video-sheet-info-dark-artboard-PhoneInfo.png)
- visible: at a glance

### D-2 Main / MiniLandscapeInfo / SmallWindow / PhoneInfo: section row labelled "Scenes", design says "Visual index · 24 scenes"; Comments row has a leading chevron the design lacks
- design: "Visual index · 24 scenes" label, only a right-hand down chevron on both rows (Main.dc.html:113-114)
- implementation: "Scenes" with a right chevron; "Comments" has an extra left chevron and the two rows are indented differently (r5/1180x820-video-info-dark-artboard-Main.png)
- visible: side by side

### D-3 SmallWindow (900x700): Info header is not one row
- design: title + duration left, Like / Favorites / AI / more right on one row; "+ Add tag" below (SmallWindow.dc.html:94-105)
- implementation: title at about 18px on its own line, duration on its own line, then Like/Favorites/Verified/AI/quote/more row, then "+ Add tag"; the narrow-pane layout stretched to 900px, about 150px taller than the design (r5/900x700-video-info-dark-artboard-SmallWindow.png). Same at 820x1180 stacked.
- visible: at a glance

### D-4 SmallWindow (900x700): player frame smaller than drawn
- design: frame 536px wide, about 300px tall (SmallWindow.dc.html:67)
- implementation: frame about 473x266 (r5/900x700-video-info-dark-artboard-SmallWindow.png; decisions.md). The frame is bounded by half the row height, so the inspector has more room than the design's.
- visible: side by side

### D-5 SmallWindow / PhoneInfo: controls bar order and contents differ from the drawn bar
- design: seek bar above the buttons; buttons play/back/fwd/time left, volume/gear/fullscreen right (SmallWindow.dc.html:69-80; PhoneInfo.dc.html:57-68)
- implementation: at 900px the controls show only play, time and volume with the seek bar below them at the bottom edge; back/forward/settings/fullscreen are not visible. At 390px the same order (seek bar under the buttons) (r5/900x700-video-info-dark-artboard-SmallWindow.png; r5/390x844-video-sheet-info-dark-artboard-PhoneInfo.png). At 1180, 1133, 820 and 744 the order and contents match.
- visible: at a glance

### D-6 MiniLandscape (1133x650 Transcript) and Portrait/MiniPortrait: transcript text does not use the full pane width
- design: cue text fills the pane (aside 384px; text from about x=70 to the right padding) (MiniLandscape.dc.html:105-115; Portrait.dc.html:102-113)
- implementation: at 1133 beside, text is a narrow column about 195px wide inside a 383px pane with about 100px empty on the right (r5/1133x650-video-transcript-dark-artboard-MiniLandscape.png); at 820 stacked and 744 sheet the text wraps at about 630-700px of 744-820, leaving a gap on the right (r5/820x1180-video-transcript-dark-artboard-Portrait.png; r5/744x1133-video-sheet-transcript-tab-dark.png)
- visible: at a glance

### D-7 MiniPortrait / PhoneInfo (sheet form): top chrome is two rows instead of one
- design: one 48px row: back arrow, file name, find, menu; video starts at y=48 (MiniPortrait.dc.html:43-48; PhoneInfo.dc.html:48-53)
- implementation: app top bar (menu, search, new note, quote, person) plus a second row ("< アニメ", find, inspector button); video starts at y=104, so about 56px less height for the video and sheet. File name is not in the title row (r5/744x1133-video-sheet-transcript-tab-dark.png; r5/390x844-video-sheet-info-dark-artboard-PhoneInfo.png)
- visible: at a glance

### D-8 PhoneInfo: chip row wraps differently
- design: Like Favorites Verified AI more as one wrapping row with 2px gaps, "+ Add tag" 13px (PhoneInfo.dc.html:85-92)
- implementation: Like / Favorites / Verified on one line, AI / quote / more on the next; chips look dimmed (Like and Favorites in low-contrast grey); extra quote icon (r5/390x844-video-sheet-info-dark-artboard-PhoneInfo.png)
- visible: side by side

### D-9 Main: Like / Favorites chips are visibly dimmer than the design
- design: chips #c4a0a4 muted but readable, Verified same colour (Main.dc.html:19)
- implementation: Like and Favorites render noticeably fainter than Verified and AI in all Info shots (r5/1180x820-video-info-dark-artboard-Main.png). May be a disabled/unset state of the sample file.
- visible: side by side

### D-10 Main / MiniLandscapeInfo: header block vertical rhythm
- design: padding 16px top, title 18px, duration 2px below, chips 8px below (Main.dc.html:98-110); "+ Add tag" at 12px sits directly under the AI row
- implementation: about 30px of space above the title (tab strip bottom 138, title top about 170), larger gap between duration and chips, "+ Add tag" smaller than design and about 20px below the AI row (r5/1180x820-video-info-dark-artboard-Main.png)
- visible: side by side

### D-11 Main / MiniLandscape: transcript-below toggle shown in beside form
- design: breadcrumb right side has find, pbottom toggle, pright inspector toggle in beside form (Main.dc.html:64-66). Portrait and SmallWindow have find + one pressed pbottom (Portrait.dc.html:64-65)
- implementation: matches (find, pbottom, pright) at 1180 and 1133; at 900 stacked shows find and a pbottom icon, not the pressed (highlighted) state the design draws (r5/900x700-video-info-dark-artboard-SmallWindow.png; r5/820x1180-video-transcript-dark-artboard-Portrait.png). Pressed-state background (#2f191b) is not visible on the inspector toggle in the beside shots either.
- visible: side by side

TOTAL: 11 findings
