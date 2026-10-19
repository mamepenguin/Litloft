# Spec review: shared segmented control (PR-C)

Reviewed: `docs/superpowers/specs/2026-09-27-segmented-control.md` and
`invariants.md` in this folder, against `00721f7dd` (develop). Design canvas
boards `Typography.dc.html` and `Segmented.dc.html` were read as well.
Pre-implementation review: no code was mutated; each finding cites the code it
rests on.

## S-1 (major) Appearance / Language pills are not "already border-selected"

**What.** "Checked, no action" says they are border-selected, and the DESIGN.md
edit would name them "the other shape". Their selected state is
`border-accent bg-bg-elevated`, which is a fill, and their unselected state is
`border-bg-border`, a visible border rather than `border-transparent`. Both
break the rules the same §6 section states. Writing them into DESIGN.md as a
sanctioned shape would put a selected fill into the rule that forbids one.

**Evidence.** `frontend/src/components/settings/AppearanceSection.tsx:36-41`,
`LanguageSection.tsx:49-50`; DESIGN.md:577-584.

**Suggested change.** Either leave the pills out of the DESIGN.md edit and file
them as a ledger item, or say the pills get a *different* rule (a bordered
chip) and state that the selected fill is an accepted exception. Correct the
"already border-selected" sentence.

## S-2 (major) Labelled `Button` around one glyph is narrower than 44 px on a coarse pointer

**What.** A labelled `Button` gets `pointer-coarse:min-h-11` only. Nothing sets
a width floor. With `size="md"` (`px-4`), the "A" at 11 px is about 39 px
wide and the "A" at 16 px about 43 px. Today's segments are `flex-1 max-w-14`
(up to 56 px), so this would be a regression. The canvas draws 44×32 fine and
56×44 coarse. Invariant 4 only checks height, so it would let this through.
`aria-label` on a labelled `Button` does type-check (`NativeButtonProps`), but
the visible "A" is not part of the name "Smaller text" (WCAG 2.5.3). In
practice the glyph is an icon.

**Evidence.** `frontend/src/components/Button.tsx:24-28,39,137-146`;
`EpubTypographyPanel.tsx:20-21,95,107`; canvas `.sb` / `.coarse .sb`.

**Suggested change.** Specify `iconOnly` `Button`s. That gives a 32 px box plus
the `COARSE_HIT_AREA` overhang, which is 44×44 in both dimensions, and the type
requires `aria-label`. The dots between the two buttons keep the overhangs from
overlapping. The row then needs its own `pointer-coarse:min-h-11`
(Button.tsx:56-59). If a labelled `Button` is kept, add a coarse width floor
through `className`. In either case, invariant 4 should say "44 × 44" for the
text-size buttons too.

## S-3 (major) `Button` secondary vs the canvas's bordered white buttons: enabled and disabled become the same fill

**What.** The canvas draws the A buttons white with a `#e4e4df` border when
enabled, and sand with no border when disabled. `Button` secondary is `bg-sand`
when enabled, and `DISABLED_CLASS` is `bg-sand` too. So at the ends of the
scale, the only visible difference is the text colour (`text-text-primary` →
`text-warm-silver`). `className` is "layout only, not colour", so the canvas
border cannot be added. Nothing breaks a DESIGN rule (sand is not an accent
fill, and the §6 disabled row is honoured). The spec simply picks a look the
canvas did not show, and it does not say so.

**Evidence.** `Button.tsx:14,49-50,76`; DESIGN.md:511-518; canvas `.sb`,
`.sb:disabled`.

**Suggested change.** State the choice. One option is to accept secondary
(the canvas is superseded, and disabled shows as silver text on the same
sand). The other is `ghost`: transparent when enabled and sand when disabled,
which keeps the canvas's "the disabled one fills" contrast without a new
variant. A bordered variant would be a `Button` change and is out of scope.

## S-4 (major) A disabled ghost Reset turns into a sand pill, and it is disabled most of the time

**What.** `DISABLED_CLASS` applies `bg-sand` to every variant, ghost included.
At the defaults (the state most readers are in), the header would show a filled
sand pill with silver text. That carries more visual weight than the enabled
Reset, which is transparent. The canvas has no disabled Reset at all: it is
12 px muted text that stays enabled. The canvas also sizes Reset below
`Button`'s text-sm / font-medium / `text-text-primary` / `rounded-2xl`.

**Evidence.** `Button.tsx:16,49-50,142`; canvas `.reset`.

**Suggested change.** Decide between these explicitly:
- (a) Reset stays enabled and is a no-op at the defaults. This matches the canvas and removes S-5.
- (b) Reset is hidden at the defaults, which makes the header row change height.
- (c) The sand pill is accepted.

Recommended: (a). Invariant 5's "disabled when they already apply" then goes away.

## S-5 (major) Pressing Reset disables the focused button, and keyboard focus leaves the dialog

**What.** Reset always lands on the defaults, so under the spec it disables
itself on every press while it has focus. In Chromium a focused element that
becomes `disabled` loses focus to `<body>`, outside the `role="dialog"` panel.
The next Tab then starts from the top of the page, behind the cover. The A
buttons already do this at the ends of the scale; that is `[pre-existing]`.
Reset makes it happen on 100% of its presses.

**Evidence.** Spec "Reset … disabled when the settings already equal the
defaults"; the panel is `tabIndex={-1}` and focused on open
(`EpubTypographyPanel.tsx:81`, `EpubPreview.tsx:109-111`).

**Suggested change.** Either S-4 (a), or state that focus moves to the panel
(`typographyPanelRef`) when Reset disables itself. Add that as an observable
invariant (`document.activeElement` is inside the panel after Reset).

## S-6 (major) The Markdown group needs an accessible name, and no key or repository is planned for it

**What.** Invariant 1 requires the group to have an accessible name, and the
component takes a `label`. `MarkdownViewModeToggle` has no group name today.
Its labels come from `knowledge.editor.view.*`, which exists only in the
knowledge addon's messages; core `messages-core` has no `knowledge` namespace.
The spec adds only `file.epubTypographyReset`. A new
`knowledge.editor.view.<group>` key would be a knowledge-repo change, which
the spec rules out ("addons' own code" not touched). A core key needs a
namespace.

**Evidence.** `frontend/src/components/MarkdownViewModeToggle.tsx:29,34`;
`addons/knowledge/frontend/messages/en.json` (`knowledge.editor.view` = edit /
split / preview); `frontend/src/messages-core/en.json` (no `knowledge`).

**Suggested change.** Name the key and where it lives. For example, a core
`markdown.viewMode` ("View" / "表示"), which fits a core component better than
the addon namespace does. Add it to the touch points. The core toggle reading
addon messages is `[pre-existing]` and goes to the ledger.

## S-7 (major) The icon shape on a coarse pointer is 50 px tall inside the 48 px file-detail chrome row

**What.** An `h-11 w-11` segment, plus the container's `p-0.5` and 1 px border,
makes the group 44 + 4 + 2 = 50 px tall. `FileDetailChrome` is a fixed `h-12`
(48 px) `items-center` row, so the group spills 1 px past each edge, over its
`border-b`. On a phone (`hideSplit`) the group also grows from about 64 px wide
to about 96 px in the row that `header-row-crowding.spec.ts` measures at 390 px
on the Pixel 5 project (`hasTouch`). None of this is in the touch points.

**Evidence.** `frontend/src/components/FileDetail/FileDetailChrome.tsx:90`;
`frontend/e2e-components/fixtures/app.tsx:1305,1374`;
`frontend/e2e-components/header-row-crowding.spec.ts:197,345-369`;
`playwright-components.config.ts` (Pixel 5). DESIGN.md Row Actions:
"Several controls together are one group. On a coarse pointer they sit with no
gap".

**Suggested change.** On a coarse pointer, drop the container padding, gap and
border, or accept a smaller box and use an overhang. Row Actions already
prescribes gap 0 for grouped controls. Add `FileDetailChrome`, the
e2e-components fixture and `header-row-crowding.spec.ts` to the touch points.
Add an invariant: "the view-mode group lies inside the chrome row's box on a
coarse pointer".

## S-8 (minor) The icon shape keeps 28 px, below DESIGN's 32 px icon-only box

**What.** The spec re-specifies `h-7 w-7` ("today's Markdown size"). DESIGN §6
fixes an icon-only button at a 32 px square, and Row Actions sets 32 px as the
fine-pointer target.

**Evidence.** DESIGN.md:519-522, Row Actions "32px on a fine one";
`MarkdownViewModeToggle.tsx:48`.

**Suggested change.** Use `h-8 w-8`, or record 28 px as a deliberate exception
in the DESIGN.md edit.

## S-9 (minor) Label fit at 320 px depends on a font size and padding the spec does not fix

**What.** The inline panel is `absolute inset-x-2` in the frame. At a 320 px
viewport with the page's 16 px gutter, the panel is about 272 px wide and its
content about 246 px. Each of three segments gets
(246 − 2 border − 4 padding − 4 gaps) / 3 ≈ 78 px. After a 1 px border on
each side and `px-1`, about 68 px is left for text:
- オリジナル at `text-xs` (12 px × 5 full-width glyphs ≈ 60 px) fits.
- At `text-sm` (≈ 70 px) it truncates.
- With `px-2` (≈ 60 px left) it only just fits.

In PR-B's 320 px popover the content is about 294 px, which gives about
86 px per segment, so every label fits. ゴシック (4 glyphs), 明朝, 1.6 and
Sans-serif (≈ 60 px at 12 px) fit in both. The header row fits in both:
文字の設定 plus a `Button` sm 標準に戻す is about 160 px.

**Evidence.** `EpubPreview.tsx:274`; `EpubTypographyPanel.tsx:21,85`; canvas
`.sg` (12 px, 13 px coarse, `padding: 0 4px`).

**Suggested change.** Pin the text-shape segment's type size and padding in the
spec (`text-xs px-1`, as today and as on the canvas). Keep the real-browser
measurement, with the frame at the page's real gutter.

## S-10 (minor) The panel grows by about 145 px on a coarse pointer; the height is not measured

**What.** Moving the labels above the controls adds a label line per field, and
the header row adds a 44 px Reset. The panel goes from roughly 256 px to
roughly 400 px on a coarse pointer. Placement is unchanged, and the panel
scrolls inside the frame, so on an inline phone frame or in landscape it now
covers or scrolls where it did not before. The planned measurement checks
wrapping and overflow, not height.

**Evidence.** `EpubPreview.tsx:84` (`maxHeight` capped by the frame);
`EpubTypographyPanel.tsx:85`.

**Suggested change.** Add to the measurement: panel height against the frame at
375×667 inline and at 667×375 full screen, and whether the header row (Reset)
and the size row are visible without scrolling.

## S-11 (minor) "Equal to the defaults" must be field-wise; a reference test passes and then fails in use

**What.** `readStoredTypography` returns the `TYPOGRAPHY_DEFAULTS` object
itself when nothing is stored, and a fresh object otherwise. `set()` always
builds a new object. A `typography === TYPOGRAPHY_DEFAULTS` implementation
would pass a test that starts from empty storage. It would fail once a reader
steps 100% → 115% → 100%, where the settings equal the defaults but the object
is not the same one. A hand-written four-field comparison silently ignores a
fifth key if one is added later.

**Evidence.** `frontend/src/lib/epubTypography.ts:18-23,43-51`;
`EpubTypographyPanel.tsx:73`.

**Suggested change.** Define `isDefaultTypography(t)` next to
`TYPOGRAPHY_DEFAULTS`, comparing every key of `TYPOGRAPHY_DEFAULTS`. That
relaxes "Not touched: `epubTypography.ts`" to "values and storage unchanged".
Add a test row that returns to the defaults by hand. This finding goes away if
S-4 (a) is taken.

## S-12 (minor) Invariant 2 does not decide whether pressing the current segment calls `onChange`

**What.** "Calls `onChange` with that option's value once, and pressing the
current one changes nothing else" can be read either way. Today the current
segment does call `onChange`, and in EPUB that re-posts and re-stores the same
typography. "Nothing else" cannot be observed on a stateless component.

**Evidence.** `EpubTypographyPanel.tsx:47,73`; invariants.md item 2.

**Suggested change.** State one of these: "pressing the current segment calls
`onChange` once with the current value", or "does not call `onChange`". Drop
"changes nothing else".

## S-13 (minor) Invariants 3 and 4 cannot be killed by a jsdom test

**What.** "Selection moves no pixel" and "≥ 44 px on a coarse pointer" are
layout facts. jsdom lays nothing out, and no `pointer-coarse` media query
matches in it (review-workflow.md, "What a test here cannot hold"). The only
real-browser check planned is a manual measurement, which CI does not run.

**Evidence.** invariants.md items 3, 4; `.claude/rules/review-workflow.md`
"jsdom lays nothing out".

**Suggested change.** Name the detector: an `e2e-components` case (Pixel 5,
coarse) that measures segment and text-size button boxes. Alternatively,
narrow invariants 3 and 4 to their class recipe and say so.

## S-14 (minor) The dot colours are unspecified

**What.** "Only the current step coloured" does not name a token. The canvas
uses `#211922` (text-primary) for the current dot and `#d5d5d0` (sand-hover)
for the rest. A `bg-accent` dot would spend accent on a non-CTA mark (§2.2).

**Evidence.** canvas `.dot`, `.dot.on`; DESIGN.md:244-250.

**Suggested change.** State `bg-text-primary` for the current dot and
`bg-sand-hover` for the others.

## S-15 (minor) Spec and canvas disagree on the segment recipe; say which one wins

**What.** Four values differ:

| Property | Canvas | Spec |
|---|---|---|
| Selected border | 1.5 px | 1 px (`border`) |
| Segment radius | 10 px | 8 px (`rounded-lg`) |
| Selected weight | 600 | `font-medium` (500) |
| Text size | 12 px, 13 px on a coarse pointer | not specified |

DESIGN Tabs use `font-semibold` for their selected state.

**Evidence.** canvas `.sg`, `.sg.on`; spec "Look"; DESIGN.md:567-569.

**Suggested change.** Pick one set and note that the other is superseded.
Consider `font-semibold` for parity with tabs.

## S-16 (minor) The focus ring recipe omits `focus-visible:outline-none`

**What.** `focus-visible:ring-2 ring-focus-ring` alone leaves the UA focus
outline drawn as well as the ring. `Button`'s base recipe pairs the two.

**Evidence.** `Button.tsx:64-66`.

**Suggested change.** Use
`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring`.

## S-17 (minor) Touch points that the change reaches but the list omits, or lists wrongly

**What.**
- `addons/knowledge/frontend/__tests__/Editor.focusOnEdit.test.tsx:201-213`
  clicks `view-mode-*`. It is held by invariant 7, but it is a knowledge-repo
  test that runs against core.
- `frontend/e2e-components/fixtures/app.tsx` and `header-row-crowding.spec.ts`
  (S-7).
- `FileDetailChrome.tsx` (S-7).
- `frontend/src/__tests__/tab-styles.test.ts` has a "segmented control"
  detector (a track of `rounded-2xl bg-bg-elevated p-1` plus a pill of
  `flex-1 rounded-xl`). The new recipe (`rounded-xl p-0.5`,
  `flex-1 … rounded-lg`) does not match it. The spec should still say the
  component is for `aria-pressed` toggles and never for navigation, because
  DESIGN §6 Tabs says "only underline tabs".
- `e2e-epub/typography.spec.ts` is listed "if it drives the panel". It does
  not: it drives `host.html`'s `window.setTypography`
  (`typography.spec.ts:89-92`), so it needs no change. Say so.
- `popup-dismissal.test.ts` is not reached: `role="group"` is not one of its
  needles, and the panel keeps `role="dialog"`.

**Suggested change.** Update the touch-point list as above.

## S-18 (minor) Nothing keeps hand-written segmented toggles from coming back

**What.** Tabs have a sweep (`tab-styles.test.ts`) that fails when a second
writer appears. Segmented toggles would have none. The two addon groups in
"Follow-up PRs" are the known writers today; a new one would pass unnoticed.

**Evidence.** `tab-styles.test.ts:132-138`.

**Suggested change.** Either add a sweep (for example, `aria-pressed` beside
`bg-bg-elevated` in a `.map` of buttons, outside `SegmentedControl.tsx`, with
a declared count that drops as the addon PRs land), or put "no detector" in
Checked, no action with the reason.

## S-19 (minor) §5 radius: `rounded-lg` is scoped to "small elements inside icon containers only"

**What.** Text segments are neither icons nor inside an icon container. The
text-size `Button`s would be `rounded-2xl` beside `rounded-xl` groups in the
same panel.

**Evidence.** DESIGN.md:491-499; `Button.tsx:13-17`.

**Suggested change.** The DESIGN.md edit should extend the `rounded-lg` row to
"segments inside a segmented control". It should also accept or resolve the
2xl / xl mix inside the panel.

TOTAL: 19 findings
