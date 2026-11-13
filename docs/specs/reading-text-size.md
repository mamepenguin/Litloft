# Text people read is set at the body size

SPEC-ID: SPEC-CORE-096
SPEC-ID: SPEC-ADDON-105

Approval:

## Summary

Several surfaces show text a viewer reads for its content at the chrome sizes: a search
passage's excerpt at 13px; a comment, the AI short and long summary, the AI visual
description and an Ask question at 14px, the summaries and the description also in the
muted colour. The Markdown body, the Ask answer and the detailed summary already use the
16px body size, so the same kind of text changes size from one panel to the next. This
change states the rule in `DESIGN.md` and moves those surfaces to it. For the one person
who uses Litloft, on a phone, a tablet and a desktop.

The rule: **text read for its content** — a sentence or more, including a one-sentence
summary and a question the viewer wrote — is `text-base` (16px) with `leading-relaxed`
(1.625) in `text-text-primary`. Labels, metadata, controls, status, empty and error lines
are 14px or smaller. A field the viewer types such text into uses the same size and line
height as the text it becomes.

- SPEC-CORE-096: core surfaces — the search passage excerpt and comments — plus the
  `DESIGN.md` rule.
- SPEC-ADDON-105: intelligence addon surfaces — the short and long summary, the visual
  description, the Ask question echo and both Ask question fields.

## Required items

### 1. Normal flow

1. The viewer opens the search page's Passages view. Each text row's excerpt renders at
   16px / 1.625 in the primary colour; the locator above it stays 12px semibold, the file
   name 12px muted, the screen-text kind line 11px muted.
2. The viewer opens a file's comments. Each comment body renders at 16px / 1.625. The
   new-comment and edit-comment fields render their text at 16px / 1.625, so the text
   keeps its size when it is saved.
3. The viewer opens a file's AI summary. The short summary renders at 16px medium weight,
   the long summary (paragraph or bullet list) at 16px regular, both 1.625 in the primary
   colour. In edit mode the two textareas take the same size, weight, line height and
   colour as the text they replace.
4. The viewer opens a picture's or video's AI visual description. It renders at 16px /
   1.625 in the primary colour.
5. The viewer asks a question, in a file's Ask tab or on the Ask page
   (`/addons/intelligence`). The field they type into renders at 16px / 1.625. In the
   file Ask tab the question, echoed above its answer, renders at 16px / 1.625 medium
   weight; the answer below is already 16px.

### 2. Failure cases

None: the change sets class names on existing elements. No request, state or data path
is added.

### 3. States

No new state. Each surface keeps its existing states (loading, empty, error, editing);
only the size, line height and colour of the read text in the populated state change.
Loading, empty and error messages are not read text under this rule and keep their sizes.

### 4. Data read and written

None.

### 5. External services

None.

### 6. Authorization

None: no endpoint or access path changes.

### 7. Effect on existing features

- Rows in the Passages view grow taller; an excerpt shown in full (no line clamp,
  `DESIGN.md` §Search passage rows) wraps onto more lines. The 16:9 picture column and the
  row measure (§3.6) do not change. The layout fixture
  `frontend/e2e-layout/fixtures/passage-rows.html` copies the excerpt class and is updated
  with it, so `passage-rows.spec.ts` keeps measuring the real row.
- The comment list, the summary and description panels and the Ask thread grow taller.
  Each already scrolls inside its container. The fields with fixed `rows` grow taller by
  the same ratio.
- A passage row for a scene match with no text shows a label (`matchClip`) in the excerpt
  position; it keeps 13px muted.

### 8. Error behavior

None: no new failure path. Error messages keep their current sizes.

### 9. User-visible behavior

- Search passage excerpt: 13px → 16px, primary colour and relaxed line height kept,
  keyword marks unchanged.
- Comment body and both comment fields: 14px → 16px, line height 1.625.
- AI short summary: 14px medium → 16px medium, primary colour. Long summary: 14px muted →
  16px primary. Both 1.625, and both edit textareas match.
- AI visual description: 14px muted → 16px primary, 1.625.
- Ask question echo (file Ask tab): 14px medium → 16px medium, 1.625. Ask question fields
  (file Ask tab and Ask page): 14px → 16px, 1.625.
- The sizes hold at every width: no `sm:` step back to 14px.
- `DESIGN.md` §3.2 gains the rule in the Summary.

### 10. Non-functional

None beyond the existing layout limits: no new request, no data, no timing.

## Touch points

- `DESIGN.md` §3.2 Type Scale: the rule in the Summary.
- `frontend/src/components/search/PassageList.tsx` `Excerpt`: the text excerpt element
  (not the scene-label branch).
- `frontend/e2e-layout/fixtures/passage-rows.html`: the copied excerpt class.
- `frontend/src/components/CommentSection.tsx`: comment body, new-comment textarea,
  edit-comment textarea.
- `addons/intelligence/frontend/SummarySection.tsx`: short summary, long summary
  (paragraph and list forms), and their two edit textareas.
- `addons/intelligence/frontend/VisualDescriptionSection.tsx`: the description paragraph.
- `addons/intelligence/frontend/AskTab.tsx`: the question echo and the question field.
- `addons/intelligence/frontend/Page.tsx`: the Ask page's question field.
- The intelligence files are a submodule: merged in the intelligence repository first,
  then the core pointer is bumped in the same core PR.
- Tests: computed sizes are measured on the real components in `frontend/e2e-components/`.

No protected path is edited.

## Invariants

Each size below is the computed `font-size` / `line-height` of the element in a real
browser, measured on the real component in `frontend/e2e-components/`, not a class name.

I1. A search passage row with text computes its excerpt at 16px font size and 26px line height in the primary text colour, and its locator and file name at 12px.
I2. A search passage row for a scene match with no text computes its label at 13px in the muted colour.
I3. A keyword match inside a passage excerpt is still wrapped in a `mark` with `bg-highlight-bg`, only the matched terms are wrapped, and a passage that is not a keyword match has no `mark`.
I4. A comment body and the textareas for writing and editing a comment compute 16px font size and 26px line height.
I5. The AI short summary computes 16px at medium weight and the long summary 16px at regular weight, both with 26px line height in the primary text colour, in both the paragraph and list forms of the long summary.
I6. Each summary edit textarea computes the same font size, weight, line height and colour as the read-only element it replaces.
I7. The AI visual description computes 16px font size and 26px line height in the primary text colour.
I8. An Ask question echoed in the file Ask thread, the file Ask tab's question field and the Ask page's question field compute 16px font size and 26px line height, at 390px and at desktop width.
I9. Transcript rows keep 14px and the Files view's match snippet keeps 11px.

## Checked, no action

- Transcript rows stay 14px: the list is used to find a moment by time and jump to it,
  and a long transcript benefits from density. Owner decision, 2026-11-13.
- The Files view's match snippet (§Search Snippet, 11px, two-line clamp) stays: it marks
  where a hit matched and is not read for its content.
- Buttons, timestamps, author names, counts, status and error lines stay at their sizes.
- The detailed summary, the Ask answer and the Markdown body are already 16px.
- Muted helper copy under a control (empty-state descriptions, settings hints) is
  guidance, not text read for its content; not changed here.
- The `DESIGN.md` rule has no invariant: `.claude/rules/frontend-conventions.md` forbids
  tests that compare `DESIGN.md` text against the code; the code-side invariants above
  are what is checked.
- iOS focus zoom is not a goal: `layout.tsx` sets `maximumScale: 1, userScalable: false`,
  and device behaviour is in `agent_cannot_verify`. The fields are 16px to match the text
  they become.
- No Design Artifact: no new screen or component; the change is size, line height and
  colour on existing elements, decided with the owner.
- `docs/user-guide/`: a size change is layout, which the guide does not record.
