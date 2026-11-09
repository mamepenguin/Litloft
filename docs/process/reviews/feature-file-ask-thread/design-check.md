# Design check

at: 1dde119a99781700a35d96cc180d4731d7334b6a
design: docs/process/reviews/feature-file-ask-thread/design/ (Main.dc.html, design A; TopComposer not compared)

## Decisions read from the design
- Main: panel 400px wide, 760px tall, white, 1px left border (Main.dc.html:16)
- Main: tab strip 詳細 / 文字起こし / 質問, 13px, gap 20px, selected = 600 weight + 2px #211922 underline (:17-21)
- Main: turns area flex:1, scrolls, padding 16px, gap between turns 24px (:23)
- Main: turn = section, gap 8px; question 14px weight 600 (:24-25)
- Main: answer 14px, line-height 1.7 (:26)
- Main: citation pill = inline-block, padding 1px 7px, radius 999px, fill #f6f6f3, 1px border, 12px (:26)
- Main: partial note 12px muted, under the answer (:32)
- Main: failed turn = question + red 14px 答えを作れませんでした (:37)
- Main: composer form pinned below turns, border-top, padding 12px 16px 16px, gap 8px (:41)
- Main: textarea rows=3, radius 16px, 1px border, padding 12px, 14px, resize none (:43)
- Main: button row: 新しい会話 and Markdownで保存 on the left (white fill, 1px border, radius 10px, min-height 36px, 13px), spacer, 質問する on the right (accent fill, radius 12px, min-height 40px, 14px/600) (:44-48)
- Main: both left buttons drawn together with the submit (:45-48)

## Findings
### D-1 Main: answer text is larger than the question and the design's size
- design: answer 14px, line-height 1.7, same size as the 14px question (Main.dc.html:25-26)
- implementation: answer is `text-base leading-relaxed` (16px); the question is `text-sm` (14px), so the answer reads clearly bigger than the question (shots/c10-desktop-layout.png, shots/c2-video-two-turns.png; AnswerMarkdown.tsx:320, AskTab.tsx:327)
- visible: at a glance

### D-2 Main: question weight lighter than designed
- design: question weight 600 (Main.dc.html:25)
- implementation: `font-medium` (500) (AskTab.tsx:327)
- visible: only by measuring

### D-3 Main: gap between turns is half the designed gap
- design: 24px between turns (Main.dc.html:23)
- implementation: `space-y-3` = 12px between turns (AskTab.tsx:319-322); in shots/c9-followup-partial.png and shots/c2-video-two-turns.png the next question sits close under the previous answer
- visible: side by side

### D-4 Main: turns area padding and form spacing differ
- design: turns padding 16px all round; form padding 12px 16px 16px (Main.dc.html:23,41)
- implementation: the turns scroller has only `pb-2` (8px) bottom and the form `pt-2` (8px) (AskTab.tsx:319,372); horizontal/top padding comes from the host panel, so the area between last answer and the divider and the divider and the textarea is tighter (shots/c10-desktop-layout.png: textarea top 8px under the rule)
- visible: only by measuring

### D-5 Main: citation pill has no fill or border
- design: pill with #f6f6f3 fill, 1px border, 12px text (Main.dc.html:26)
- implementation: pill is only `rounded-full px-1.5 py-0.5 text-text-muted`, no background or border at rest, text size inherits the answer's (shots/c2-video-two-turns.png shows "0:04" as bare grey text; AnswerMarkdown.tsx:12-13)
- visible: at a glance

### D-6 Main: textarea is resizable
- design: resize none (Main.dc.html:43)
- implementation: `resize-y`, drag handle drawn at the textarea corner (shots/c10-desktop-layout.png; AskTab.tsx:383)
- visible: side by side

### D-7 Main: button row alignment and shapes
- design: 新しい会話 and Markdownで保存 left-aligned, submit pushed right by a spacer; secondaries radius 10px/36px high, submit radius 12px/40px high (Main.dc.html:44-48)
- implementation: row is `justify-end`, so every button is right-aligned; with only the submit (empty state, shots/e1-ask-tab.png) it sits alone at the right, with the secondaries beside it they sit adjacent to it. All three use the shared Button (`rounded-2xl`, `px-4 py-2`), so the submit is the same height as the secondaries and the radii are 16px (AskTab.tsx:385; Button.tsx:13-14,26)
- visible: side by side

### D-8 Main: secondary buttons are sand-filled, not white with a border
- design: white fill, 1px border rgba(145,145,140,0.35) (Main.dc.html:45-46)
- implementation: `bg-sand` fill, no border (shots/c10-desktop-layout.png). decisions.md check 10 notes this as a neutral-colour difference; it is stated by the agent, not attributed to a human decision.
- visible: side by side

### D-9 Main: new-conversation and save buttons are conditional, design draws them always
- design: both secondary buttons drawn with a three-turn thread (Main.dc.html:45-46); no empty or streaming state drawn
- implementation: 新しい会話 shows only when turns exist and nothing is streaming; save only after an answered turn and not streaming (AskTab.tsx:126-129,386,396). The empty state has just the submit (shots/e1-ask-tab.png). The design does not draw the empty state, so this is recorded for the person to judge.
- visible: side by side

### D-10 Main: tab strip differs from the artboard
- design: three tabs 詳細 / 文字起こし / 質問 (Main.dc.html:18-20)
- implementation: four tabs 情報 / 関連 / 文字起こし / 質問; the selected style is a red underline, not #211922 (shots/c10-desktop-layout.png). The tab strip is the host's, not this change's code.
- visible: at a glance

### D-11 Main: phone width has no artboard
- design: only a 400px artboard exists (canvas.json); no phone layout is drawn
- implementation: phone shots exist (shots/c10-phone-layout.png) but there is nothing to compare them to; not checkable
- visible: not shown in the design

TOTAL: 11 findings
