# Design check

at: ab876696d00e4b3cb77d01169355fff91d44aaaf
design: docs/process/reviews/feature-notes-app/design/

Screenshots used: r5-shots/final-3bc9a48/ (library 1440/390), r5-shots/final/ (home 1440, pane editing), r5-shots/final-45fccb2/ (history), r5-shots/home-continue-writing.png, r5-shots/pane-connections.png, r5-shots/write-editing.png, r5-shots/rerun/editing-1440-full.png. Clips artboards ignored.

## Decisions read from the design
- Main (1440): main column `max-width:1120px; padding:28px 40px 64px` (Main.dc.html:40); header icon tile 40px/radius 12, h1 24px/700, scope line 14px muted (:44-50); Target (ghost, 36px, "すべてのノート") then red "新しいノート" (36px pill) right (:52-62); tabs margin-top 20, padding 10x16, 15px, active 600 with 2px red underline (:65-68)
- Main: "続きを書く" h2 20px/700, 16px below; grid `repeat(auto-fill,minmax(220px,1fr))` gap 20; card radius 16, outline hairline; 132px paper area on #f6f6f3 with padding 16 16 0, white sheet radius 8 8 0 0, text 10.5px/1.75 muted; title 14px/600, meta 12px muted, padding 14 (:70-87)
- Main: section gap 48; "出典つきメモ" rows: 96x54 thumb radius 8 with badge bottom-right, title 15/600, excerpt 13 muted one line, source 12, time 12 at right; "すべて表示 ›" at right (:89-111)
- Main: "最近更新したノート" rows: 36px tile radius 12, title 15/600, excerpt 13, folder column 176px, time 64px right; "ライブラリで見る ›" (:113-135)
- NotesLibrary (1440): rail 220px (padding 20 16 0 0), 2-segment switch, entries 34px/14px, folder icon on every entry, count 12px muted right, selected filled #f6f6f3/600; tab bar bottom to rail top 20px (NotesLibrary.dc.html:66, :74-86)
- NotesLibrary: list 340-380px, hairlines both sides; search pill 36px + text-only sort button "更新順" 13px (:88-95); rows padding 12 16, title 15/600 + time 12, excerpt 13/1.55 two lines, selected filled (:96-108, :179)
- NotesLibrary: pane padding 24 0 0 40; top-right "編集" sand pill 34px with pen icon + icon-only 34px open link (:111-120); content max-width 680; title 28px/700; meta 13px + tag chips 22px; body 16px/1.85, h3 18px/700; "つながり" after hairline with two columns and graph link (:122-162)
- NotesLibraryEdit (1440): top row = toolbar (32px buttons H B I list link image, starting at the pane's left edge) + "保存済み" + dark "完了" pill 34px with check + open link, gap 8 (NotesLibraryEdit.dc.html:111-128); source below, margin-top 16, padding 8 0 32, no left inset: raw markdown with muted `#91918c` marks, 15px/1.85, title 26px/700 (:130-141, :20-21); no version-history region
- NotesLibraryPhone (390): header 22px title, Target "すべて" on the title row at the right (:26-41); tabs margin-top 16, padding 10x14 (:43); "新しいノート" full width, 40px, margin-top 12 (:48); row: filled rail button (36px, `#e5e5e0`, no border) + text-only sort button right after it, gap 8 (:53-60); search 40px full width margin-top 10 (:62); rows edge to edge, padding 12 16 (:67-70)

## Accepted by the human (not counted)
- r1-knowledge-frame-library.md D-1..D-5 (Home headings with icon and 18px; FilePlus on New note; folder icon in Recently updated; Layers icon on "All"; source line wording)
- Spec-declared: no "See all" on Notes with sources; the formatting toolbar as a second row

## Findings
### D-1 NotesLibraryEdit: a "版の履歴" region is added under the editor
- design: the editing pane is the top row plus the editor only; "no border or frame" (NotesLibraryEdit.dc.html:110-142; spec lines 72-74)
- implementation: a full-width collapsible "版の履歴" row sits at the bottom of the pane and expands into a version card, "選択した版", a restore button and a read-only preview (r5-shots/final/pane-editing-collapsed.png at y~975; r5-shots/final-45fccb2/pane-history-1440.png). Not in the spec's declared differences.
- visible: at a glance

### D-2 NotesLibraryEdit: the editor's toolbar and text are inset 32px from the pane's left edge
- design: toolbar buttons start at the pane's left edge and the source text has no left padding (`padding: 8px 0 32px`, NotesLibraryEdit.dc.html:112, :130)
- implementation: reading title/body at x=900, the editing toolbar's first button at x~922 and the text/placeholder at x~932-934 (r5-shots/final/pane-editing-collapsed.png, r5-shots/write-editing.png, r5-shots/pane-connections.png for the reading x). Edit/Done moves the text 32px sideways.
- visible: side by side

### D-3 NotesLibraryEdit: the editor shows rendered text, not raw markdown with muted marks
- design: every line is source: `---`/`tags:`/`---`, `# `, `## `, `- `, `[[ ]]` in muted `#91918c`, title 26px/700 (NotesLibraryEdit.dc.html:131-140, `.mk` :21)
- implementation: the title is drawn large and bold with no `# ` mark (r5-shots/write-editing.png: "R5 Alpha"); no frontmatter lines or muted marks appear in any editing screenshot (the shots use notes with only a heading or empty), so frontmatter and `[[ ]]` rendering cannot be checked.
- visible: at a glance

### D-4 NotesLibraryEdit: toolbar contents differ from the six-button toolbar
- design: six 32px buttons: H, B, I, bullet list, link, image (NotesLibraryEdit.dc.html:113-118); the second-row placement itself is declared
- implementation: H1 H2 H3 | B I S | list | link, code | insert-file | "..." overflow, with separators (r5-shots/final/pane-editing-collapsed.png at y~276; EditorToolbar.tsx). Not in the declared difference.
- visible: side by side

### D-5 NotesLibrary: the sort button carries an icon
- design: text-only "更新順" button, 13px (NotesLibrary.dc.html:94; NotesLibraryPhone.dc.html:59)
- implementation: an up-down arrows icon before "更新順" at 1440 and 390 (r5-shots/final-3bc9a48/library-1440.png, library-390.png; LibraryList.tsx:147 `icon={ArrowUpDown}`)
- visible: side by side

### D-6 NotesLibrary: reading body line height is tighter than the design's
- design: body 16px/1.85 (about 30px per line) (NotesLibrary.dc.html:129)
- implementation: wrapped lines step 26px at about 16px text (about 1.6): y=486 to 520, 647 to 673, callout lines 724, 750, 776 (r5-shots/pane-connections.png; r5-shots/final-3bc9a48/library-1440.png lines at 460 and 486). Headings in the body follow the shared prose styles rather than the 18px h3.
- visible: only by measuring (heading sizes: side by side)

### D-7 NotesLibraryPhone: "新しいノート" and the search field are about 36px tall, not 40px
- design: both 40px (NotesLibraryPhone.dc.html:48, :62)
- implementation: New note about y=202-238 and the search field about y=304-340 at 390 (r5-shots/final-3bc9a48/library-390.png); search is `h-9` (LibraryList.tsx:81, `pointer-coarse:h-11` only on touch); New note is the core `Button` default size (NotesPage.tsx:123). Measured by eye, about +-1px.
- visible: only by measuring

### D-8 NotesLibrary reading: tag chips are not shown in R-5
- design: the meta line ends with tag chips, 22px green-tinted pills (NotesLibrary.dc.html:126, `.chip` :20)
- implementation: code draws `bg-accent-teal/15 text-accent-teal` 22px chips (NotePanePresenter.tsx:151-158), but no R-5 screenshot shows a note with tags in the reading pane.
- visible: not shown in R-5, cannot be checked

### D-9 Home: the "続きを書く" cards are not shown at the final commit
- design: 132px paper area, sheet flush to the area's bottom, 4 columns at 1440 (Main.dc.html:72-84)
- implementation: only the first-pass shot shows cards (r5-shots/home-continue-writing.png, two cards 264px wide, same structure; ContinueCard.tsx:32-33 uses `h-32 px-4 pt-4` / `rounded-t-lg border-b-0`); the final Home shots have no Continue writing row and none shows four cards in a row.
- visible: not shown in R-5, cannot be checked

### D-10 NotesLibraryPhone: the Target is on the scope line, not on the title row
- design: "すべて" Target at the right of the icon/title row, vertically centred with the title block (NotesLibraryPhone.dc.html:26-41)
- implementation: the Target sits on the scope-line row ("動画 · 152 件" and "すべてのノート ⌄", y~133) below the title, with its full label (r5-shots/final-3bc9a48/library-390.png). Core AppHeader layout. Awaiting the human's decision.
- visible: side by side

### D-11 NotesLibraryPhone: the rail button is an outlined pill, not the filled one
- design: filled pill `background:#e5e5e0`, no border, 36px (NotesLibraryPhone.dc.html:54)
- implementation: white pill with a hairline border, the same look as the sort button (r5-shots/final-3bc9a48/library-390.png "フォルダ: legacy"; core ToolbarMenu default style). Awaiting the human's decision.
- visible: at a glance

### D-12 NotesLibraryPhone: the sort button is at the row's right edge, not beside the rail button
- design: sort button right after the rail button, gap 8, free space to the right (NotesLibraryPhone.dc.html:53-59)
- implementation: the rail button's wrapper is `min-w-0 flex-1` (NotesLibrary.tsx:217), so "更新順" sits at x~284-374 at the row's right edge (r5-shots/final-3bc9a48/library-390.png). Awaiting the human's decision.
- visible: side by side

### D-13 NotesLibrary (three columns): tab bar to the Library's first control is 21px
- design: 20px (nav `border-bottom` then rail `padding-top:20px`, NotesLibrary.dc.html:66, :74)
- implementation: 21px at 1440 and 1280 (decisions.md final-3bc9a48 measurement; r5-shots/final-3bc9a48/library-1440.png; NotesLibrary.tsx:205 `pt-2.5` over the page's `pt-0`). Awaiting the human's decision.
- visible: only by measuring

### D-14 Expanded "版の履歴": an inner divider and bordered cards
- design: the region does not exist (see D-1), so no rules or cards are drawn
- implementation: a 1px rule between the header and body and a bordered version card and detail boxes (r5-shots/final-45fccb2/pane-history-1440.png; r5-shots/final/pane-history-expanded-crop.png). Awaiting the human's decision.
- visible: at a glance


## Human decision (2026-11-18)

- Fixed: D-2 (knowledge 5e850e1) and D-13 (065b6f3), measured in R-5 (r5-shots/final-065b6f3/).
- Accepted: D-1, D-3, D-4, D-6, D-14 (the file page's own editor, toolbar, version history panel and preview, reused as the spec says); D-5, D-7, D-11 (core shared controls); D-10, D-12 (core header and row layout).
- Shown on screen in R-5: D-8 (d8-reading-meta-tags.png), D-9 (d9-home-continue-writing-1440.png).

TOTAL: 14 findings
