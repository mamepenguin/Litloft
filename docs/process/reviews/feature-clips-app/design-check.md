# Design check

at: 6c332337acb20739120c407316b29e3c56450857
design: docs/process/reviews/feature-clips-app/design/

## Decisions read from the design
- Main (Clips home, 1280): content column max-width 760px, main padding 40px 48px 0 (Main.dc.html:25-26)
- Main: header row gap 14px; icon tile 44x44 radius 12 bg #f6f6f3, icon 22px (Main.dc.html:28-29)
- Main: h1 24px/700; scope line 13px muted (Main.dc.html:33-34)
- Main: primary pill 40px high, padding 0 18px, bg #d63031, 14px/600, plus icon 16 + label (Main.dc.html:36)
- Main: tabs row gap 24px, hairline under row, 14px; active tab = 2px #211922 underline, 600, role=tab/aria-selected (Main.dc.html:41-43)
- Main: shelves margin-top 40px; h2 18px/700 (Main.dc.html:47-48); no count, no see-all
- Main: shelf order Unread, Recently opened, Unverified, 3/2/2 sample rows (Main.dc.html:79-93)
- Main: row = padding 12, radius 12, no separators, tile 36 radius 12 with document icon (no folder icon), title 15/600, excerpt 13 muted, ellipsis (Main.dc.html:50-57)
- Main: row right column stacks date over folder, right-aligned, 12px muted, folder max 160px (Main.dc.html:58-61)
- Phone (390): app bar 52px with menu button and "Litloft" label (Phone.dc.html:17-22)
- Phone: header tile 40, h1 24/700, scope, round 44x44 red icon-only plus button (Phone.dc.html:25-34)
- Phone: tabs margin-top 20, shelves margin-top 32, h2 margin-bottom 4 (Phone.dc.html:36-42)
- Phone: row padding 12px 4px, tile 36, meta line `folder · when` 12px muted under excerpt, no separators (Phone.dc.html:44-50)
- All (1280): same header and tabs; groups margin-top 28; group label 13px/600 muted (All.dc.html:38-39)
- All: group labels 今日 / 今週 / 先月 (All.dc.html:64-72) (sample; spec marks as illustrative)
- All: rows same as Main, right column date over folder (All.dc.html:41-50)
- All: "さらに表示" pill, margin 24px auto 0, height 40, padding 0 20, bg #e5e5e0, 14/600 (All.dc.html:55)
- Empty (1280): header kept; empty block margin-top 72, 56px tile radius 16, icon #91918c, bold 15/600 line, muted 13px line max-width 420, no tabs (Empty.dc.html:33-38)
- NotesAll (1280): header with 44px icon tile + "ノート" + scope, no back link, no primary button (NotesAll.dc.html:19-27)
- NotesAll: main is full-width (no 760 cap), left rail 200px then list, gap 32 (NotesAll.dc.html:18,28-29)
- NotesAll: toolbar order: search (flex, 40px, radius 16), タグ pill, 更新日 pill, クリップを含める pill; all 40px high (NotesAll.dc.html:35-45)
- NotesAll: toggle off = 1px outline white bg; on = filled #211922 white text; clip icon 16 (NotesAll.dc.html:80-82)
- NotesAll: no "N 件" line or group label between toolbar and rows; row right column is a single date (NotesAll.dc.html:47-56)

## Findings
### D-1 Main/All/Empty: content column is wider than the design's
- design: max-width 760px (Main.dc.html:26, All.dc.html:19, Empty.dc.html:19)
- implementation: single 960px column (rows span x 296-1224 at 1280, about 928px wide), per decisions.md D1 `max-w-list-row`; title and excerpt rows are much longer than drawn (s10-1280-01-clips-final.png, s3-1280-01-all-page1.png). The spec says "Notes list width" (spec:401) but does not attribute the 760 to 960 change to a human decision.
- visible: at a glance

### D-2 Main/All: row right column differs
- design: date stacked above folder, right-aligned, narrow column (Main.dc.html:58-61)
- implementation: folder (with a folder icon) and date as two columns on one line, spread far apart (folder near x 960, date at right edge); folder icon not in design (s10-1280-01-clips-final.png, s3-1280-01-all-page1.png). Recorded in decisions.md difference 2; spec D4 says only "right-aligned on the right".
- visible: at a glance

### D-3 Main/All: rows carry separators and a different rhythm
- design: no separators between rows; rows are padding-12 radius-12 blocks (Main.dc.html:50)
- implementation: hairline between every row, rows about 69px tall; hover/focus row is a grey rounded block (s10-1280-01-clips-final.png, s3-1280-03-all-bottom.png)
- visible: at a glance

### D-4 Main: shelf size and first-screen density
- design: shelves of 3 / 2 / 2 sample rows, shelf gap 40px (Main.dc.html:47,79-93)
- implementation: Unread shows up to 12 rows (spec cap); in s10-1280-01-clips-final.png the first screen shows only the Unread heading and 11 rows, with Recently opened and Unverified below the fold. Shelf gap above 未読 is about 60px from the tab hairline (design 40).
- visible: side by side

### D-5 Main/All: active tab look and semantics
- design: active tab has a 2px dark #211922 underline, weight 600; role=tablist/tab, aria-selected (Main.dc.html:41-43)
- implementation: red accent underline; plain links without role/aria-selected (decisions.md difference 1; s10-1280-01-clips-final.png)
- visible: at a glance

### D-6 Main/All/Empty: header tile and pill sizes
- design: tile 44px, pill 40px high (Main.dc.html:29,36)
- implementation: tile 40px, pill 36px (decisions.md difference 3; s10-1280-01-clips-final.png: tile about 40, pill 36)
- visible: only by measuring

### D-7 Main: header area proportions
- design: title block shows h1 then scope line, tabs directly below with 20px gap (Main.dc.html:27-45)
- implementation: gap between header row and tab row is larger (scope line at y 130, tabs at y 177), and the pill sits top-aligned in the row instead of centred against the tile + title block (pill centre y 102 vs tile centre y 104; fine) (s10-1280-01-clips-final.png)
- visible: only by measuring

### D-8 All: group labels differ
- design: 今日 / 今週 / 先月 (All.dc.html:64-72)
- implementation: 今日 / 過去 7 日 / 過去 30 日 (decisions.md difference 4; s3-1280-03-all-bottom.png). Spec marks labels as examples ("...").
- visible: side by side

### D-9 All: first group label placement and weight
- design: group label 13px/600 muted, margin-top 28 under the tabs (All.dc.html:38-39)
- implementation: label looks about 11-12px bold, 40px under the tab hairline and directly against the first row (s3-1280-01-all-page1.png)
- visible: only by measuring

### D-10 All: "さらに表示" at page 1 not shown in R-5
- design: pill 40px high, padding 0 20, bg #e5e5e0, 24px under list (All.dc.html:55)
- implementation: no screenshot shows the button; s3-1280-01 and s3-1280-02 end before it and s3-1280-03 is after it has gone. decisions.md gives 102x36 (design: about 40px high), measured only. Cannot be checked visually.
- visible: not shown in R-5, cannot be checked

### D-11 Phone: app bar differs
- design: 52px bar with menu button and "Litloft" label (Phone.dc.html:17-22)
- implementation: core app bar with menu, search, quick note, quote, avatar icons and no label (s2-390-01-clips.png). Decisions.md difference 6; spec says sidebar is illustrative, not the app bar.
- visible: at a glance

### D-12 Phone: header and rows proportions
- design: tile 40, h1 24, 44px round plus button, rows padding 12px 4px with no separators (Phone.dc.html:25-50)
- implementation: matches in structure (tile, title, round red plus, tabs, meta line `folder · date` with folder icon), but rows have hairline separators and a folder icon before the meta; gap above shelf heading is larger than 32 (about 48 at 390 scale) (s2-390-01-clips.png). Shot is at 2x (780px wide image).
- visible: side by side

### D-13 Empty: matches structurally, spacing larger-looking
- design: block margin-top 72, tile 56 radius 16, 15/600 line, 13px muted copy max-width 420 (Empty.dc.html:33-38)
- implementation: tile 56, bold line, two-line muted copy centred; block starts about 72px under header (y 212 vs header bottom 140). No difference seen beyond the D-1 column width and D-6 sizes (s8-1280-01-empty-landing.png). Listed because the sample copy wraps at the same width as the design.
- visible: only by measuring

### D-14 NotesAll: page header differs
- design: icon tile 44 + "ノート" title + scope, no back link, no primary button (NotesAll.dc.html:19-27)
- implementation: "‹ ノート" back link above "すべてのノート" title, no icon tile, red "新規ノート" button at right (s5c-1280-02-on.png, s5c-1280-01-off.png). Not in decisions.md difference list; spec D7 covers only the toggle.
- visible: at a glance

### D-15 NotesAll: toolbar lacks タグ at 1280
- design: search, タグ, 更新日, クリップを含める (NotesAll.dc.html:35-45)
- implementation: search, 更新日, toggle; タグ collapsed to zero width, tags in rail (decisions.md difference 5; s5c-1280-02-on.png). Spec D7 states "after the search field, Tag and Sort" without attributing the omission to a human.
- visible: at a glance

### D-16 NotesAll: toolbar control height and shape
- design: search 40px radius 16; pills 40px (NotesAll.dc.html:36-45)
- implementation: search about 40px but pill-rounded (radius about 20); toggle pill about 40px with border, filled dark when on, matches (s5c-1280-02-on.png).
- visible: side by side

### D-17 NotesAll: extra "N 件" line and group label above rows
- design: rows follow the toolbar directly (NotesAll.dc.html:47-48)
- implementation: "72 件" line and a "今日" group label sit between toolbar and rows; rows have separators (s5c-1280-02-on.png)
- visible: side by side

### D-18 NotesAll: layout widths
- design: main full-width with 48px padding, rail 200px, gap 32 (NotesAll.dc.html:18,28-29)
- implementation: content from x 80 to 1200 (page is the existing Notes layout, sidebar closed, no 240px sidebar), rail about 248px wide, rows end at 1188 (s5c-1280-02-on.png). The rail also shows the folder icon on each entry and a different "フォルダ" header; design rail is plain text rows with counts.
- visible: side by side

### D-19 NotesAll (390): not drawn in the design
- design: no phone artboard for All notes
- implementation: 390 toolbar wraps to three lines with the toggle alone on the last line (s5f-390-01-all-notes-toolbar.png). Nothing to compare against.
- visible: not shown in design

TOTAL: 19 findings
