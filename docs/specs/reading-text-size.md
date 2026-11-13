# Text people read is set at the body size

SPEC-ID: SPEC-CORE-096
SPEC-ID: SPEC-ADDON-105

Approval: sha256:d1b28deeb6a5175080485786c2bd1f4aa641c404c7450da37f5711057df018c0 Yuichi Senga 2026-11-13

## Summary

Several surfaces show text a viewer reads for its content at the chrome sizes: a search
passage's excerpt at 13px; a comment, a file's description, the AI short and long
summary, the AI visual description, a picture's text, a detailed-summary citation
passage, a collection description, a Quick Note and an Ask question at 14px, several of them also in the muted colour. The Markdown body, the Ask
answer and the detailed summary already use the 16px body size, so the same kind of text
changes size from one panel to the next. This change states the rule in `DESIGN.md` and
moves those surfaces to it. For the one person who uses Litloft, on a phone, a tablet and
a desktop.

The rule: **text read for its content** — a sentence or more, including a one-sentence
summary and a question the viewer wrote — is `text-base` (16px) with `leading-relaxed`
(1.625) in `text-text-primary`. Labels, metadata, controls, status, empty and error lines,
and clamped excerpts that mark where something matched, are 14px or smaller. A field the
viewer types such text into is 16px; its line height stays the §3.5 form value (1.5 under
`:lang(ja)`), except an **in-place edit field** — no border and no background of its own,
drawn in the same box as the text it replaces — which takes the text's line height so the
block does not change height when editing starts.

- SPEC-CORE-096: core surfaces — the search passage excerpt and the image-query document
  excerpt, comments, the file description and its edit field, the collection description
  and its edit field, the Quick Note body field — plus the `DESIGN.md` rule.
- SPEC-ADDON-105: intelligence addon surfaces — the short and long summary, the visual
  description, the picture text, the detailed-summary citation passage, the Ask question
  echo and both Ask question fields.

## Required items

### 1. Normal flow

1. The viewer opens the search page's Passages view. Each text row's excerpt renders at
   16px / 26px in the primary colour; the locator above it stays 12px semibold, the file
   name 12px muted, the screen-text kind line 11px muted. A search by an image draws its
   document rows the same way, and their excerpt renders at 16px / 26px too.
2. The viewer opens a file's comments. Each comment body renders at 16px / 26px. The
   new-comment and edit-comment fields render their text at 16px.
3. The viewer opens a file that has a description. It renders at 16px / 26px in the
   primary colour, still clamped to three lines with show more / less. Its edit field
   renders at 16px. A collection's description renders at 16px / 26px in the primary
   colour and its edit field at 16px. The Quick Note body field renders at 16px.
4. The viewer opens a file's AI summary. The short summary renders at 16px medium weight,
   the long summary (paragraph or bullet list) at 16px regular, both 26px line height in
   the primary colour. In edit mode the two textareas take the same size, weight, line
   height and colour as the text they replace.
5. The viewer opens a picture's or video's AI visual description. It renders at 16px /
   26px in the primary colour.
6. The viewer opens a picture's text (OCR). Its lines render at 16px / 26px in the
   primary colour; its edit field renders at 16px at every width.
7. The viewer opens a citation in a file's detailed summary. The inline panel that opens
   under the cited segment renders its passage at 16px / 26px in the primary colour; the
   muted prefix and suffix around the target keep their colour and take the passage's
   size.
8. The viewer asks a question, in a file's Ask tab or on the Ask page
   (`/addons/intelligence`). The field they type into renders at 16px. In the file Ask
   tab the question, echoed above its answer, renders at 16px / 26px medium weight.

### 2. Failure cases

None: the change sets class names on existing elements. No request, state or data path
is added.

### 3. States

No new state. Each surface keeps its existing states (loading, empty, error, editing,
collapsed / expanded); only the size, line height and colour of the read text change.
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
  `frontend/e2e-layout/fixtures/passage-rows.html` copies the excerpt class in its three
  text rows and is updated with it, so `passage-rows.spec.ts` keeps measuring the real
  row.
- The comment list, the description, the summary, description, picture-text and
  citation panels, and the Ask thread grow taller. Each already scrolls inside its
  container. Fields with fixed `rows` grow taller by the same ratio; in the file Ask tab's
  full-height layout the thread area above the field shrinks by that much.
- A passage row for a scene match with no text shows a label (`matchClip`) in the excerpt
  position; it keeps 13px muted.

### 8. Error behavior

None: no new failure path. Error messages keep their current sizes.

### 9. User-visible behavior

- Search passage excerpt and image-query document excerpt: 13px → 16px, primary colour
  and relaxed line height kept, keyword marks unchanged.
- Comment body: 14px → 16px / 26px. Both comment fields: 14px → 16px.
- File description: 14px muted → 16px primary / 26px, three-line clamp kept. Its edit
  field: 14px → 16px.
- Collection description: 14px → 16px primary / 26px. Its edit field: 14px → 16px.
- Quick Note body field: 14px → 16px.
- AI short summary: 14px medium → 16px medium, primary. Long summary: 14px muted → 16px
  primary. Both 26px, and both edit textareas match.
- AI visual description: 14px muted → 16px primary / 26px.
- Picture text: 14px → 16px / 26px; its edit field loses the `sm:` step to 14px.
- Detailed-summary citation inline panel passage: 14px / 1.7 → 16px / 26px.
- Ask question echo (file Ask tab): 14px medium → 16px medium / 26px. Ask question fields
  (file Ask tab and Ask page): 14px → 16px.
- Every size above holds at every width: no `sm:` step back to 14px.
- `DESIGN.md` §3.2 gains the rule in the Summary, and §3.5 notes the in-place edit
  exception.

### 10. Non-functional

None beyond the existing layout limits: no new request, no data, no timing.

## Touch points

- `DESIGN.md` §3.2 Type Scale: the rule in the Summary. §3.5: the in-place edit exception
  to the form line height.
- `frontend/src/components/search/PassageList.tsx` `Excerpt`: the text excerpt element
  (not the scene-label branch).
- `frontend/src/components/search/ImageQueryViewPresenter.tsx`: the document row's
  excerpt.
- `frontend/e2e-layout/fixtures/passage-rows.html`: the copied excerpt class in the three
  text rows.
- `frontend/src/components/CommentSection.tsx`: comment body, new-comment textarea,
  edit-comment textarea.
- `frontend/src/components/FileDetail/FileDescription.tsx`: the description paragraph.
- `frontend/src/components/FileDetail/MetadataEditor.tsx`: the description field.
- `frontend/src/components/CollectionDetail.tsx`: the description text and its field.
- `frontend/src/components/quick-note/QuickNotePresenter.tsx`: the body field.
- `addons/intelligence/frontend/SummarySection.tsx`: short summary, long summary
  (paragraph and list forms), and their two edit textareas — the only in-place edit
  fields in scope. Their line height wins over the unlayered `:lang(ja)` form rule in
  `frontend/src/app/globals.css` (an unlayered rule beats Tailwind's layered utilities) by
  Tailwind's important modifier, `!leading-relaxed`; `globals.css` is not edited.
- `addons/intelligence/frontend/VisualDescriptionSection.tsx`: the description paragraph.
- `addons/intelligence/frontend/PictureTextSection.tsx`: the line list and its edit
  field.
- `addons/intelligence/frontend/CitationInlinePanel.tsx`: the passage paragraph. It is
  opened from `DetailedSummarySection.tsx`, not from an Ask answer.
- `addons/intelligence/frontend/AskTab.tsx`: the question echo and the question field.
- `addons/intelligence/frontend/Page.tsx`: the Ask page's question field.
- The intelligence files are a submodule: merged in the intelligence repository first,
  then the core pointer is bumped in the same core PR.
- Tests: `frontend/e2e-components/` — one arrangement per surface in
  `fixtures/app.tsx` (or a new fixture module it imports), rendering the real component
  with data fed by stubbing `fetch` or by props, as the existing arrangements do. Two spec
  files with the same assertions: `reading-text-size.spec.ts` runs in the phone project
  (Pixel 5, 393px), and `reading-text-size-desktop.spec.ts` is listed in `projects.ts`
  `DESKTOP_ONLY` and runs at 1280px. Both are registered in `spec-viewport.spec.ts`
  (`AT_THE_PHONE_WIDTH` / `AT_THE_DESKTOP_WIDTH`). Each test sets
  `document.documentElement.lang = "ja"` before measuring. Tests of core surfaces cite
  SPEC-CORE-096, tests of intelligence surfaces SPEC-ADDON-105.

No protected path is edited.

## Invariants

Each size below is the computed `font-size` / `line-height` / `font-weight` / `color` of
the element in a real browser, measured on the real component in
`frontend/e2e-components/` under `lang="ja"`, at the phone project's width (393px) and at
1280px.

I1. A search passage row with text, and an image-query document row, compute the excerpt at 16px font size and 26px line height in the primary text colour, and the locator and file name at 12px.
I2. A search passage row for a scene match with no text computes its label at 13px in the muted colour.
I3. A keyword match inside a passage excerpt is still wrapped in a `mark` with `bg-highlight-bg`, only the matched terms are wrapped, and a passage that is not a keyword match has no `mark`.
I4. A comment body computes 16px / 26px, and the textareas for writing and editing a comment compute 16px font size and 24px line height.
I5. A file description and a collection description compute 16px / 26px in the primary text colour, the file description is still clamped to three lines until expanded, and the file description field, the collection description field and the Quick Note body field compute 16px font size.
I6. The AI short summary computes 16px at weight 500 and the long summary 16px at weight 400, both 26px line height in the primary text colour, in both the paragraph and list forms of the long summary.
I7. Each summary edit textarea computes the same font size, weight, line height and colour as the read-only element it replaces.
I8. The AI visual description, each picture-text line and the detailed-summary citation inline panel's passage compute 16px / 26px in the primary text colour, and the picture-text edit field computes 16px font size.
I9. An Ask question echoed in the file Ask thread computes 16px / 26px, and the file Ask tab's question field and the Ask page's question field compute 16px font size.
I10. Transcript rows keep 14px, the core Find-in-file tab's match rows keep 13px, the Files view's match snippet keeps 11px, and the Ask page's citation excerpts and the intelligence Find page's excerpts keep 12px.
I11. In the detailed-summary citation inline panel, the prefix and suffix around the target compute the passage's font size in the muted text colour, and the target is still marked.

## Checked, no action

- Transcript rows stay 14px: the list is used to find a moment by time and jump to it,
  and a long transcript benefits from density. Owner decision, 2026-11-13.
- Clamped excerpts that mark where something matched stay: the Files view's match
  snippet (§Search Snippet, 11px), the Ask page's citation excerpts (12px italic,
  three lines), the intelligence Find page's excerpts (`pages/find.tsx`, 12px italic, two
  lines) and the scene list's transcript snippet (12px). Owner decision, 2026-11-13.
- The core Find-in-file tab's match rows (`FindTabPresenter.tsx`, 13px) stay: like the
  transcript, it is a list for jumping to a place, and density wins. Owner decision,
  2026-11-13.
- Fields with a border or background (comments, picture text, descriptions, Ask, Quick
  Note) keep the §3.5 line height: they already look different from the text they become,
  so matching the line height buys nothing. Owner decision, 2026-11-13.
- The detailed-summary section editor stays 13.5px monospace: it edits Markdown source,
  the same reason a code block is 0.85em.
- The knowledge addon's Capture Basket note field (12px) is a short annotation in a
  compact panel in a third repository; left for when that panel is next changed.
- `frontend/e2e-layout/fixtures/passage-rows.html` is a static copy with no parity test,
  like other static layout fixtures; it is updated by hand in this change and no parity
  test is added.
- The plain-text and archive text viewers stay 14px monospace: they show logs and code
  laid out by column, the same reason a Markdown code block is 0.85em. Owner decision,
  2026-11-13.
- Field line height stays the §3.5 form value (1.5 under `:lang(ja)`) for fields that are
  not in-place edits. Owner decision, 2026-11-13.
- Buttons, timestamps, author names, counts, status and error lines stay at their sizes.
- The detailed summary, the Ask answer and the Markdown body are already 16px.
- Muted helper copy under a control (empty-state descriptions, settings hints) is
  guidance, not text read for its content; not changed here.
- The `DESIGN.md` rule has no invariant: `.claude/rules/frontend-conventions.md` forbids
  tests that compare `DESIGN.md` text against the code; the code-side invariants above
  are what is checked.
- iOS focus zoom is not a goal: `layout.tsx` sets `maximumScale: 1, userScalable: false`,
  and device behaviour is in `agent_cannot_verify`.
- No Design Artifact: no new screen or component; the change is size, line height and
  colour on existing elements, decided with the owner.
- `docs/user-guide/`: a size change is layout, which the guide does not record.
