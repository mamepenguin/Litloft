# Design check

at: 46dc3bded28e13ddf6c386b1f97cf4f5e3aedec5
design: docs/process/reviews/feature-clips-frame/design/

Screenshots used: r5/des-design-home.png and r5/des-app-home-1440.png, r5/des-design-library.png and r5/des-app-library-1440.png (both 1440, same as the artboards). Accepted and not listed: spec "Declared differences", r1 D1 (Library menu style), D2 (heading 18px / count 14px). r1 D3 and D4 are fixed in code (Library.tsx:32, ClipShelfBlock.tsx:62) and are not repeated.

## Decisions read from the design
- Both: header = 40px tile + h1 24px/700 "Clips" + 14px muted subtitle; Target = 36px transparent muted 14px button with icon + chevron; primary = 36px red pill 14px/600 with plus (ClipsHome.dc.html:43-64)
- Both: tabs = 15px, padding 10px 16px, gap 4px, active 600 with 2px red underline, margin-top 20px (ClipsHome.dc.html:66-69)
- Home: first section margin-top 36px under the tabs (ClipsHome.dc.html:71)
- Home: sections Unread (count), Recently opened, Unverified; 48px between sections (ClipsHome.dc.html:87,103)
- Home: heading 20px/700, "すべて表示 ›" 14px muted (text glyph ›) (ClipsHome.dc.html:73-74)
- Home: card = 4:3 cover r12, dot 10px at 10,10, title 15px/600 two-line clamp, meta 12px "site · N 分 · age" with relative ages ("今日", "昨日", "2 日前", "1 週間前") and "8月31日" for older (ClipsHome.dc.html:19-22,132-148)
- Home: grid minmax(200px,1fr), gap 24px 20px (ClipsHome.dc.html:76)
- Home: Unverified rows = 72x54 thumb r8, 15px title one line, 12px "site · age", "確認済みにする" 32px high, 13px/600, grey pill; 3 rows drawn (ClipsHome.dc.html:108-117)
- Library: menus row margin-top 24px, gap 8px, filled grey pills 36px, label only plus chevron (ClipsLibrary.dc.html:72-75)
- Library: shelves margin-top 40px, heading 20px, count 15px, "すべて表示 ›", 5 fixed columns gap 20px, meta "site · N 分" (ClipsLibrary.dc.html:78-92)

## Findings
### D-1 Home and Library: the gap from the tab line to the content differs by section
- design: Home first heading 36px below the tab line (ClipsHome.dc.html:71); Library menus 24px below it (ClipsLibrary.dc.html:72)
- implementation: both use one wrapper `px-4 pb-10 pt-6` = 24px (addons/knowledge/frontend/pages/clips.tsx:257). Measured at 1440: tab line to first heading 46px vs 53px in the design on Home (first screen content sits about 7px higher); tab line to Library menus 33px vs 25px (menus sit about 8px lower). (r5/des-app-home-1440.png, r5/des-app-library-1440.png)
- visible: only by measuring

### D-2 Both: tabs are smaller and the header block is shorter
- design: tab text 15px, padding 10px 16px (ClipsHome.dc.html:67-68)
- implementation: `text-sm` (14px), `py-2` (8px) from the shared PageTabs (frontend/src/components/PageTabs.tsx:34). The tab line is at y=185 vs 203 in the design; the tab labels are visibly smaller. (r5/des-app-home-1440.png)
- visible: side by side

### D-3 Both: the Target button is smaller than the design's
- design: 36px high, transparent, muted 14px, 12px side padding (ClipsHome.dc.html:54)
- implementation: drawn as a compact control (about 28px high, smaller text) from AppHeader's Target menu (r5/des-app-home-1440.png top right; decisions.md note 13(6) measures 28px). Code in AppHeader not read.
- visible: side by side

### D-4 Home: "Mark as verified" button is bigger than the design's
- design: height 32px, padding 0 14px, 13px/600 (ClipsHome.dc.html:116)
- implementation: shared `Button variant="secondary"`, about 36px high, 14px regular weight (addons/knowledge/frontend/clipsapp/ClipRow.tsx:48; r5/des-app-home-1440.png Unverified rows)
- visible: side by side

### D-5 Home and Library: "See all" has a chevron icon instead of the "›" glyph
- design: text "すべて表示 ›" 14px muted, glyph attached to the text (ClipsHome.dc.html:74)
- implementation: label plus a 16px lucide ChevronRight, `gap-0.5` (addons/knowledge/frontend/clipsapp/ClipShelfBlock.tsx:77-78; r5/des-app-home-1440.png "See all >")
- visible: side by side

### D-6 Home: the age in the meta line is a clock time or a date, never relative
- design: "今日", "昨日", "2 日前", "1 週間前", "1 か月前", then "8月31日" (ClipsHome.dc.html:132-148)
- implementation: today shows the clock time ("21:59"); other days a short date; no relative wording (addons/knowledge/frontend/noteDates.ts:42-53; r5/des-app-home-1440.png meta lines "example.com · 1 min · 21:59")
- visible: at a glance

### D-7 Home and Library: the card title now reserves two lines; not shown in R-5
- design: the title is a two-line clamp with no reserved height; a one-line card is shorter and the row height is the tallest card (ClipsHome.dc.html:21; Library artboard row 1 first card vs the rest)
- implementation: `min-h-[2.9em]` on every card title and skeleton (ClipCard.tsx:102, ClipShelfBlock.tsx:29), added in 15d30c7 after the screenshots. R-5 shows one-line titles at 15px with the meta directly below (r5/des-app-library-1440.png). The new look (blank line under one-line titles, equal card heights) is not shown in R-5, cannot be checked.
- visible: not shown in R-5, cannot be checked

### D-8 Home: Unverified shows more rows than the design
- design: three rows on the artboard (ClipsHome.dc.html:145-149); the first screen ends after Unverified
- implementation: five or more rows draw (UNVERIFIED_ROWS) and the list runs below the first screen (r5/des-app-home-1440.png). The artboard has only three clips in the list, so the intended row count cannot be read from it.
- visible: side by side

TOTAL: 8 findings
