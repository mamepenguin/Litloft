# Design check

at: a8bb2ce8db8cec1671857df2dfa1d247fe17a3aa
design: docs/process/reviews/feature-transcript-touch-actions/design/

## Decisions read from the design
- Main (現在, baseline, not proposed): per-row 修正 text button (min 44px) plus a 32px icon-only 引用 button always drawn at the right of each row (Main.dc.html:31-32)
- Idle: rows are a single button, no controls except seek (Idle.dc.html:26); row min-height 44px, padding 6px 8px, gap 12px, 14px/20px text, 12px mono time muted (Idle.dc.html:26-28); active row bg rgba(214,48,49,0.1), text #d63031 (Idle.dc.html:47); rows gap 2px in white card padding 8 (Idle.dc.html:24); chips 文字起こし/単語 and 「AIで整える」 right-aligned (Idle.dc.html:17-23)
- Selected: tapped row is a wrapper with tinted bg and the seek button; below it a right-aligned strip, gap 12px, padding 0 4px 6px (Selected.dc.html:32); 修正 (12px pencil icon) then 引用 (14px quote icon), each height 28px, padding 0 8px, 12px/500, muted #62625b, no background (Selected.dc.html:33-34)
- Editing: dim backdrop rgba(0,0,0,0.6) (Editing.dc.html:25); dialog top 56, left/right 16, radius 16, padding 20, white, gap 16 (Editing.dc.html:26); heading 修正 18px/600 + mono time 12px muted, close button 32x32 with 18px X (Editing.dc.html:28-30); textarea rows=4, 16px/24px, border 1px #d63031, radius 16, padding 10px 12px, bg #f6f6f3 (Editing.dc.html:32); buttons キャンセル (44px, bg #f6f6f3, muted text, padding 0 16) then 保存 (44px, bg #d63031, white, 500, padding 0 20), right-aligned, gap 12 (Editing.dc.html:33-36); 300px keyboard placeholder at bottom (Editing.dc.html:38)

## Findings
### D-1 Editing: textarea focus border is blue, not the accent red
- design: 1px solid #d63031 (Editing.dc.html:32)
- implementation: focused textarea draws a blue/indigo ring (shots/phone-390-editing.png); likely the global focus-ring token
- visible: at a glance

### D-2 Editing: textarea is taller than the design's 4 rows
- design: rows="4" (about 96px of text plus padding, ~118px) (Editing.dc.html:32)
- implementation: 142px tall, 5 lines (decisions.md; shots/phone-390-editing.png)
- visible: side by side

### D-3 Editing: close button is 44x44, design is 32x32
- design: 32x32 button, 18px icon (Editing.dc.html:30)
- implementation: 44x44 (decisions.md; shots/phone-390-editing.png). Header row is taller as a result.
- visible: only by measuring

### D-4 Editing: キャンセル button fill is darker than the design
- design: background #f6f6f3, i.e. the page background (Editing.dc.html:34)
- implementation: bg-sand, which draws as a visibly grey-beige pill (shots/phone-390-editing.png)
- visible: side by side

### D-5 Editing: on-screen keyboard state not shown in R-5
- design: dialog sits above a 300px keyboard block (Editing.dc.html:38)
- implementation: decisions.md pending says the real keyboard was not tested; no screenshot shows the dialog with a keyboard, so this cannot be checked from R-5 (only 保存 bottom y=338 against a computed limit is stated)
- visible: not shown in R-5, cannot be checked

Not findings (matched): idle rows have no controls and the same chips/AI button layout (shots/phone-390-idle.png); selected strip order, right alignment, icon+label, muted colour, tinted wrapper (shots/phone-390-selected.png); dialog top/side margins, radius, padding, heading, button order and accent 保存 (shots/phone-390-editing.png). Screenshots are at 390 and 375 widths in the inspector sheet with the player above, so surrounding page chrome differs from the boards by design of the boards. Main (現在) is the baseline, not a target.

TOTAL: 5 findings
