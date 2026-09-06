---
version: alpha
name: Litloft
description: Warm, photography-forward design system for Litloft media browser. Next.js 16 + Tailwind CSS v4, Japanese-first typography.
colors:
  primary: "#211922"
  secondary: "#62625b"
  accent: "#d63031"
  accent-hover: "#b52425"
  accent-teal: "#103c25"
  accent-amber: "#78350f"
  danger: "#9e0a0a"
  sand: "#e5e5e0"
  sand-hover: "#d5d5d0"
  warm-light: "#e0e0d9"
  warm-silver: "#91918c"
  surface: "#ffffff"
  surface-elevated: "#f6f6f3"
  dark-surface: "#33332e"
  focus-ring: "#435ee5"
  highlight-bg: "#fff8c5"
  graph-cat-1: "#d63031"
  graph-cat-2: "#1f7a5a"
  graph-cat-3: "#c2740a"
  graph-cat-4: "#8e4585"
  graph-cat-5: "#7c7a45"
  graph-cat-6: "#3f6fa3"
typography:
  body:
    fontFamily: system-ui
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  h1:
    fontFamily: system-ui
    fontWeight: 700
    lineHeight: 1.35
  h2:
    fontFamily: system-ui
    fontWeight: 700
    lineHeight: 1.4
  h3:
    fontFamily: system-ui
    fontWeight: 650
    lineHeight: 1.45
  caption:
    fontFamily: system-ui
    fontSize: 12px
    fontWeight: 400
  section-header:
    fontFamily: system-ui
    fontSize: 11px
    fontWeight: 600
  prose-body:
    fontFamily: system-ui
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.625
  prose-h1:
    fontFamily: system-ui
    fontSize: 1.75em
    fontWeight: 700
    lineHeight: 1.35
  prose-h2:
    fontFamily: system-ui
    fontSize: 1.35em
    fontWeight: 700
    lineHeight: 1.4
  prose-h3:
    fontFamily: system-ui
    fontSize: 1.15em
    fontWeight: 650
    lineHeight: 1.45
rounded:
  full: 9999px
  lg: 16px
  md: 12px
  sm: 8px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.sand}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
  button-secondary-hover:
    backgroundColor: "{colors.sand-hover}"
  button-danger:
    textColor: "{colors.danger}"
    rounded: "{rounded.lg}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
  input:
    rounded: "{rounded.lg}"
  input-focus:
    outlineColor: "{colors.focus-ring}"
  modal:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  circle-button:
    backgroundColor: "{colors.warm-light}"
    rounded: "{rounded.full}"
  card-hover:
    backgroundColor: "{colors.surface-elevated}"
  tag-confirmed:
    backgroundColor: "{colors.accent-teal}"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
  tag-pending:
    backgroundColor: "{colors.accent-amber}"
    rounded: "{rounded.full}"
  text-muted:
    textColor: "{colors.secondary}"
  text-silver:
    textColor: "{colors.warm-silver}"
  highlight:
    backgroundColor: "{colors.highlight-bg}"
  dark-panel:
    backgroundColor: "{colors.dark-surface}"
---

# Litloft Design System

> Warm, photography-forward design system for Litloft.
> Stack: Next.js 16, Tailwind CSS v4.
> Japanese typography: jp-ui-contracts base + saas profile.

---

## 0. Metadata

| Key | Value |
|---|---|
| Locale | `ja-JP` |
| Profile | saas (media browser) |
| Theme | Light / Dark / System |
| CSS | Tailwind CSS v4 + CSS Custom Properties |
| Font | System-UI with CJK fallback stack |
| Last updated | 2026-09-04 |

---

## 1. Visual Theme

A **warm white canvas** with **coral red** as the single brand accent — flat, minimal, and photography-forward.

A warm-neutral, masonry-grid design philosophy (generous border-radius, depth without shadows) is translated into Litloft's file-browser UI.

**Light mode**: white canvas + plum black text + coral red accent
**Dark mode**: warm plum dark (`#1a0e10`) + bright coral (`#e85d5e`)

Dark mode uses a red-tinted plum instead of pure black, keeping the warm character consistent with the accent color.

---

## 2. Color System

### 2.1 CSS Custom Properties

All tokens are exposed as Tailwind utility classes via `@theme inline` (e.g. `bg-accent`, `text-text-muted`).

**Except two.** `--danger-bg` and `--kbd-shadow` are consumed by rules inside
`globals.css` and are deliberately absent from `@theme inline`, so there is no
`bg-danger-bg` and no `shadow-kbd-shadow` utility. Tailwind v4 emits nothing at
all for a utility whose token it does not know — no error, no warning, just a
class that does not exist — so writing one produces an element with no
background rather than a build failure. For an error surface in markup, use the
alpha derivation `bg-danger/15`. `frontend/src/__tests__/design-tokens.test.ts`
compiles every colour utility written in core and the addons against this
stylesheet and fails on the ones that produce no rule, which is what stops this
from recurring.

#### Light mode (`:root`, `[data-theme="light"]`)

| Token | Value | Usage |
|---|---|---|
| `--bg-primary` | `#ffffff` | Page background |
| `--bg-card` | `#ffffff` | Card background |
| `--bg-elevated` | `#f6f6f3` | Elevated surface (toolbars, etc.) |
| `--bg-sidebar` | `#ffffff` | Sidebar background |
| `--bg-border` | `rgba(145,145,140,0.2)` | Borders and dividers |
| `--text-primary` | `#211922` | Primary text (plum black) |
| `--text-muted` | `#62625b` | Secondary text (olive gray) |
| `--accent` | `#d63031` | Brand accent (coral red) |
| `--accent-hover` | `#b52425` | Accent hover state |
| `--accent-cta` | `#d63031` | CTA button (same as accent) |
| `--accent-teal` | `#103c25` | Success / nature accent (green) |
| `--accent-amber` | `#78350f` | AI-generated / suggestion pending state (deep warm brown) |
| `--sand` | `#e5e5e0` | Secondary button background (warm sand) |
| `--sand-hover` | `#d5d5d0` | Sand hover state |
| `--warm-light` | `#e0e0d9` | Circle buttons, subtle badge backgrounds |
| `--warm-silver` | `#91918c` | Borders, disabled text (warm silver) |
| `--dark-surface` | `#33332e` | Dark section backgrounds |
| `--focus-ring` | `#435ee5` | Focus ring (blue) |
| `--danger` | `#9e0a0a` | Danger / error color |
| `--danger-bg` | `rgba(230,0,35,0.08)` | Error background |
| `--highlight-bg` | `#fff8c5` | `<mark>` highlight background (warm butter) |
| `--kbd-shadow` | `inset 0 -1px 0 #b8c0c8` | `<kbd>` bottom bevel |

#### Dark mode (`[data-theme="dark"]`)

| Token | Value | Notes |
|---|---|---|
| `--bg-primary` | `#1a0e10` | Warm plum dark |
| `--bg-card` | `#231216` | Slightly lighter plum |
| `--bg-elevated` | `#2f191b` | Elevated surface |
| `--bg-sidebar` | `#1a0e10` | Same as bg-primary |
| `--bg-border` | `rgba(255,255,255,0.08)` | White translucent border |
| `--text-primary` | `#f5e6e8` | Warm light text |
| `--text-muted` | `#c4a0a4` | Pinkish muted text |
| `--accent` | `#e85d5e` | Bright coral |
| `--accent-hover` | `#f07070` | Lighter coral |
| `--accent-teal` | `#4caf80` | Bright green |
| `--accent-amber` | `#f4c674` | AI-generated / suggestion pending state (warm honey) |
| `--sand` | `#3d2023` | Dark sand |
| `--sand-hover` | `#4a2a2e` | Dark sand hover |
| `--warm-light` | `#3d2023` | Same as sand |
| `--warm-silver` | `#7a6668` | Muted pink-silver |
| `--dark-surface` | `#0d0608` | Deepest surface |
| `--focus-ring` | `#617bff` | Bright blue |
| `--danger` | `#ff8a8a` | Bright coral error |
| `--danger-bg` | `rgba(255,45,66,0.12)` | Error background |
| `--highlight-bg` | `rgba(244,198,116,0.55)` | Mark highlight — opacity lifted from 0.22 so it reads against the dark canvas |
| `--kbd-shadow` | `inset 0 -1px 0 rgba(255,255,255,0.2)` | `<kbd>` bottom bevel |

#### System preference

There is no `[data-theme="system"]`. A stored `'system'` is resolved to
`light` or `dark` by the pre-paint script (§8), and only those two values are
ever written to the attribute.

### 2.2 Color Usage Rules

- **`--accent`**: Use only for primary CTAs and brand highlights. Do not overuse.
- **One accent *fill* per screen.** "Do not overuse" was the whole of this
  rule for a long time and it is not a rule anyone can be wrong about, so
  three screens grew two or three fills each and nothing said so. The
  operational form: at rest, at most one control on a screen carries
  `bg-accent` (or its twin `bg-accent-cta`) as a background. Two fills means
  the screen has not decided what it is for — pick the one action the screen
  exists for, and give every other control `secondary`, `ghost`, or a border.
  **Which action that is changes per screen.** Play is bordered on a folder,
  where the fill belongs to Add, and filled on a collection, which has nothing
  to add to and exists to be played. A screen with no such action spends none:
  Trash and Missing are places to review and restore from, and carry no fill
  at all.
  This governs *fills*: `bg-accent/10` behind a hovered row,
  `enabled:hover:bg-accent-hover`, and a `border-accent` selected state are
  not fills and are not counted (§Selected-state controls uses the border for
  exactly this reason).
  `frontend/src/__tests__/accent-budget.test.tsx` renders the screens and
  counts, so the rule fails a build rather than a review. It counts **the
  core's own fills**: addon slots are stubbed there, so a control an addon
  contributes to a core screen spends from the same budget without being
  seen. The folder toolbar no longer offers a place on the bar for one —
  its addon rows are inside the `Add` menu — but other screens do, and
  what an addon draws there is its choice rather than this rule's.
  **Addon-owned screens count their own**, in their own repository's
  tests, because that is where both the components and the tests live.
  Ask and Find are accent-filled today
  (`addons/intelligence/frontend/Page.tsx`, `pages/find.tsx`); Phase 3 C2
  is where that is settled, not a core test file.
- **`--sand`**: Use for secondary button backgrounds, tags, and mid-tone surfaces.
- **`--accent-teal`**: Semantic status color for success / accepted state (e.g. confirmed tag).
- **`--accent-amber`**: Semantic status color for AI-generated / suggestion-pending state (e.g. AI-suggested tag awaiting user approval). Pair with a dashed border to convey "pending". Do not use as a brand accent.
- **`--danger`**: Use only for errors, deletions, and destructive actions. Do not confuse with `--accent` red.
- **`--text-muted`**: Keep contrast readable. Do not reduce opacity beyond legibility.
- Never rely on color alone to convey state — pair with icons or text.
- **`<mark>` UA default is reset globally** (`background: transparent; color: inherit`) so Tailwind utilities apply wherever `<mark>` is used outside the Markdown pipeline. Inside `.markdown-body`, `--highlight-bg` wins. Do not re-introduce the browser-default yellow. **Keep that reset inside `@layer base`** — Tailwind v4 emits utilities into `@layer utilities`, and an unlayered rule beats a layered one whatever its specificity, so as plain CSS the reset silently defeats every utility a caller puts on a mark.
- **A persistent highlight outside `.markdown-body` uses `bg-highlight-bg`** — the same `--highlight-bg` token, exposed as a utility so `<mark>` can carry it without a bespoke class. Use it for matched terms a surface keeps highlighted. `.ask-citation-highlight` remains the *temporary* jump flash and is not a substitute.

### 2.3 Wiki-link classes

The Markdown renderer emits three CSS classes for `[[X]]`-style wiki-links (spec `2026-05-12-markdown-link-three-forms.md` §3.8). Each class is paired with an existing color token rather than a new one — the three states reuse the established palette:

| Class | Element | Color token | Usage |
|---|---|---|---|
| `wiki-link wiki-resolved` | `<a>` | `--accent` (canonical link red, same as all in-app prose links) | A `[[X]]` that resolved to a single `.md` file_id. Rendered as a real link to `/files/<id>`. Hover uses `--accent-hover`. |
| `wiki-link wiki-unresolved` | `<span>` | `--text-muted` (dimmed text) | A `[[X]]` whose target was not found. Dashed underline affordance suggests "could become a link if you create it". |
| `wiki-link wiki-ambiguous` | `<span>` | `--accent-amber` (suggestion / warning) | A `[[X]]` that matched more than one note. The `title` attribute surfaces the candidate count so the user can hover for context. |

Rules:

- Always pair the class with the marker icon or underline so the state is conveyed visually for users with color-vision deficiencies.
- The classes are added to DOMPurify's `data-wiki-target` attribute allowlist so the wiki target survives sanitization for downstream consumers (e.g. the Knowledge unresolved-link click handler).

### 2.4 Chart-only Categorical Scale

`--graph-cat-1` … `--graph-cat-6` is a **qualitative data-visualization scale**, not part of the brand palette. It exists because data viz needs N mutually distinguishable hues for arbitrary categories (e.g. the Knowledge connections graph coloring nodes by kind / tag / folder), and the semantic accent tokens cannot serve that role: `--accent-teal` (`#103c25`) and `--accent-amber` (`#78350f`) are deep colors designed to sit *behind* text at low opacity, so as solid small node fills on the white canvas they collapse into "dark blobs" and stop being distinguishable.

| Token | Light | Dark | Role hint |
|---|---|---|---|
| `--graph-cat-1` | `#d63031` | `#e85d5e` | coral |
| `--graph-cat-2` | `#1f7a5a` | `#4caf80` | green |
| `--graph-cat-3` | `#c2740a` | `#f0a847` | ochre / honey |
| `--graph-cat-4` | `#8e4585` | `#c98bc0` | plum / orchid |
| `--graph-cat-5` | `#7c7a45` | `#bdb869` | olive |
| `--graph-cat-6` | `#3f6fa3` | `#7fa6d4` | dusty blue |

Rules:

- **Chart surfaces only** — graph nodes, legend swatches, chart segments. Never use these for buttons, links, text, borders, or any brand/UI affordance.
- The hues are earthy/warm-anchored (the single blue is desaturated "dusty", not Tailwind cool) so the scale reads as part of the coral+olive identity rather than a foreign palette.
- Each value is tuned to stay 6-way distinguishable as a **solid small fill** against the light (white) and dark (warm plum) canvases. Derive faint fills with `color-mix(... 16-18%, transparent)`; never hand-pick a separate light tint.
- Out-of-scale / "everything else" buckets and `flat` mode use `--text-muted`, not a 7th hue.
- Selection / focus / search-match **highlight** is `--accent` (the app-wide highlight), independent of this categorical scale.
- This scale does **not** violate §9 "no additional brand colors": it is documented, namespaced (`graph-cat-*`), and forbidden on brand/UI surfaces.

---

### 2.5 Description timestamp links

A media file's description renders its timestamps as inline `<button>` elements that seek the player (spec `2026-08-29-description-timestamp-links.md` §5.4). No new token — it reuses the same `--accent` that §2.3 calls the canonical in-app prose link colour.

| State | Color token | Usage |
|---|---|---|
| default | `--accent`, hover `--accent-hover` | A timestamp the player can seek to. |
| `:disabled` | inherits the paragraph's colour (`text-inherit`) | No media controller — the player has not published one yet, or never will because the media failed to load. |

Rules:

- **Do not dim the disabled state.** The usual `disabled:opacity-50` is wrong here: the disabled case is not only a brief moment during mount, it is also the permanent state when a file has no working player. A timestamp that will never do anything must read as the prose it sits in, not as a faded link.
- The button carries **no font utility**, so it inherits the surrounding paragraph's size and family. A timestamp set apart from its own sentence is the failure mode to watch for.

## 3. Typography

### 3.1 Font Stack

```css
--font-sans: -apple-system, system-ui, "Segoe UI", Roboto, "Oxygen-Sans",
  "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", Ubuntu, Cantarell,
  "Fira Sans", "Droid Sans", "Helvetica Neue", Helvetica,
  "ヒラギノ角ゴ Pro W3", メイリオ, Meiryo, "ＭＳ Ｐゴシック", Arial, sans-serif;
```

- Japanese fonts are explicitly listed — do not leave Japanese rendering to browser defaults.
- Stable on both macOS and Windows.

### 3.2 Type Scale

| Role | Size | Weight | Line Height | Notes |
|---|---|---|---|---|
| Body | inherited (16px base) | 400 | 1.6 | Body default |
| H1 | `text-2xl` (24px) | 700 | 1.35 (`:lang(ja)`) | The page's subject. One per page — see §6 "Page Header" |
| H2 | `text-lg` (18px) | 700 | 1.40 (`:lang(ja)`) | A region within the page |
| H3 | `text-sm` (14px) | 600–700 | 1.45 (`:lang(ja)`) | A label inside a region |
| Caption / Label | 11–12px | 400–500 | — | Nav auxiliary labels |
| Section header | 11px | 600 | — | UPPERCASE, English-only hardcoded labels |

This is the scale for **chrome** — the headings that name regions of the
interface. Long-form prose has its own scale in §3.3, in `em` against the
element it sits in, which is why H3 here is smaller than body text while
`.markdown-body h3` is larger: one is a label for a box, the other is a
heading inside a text.

All three sizes were blank until the UI redesign's Phase 3, and H1 had
drifted across four values in fourteen page headers as a result. Leaving one
row blank is what produced that, so a heading level that gains a rule gains
it here rather than in the component that needed it.

> **Known gap — H2 and H3 are stated ahead of the tree.** H1 has a single
> implementation (`PageHeader`) and a test that pins its size, so the rule and
> the code agree. H2 and H3 have neither: measured when these rows were
> written, core holds **16 H2s and 5 H3s at some other size** (mostly
> `text-sm`, concentrated under `app/admin/`, which UI redesign Phase 4 rebuilds
> anyway). They move as the screens holding them are next opened, not in a
> sweep — the same terms §6's button gap runs on, and for the same reason.
>
> Recording the count matters more than the rule here. A norm written with no
> measurement beside it reads as satisfied, and the next person to add an
> `<h2 className="text-sm">` will have no way to know whether they are the
> first or the seventeenth.

### 3.3 Long-form Prose (MarkdownPreview / "reading-A")

Applies wherever `.markdown-body` renders — `MarkdownPreview` (FilePreview `.md`, Ask answers, knowledge preview) and the `detailed_summary` segment wrappers. Keep these values identical across those surfaces so the reading experience is consistent.

| Element | Size | Weight | Line Height | Margin (top/bottom) |
|---|---|---|---|---|
| Body | 16px (inherited) | 400 | 1.625 | `0 0 1em` |
| h1 | 1.75em | 700 | 1.35 | `1.8em / 0.55em` |
| h2 | 1.35em | 700 | 1.4 | `1.6em / 0.5em` |
| h3 | 1.15em | 650 | 1.45 | `1.4em / 0.4em` |
| h4 | 1.03em | 650 | 1.45 | `1.2em / 0.35em` |
| Inline `code` | 0.85em | — | — | — |
| `pre` / code block | 0.85em | — | 1.6 | `1em 0 1.15em` |

- `blockquote`, `pre`, `img`, and fenced code blocks all use **12px radius** (matches §5 card radius — they are the same "long-form content block" family).
- `blockquote`: `border-left: 3px solid var(--accent)`, `background: var(--bg-elevated)`, radius `0 12px 12px 0`.
- `.markdown-body > :first-child` / `:last-child` strip outer margins so the first/last block never paints a phantom gutter against its host container.
- `.markdown-segment` variant does the same strip on the **immediate** children only — use it when MarkdownPreview is rendered inside a wrapper that already owns vertical rhythm (e.g. citation-anchored segments).
- **Consecutive images auto-group into a flex row** (`.markdown-image-group`): images written with no blank line between them (same paragraph / list item / table cell) are wrapped by the renderer into one row — each image at a fixed `height` (200px desktop, 120px below 767px), `width: auto` to keep its aspect ratio, `gap: 8px`, wrapping to a new line when it doesn't fit. A single image is unaffected and keeps the plain `img` rule above. No Markdown syntax changes; this is a preview-only renderer transform (spec `2026-07-05-markdown-image-auto-grouping.md`).

### 3.4 Reading Measure

Long-form prose has a 860px max-width cap, applied only when MarkdownPreview is rendered in `chrome=true` mode (FilePreview, Ask panel full view, knowledge preview).

- **Embedded contexts drop the cap** — `chrome=false` usage (detailed-summary segments, inline citation panels, any host that already controls its own measure) lets the parent decide width.
- Do not hard-code a max-width on MarkdownPreview callers; flip `chrome` instead.

### 3.5 Japanese Typography Rules (jp-ui-contracts)

```css
/* Base rules for Japanese */
html:lang(ja) {
  line-break: strict;
  word-break: normal;
  overflow-wrap: anywhere;
  font-kerning: auto;
  font-feature-settings: normal;
  text-autospace: normal; /* progressive enhancement */
}

/* Paragraphs, lists, definition terms */
p, li, dd {
  line-break: strict;
  word-break: normal;
  overflow-wrap: anywhere;
}

/* Headings: natural phrase-based wrapping */
:lang(ja) h1, :lang(ja) h2, :lang(ja) h3, :lang(ja) h4 {
  word-break: auto-phrase;
  overflow-wrap: anywhere;
}

/* Form elements: separate density from body text */
:lang(ja) input, :lang(ja) textarea, :lang(ja) select {
  line-height: 1.5;
}
```

**Prohibited:**
- Do not apply `word-break: break-all` globally to body text or UI labels. For machine-like strings (logs, hashes, paths, URLs) use `overflow-wrap: anywhere` via the `break-anywhere` utility.
- Do not apply `letter-spacing` beyond `0.02em` on body text without strong justification.
- Do not apply `tracking-wider` (`0.05em`) to any element that renders i18n text (which may be Japanese).

**Allowed:**
- `uppercase tracking-wider` on hardcoded English-only labels — these are unaffected. No such label exists today: the sidebar's "Drives" and "Tags" were the standing examples and both are translated as of the Phase 1 sidebar work, so `tracking-wider` appears nowhere in the app (`frontend/src/__tests__/sidebar-headings.test.ts` keeps that true). Adding a use means adding a real example here.
- `break-anywhere` utility on machine-like strings (file paths, hashes, etc.).

---

### 3.6 List row measure

A listing row's **contents** are capped at `60rem` (960px), exposed as the
`max-w-list-row` utility (`--container-list-row`). It applies to the text
column of `FileListRow` and `FolderListRow`.

- **The cap is on the contents, not on the row.** The row keeps its full
  width, so the hover band and the click target still span the listing. A
  capped row is a lit strip floating in the middle of a wide window.
- **Why there is a cap at all**: the title takes the space that is going
  and the size and date pin to the right edge, so on a 1512px screen the
  two halves of one row sit ~700px apart and the eye has to travel to pair
  them up.
- **This is not §8.5's `60rem`.** That one asks whether a rail can sit
  beside the player and is measured against a container; this one is a
  reading measure for a row. They share a number and nothing else, which
  is why this one has a name rather than a literal at each call site —
  §8.5 already warns that four thresholds must not be merged.
- **Nor is it §3.4's 860px.** That caps a column of running text, where the
  measure is about how far the eye travels back to the start of the next
  line. This caps a row, where it is about how far apart the two ends of
  one line may sit and still read as one thing. Same section, same word,
  different question.

### 3.7 Fitted page measure

A **fitted** page image is capped at **900px** wide, as `MAX_FITTED_WIDTH`
in `lib/pdfZoomMode.ts`. It applies to the PDF viewer's `fit-width` and
`fit-page` modes, **before the reader's own zoom** — which multiplies it,
to 1800px at 200%. The cap decides where fitting stops, not how large a
page the reader may ask for.

- **This is not §3.4's 860px either.** §3.4 caps running text, where the
  cap decides the line length. A rendered page is an image of a page: the
  line length is already fixed by whoever wrote it, and all this number
  decides is how far that fixed layout is scaled up. Stretching an A4 to a
  2000px canvas puts over 200 characters on a line, which is the far side
  of what §3.4 is about — the same concern, reached by a different route,
  so it gets its own measure rather than borrowing one.
- **It does not apply to `actual` size.** That mode's whole claim is that
  the page is the size it says it is, and a capped "actual size" is a lie.
  A4 at 96dpi is 794px, so the distinction only shows on paper larger than
  that.
- The cap is not explained in the UI. An explanation is owed for things
  the reader can choose, and this is not one of them.

## 4. Depth & Elevation

| Level | Treatment | Usage |
|---|---|---|
| 0 (Flat) | No shadow | Buttons, inline chrome, dense list rows |
| 1 (Card resting) | `shadow-card` token only | Media cards (FileCard / FolderCard / masonry-style grid items), MiniPlayer, mid-page floating affordances |
| 2 (Elevated surface) | `bg-bg-elevated` surface shift | Toolbars, sub-panels, banners |
| 3 (Overlay) | `shadow-lg` + `bg-bg-card` | Modals, dropdowns, context menus, command bars |

**Shadow philosophy**: Depth comes first from surface color and border-radius. Shadow is allowed only as a **single resting elevation** on media-bearing cards (Level 1) and as a **minimal overlay shadow** on dialogs and dropdowns (Level 3).

**Forbidden:**

- **Hover-shadow expansion** — hover state must change the surface color (e.g. `hover:bg-bg-elevated`), never grow or darken the shadow. The card's resting shadow stays exactly the same on hover.
- **Decorative large-offset shadows** — `shadow-2xl`, custom `shadow-[0_8px_40px_*]` / `shadow-[0_-8px_40px_*]`, or any shadow with blur ≥ 24px / opacity ≥ 0.2. Overlays (modals, command bars) use at most `shadow-lg`.
- **Stacked shadow + ring** — do not pair `shadow-2xl` with `ring-1 ring-black/*` to fake depth.
- **Decorative use on flat-surface components** — sidebars, properties panels, markdown blocks, inline chips, and ghost buttons stay Level 0 (no shadow).

**`--shadow-card` token (Level 1):**

- Light mode: `0 1px 2px rgba(33, 25, 34, 0.04), 0 1px 3px rgba(33, 25, 34, 0.04)` — barely-there separation against the warm white canvas.
- Dark mode: `0 1px 2px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.25)` — slightly lifted so cards read against the warm-plum canvas.

Use it via the Tailwind utility `shadow-card`. Do not handroll arbitrary shadow values for cards; always reference the token so every card sits at the same elevation.

---

## 5. Border Radius Scale

| Class | Value | Usage |
|---|---|---|
| `rounded-full` | 9999px | Avatars, circle buttons, filter pills |
| `rounded-2xl` | 16px | **Standard** — buttons, inputs, modals, badges |
| `rounded-xl` | 12px | Cards, containers, sub-panels |
| `rounded-lg` | 8px | Small elements inside icon containers only |

- Do not expose less than 12px border-radius on outer surfaces.
- Do not use `scale()` transforms on hover — maintain the cards' static, settled weight.

**Exception — Mobile media frames**: Video / Loft (YouTube) playback frames render edge-to-edge with **0px radius on mobile** (`<md`) to maximize the viewable frame and match platform expectations (YouTube / Netflix / standard mobile players). Desktop (`md+`) keeps `rounded-xl`. Use `md:rounded-xl` on the player wrapper and `-mx-4 md:mx-0` on the parent slot to escape the page's horizontal padding. This exception applies only to the primary playback surface, not to thumbnails, mini-player placeholders, or cards listing media.

---

## 6. Component Styling

### Buttons

**Primary (CTA)**
- Background: `bg-accent` (`#d63031` / `#e85d5e` dark)
- Text: `text-white`
- Hover: `hover:bg-accent-hover`
- Radius: `rounded-2xl`
- Padding: at least `px-4 py-2` — ensure Japanese labels have enough room

**Secondary (Sand)**
- Background: `bg-sand`
- Text: `text-text-primary`
- Hover: `hover:bg-sand-hover`
- Radius: `rounded-2xl`

**Danger**
- Text: `text-danger`
- Hover background: `hover:bg-danger/10` or `hover:bg-accent/10`
- Radius: `rounded-2xl`

**Ghost / Transparent**
- Background: transparent
- Radius: `rounded-2xl`

**Circle Action**
- Background: `bg-warm-light`
- Radius: `rounded-full`

**Disabled (every variant)**
- Background: `disabled:bg-sand`
- Text: `disabled:text-warm-silver`
- Cursor: `disabled:cursor-not-allowed`

A disabled button drops its enabled background rather than fading it. Keeping
`bg-accent` on a disabled control leaves it reading as the page's one call to
action (§2.2) — it still looks like the thing to press, and nothing on screen
says otherwise.

**Do not use `disabled:opacity-*`.** Transparency dims a control without
changing what it says: an accent button at 50% is still the accent, and the
contrast loss lands hardest on the label, which is the part that would have
explained why the button is off.

> **Known gap — the rule is ahead of the code.** Only buttons filled with
> `bg-accent` (or `bg-accent-cta`, its twin) follow this today; the enforcing
> test scans for that pairing alone. Every other variant still carries
> `disabled:opacity-*`, including the saturated `bg-accent-teal` fills with
> white labels in the intelligence summary sections, which fade in exactly the
> way this rule forbids.
>
> **Narrowed 2026-09-05 (UI redesign Phase 3, PR A1).** This paragraph used to
> promise that Phase 3 would convert *every* remaining variant with the shared
> `Button`, on the grounds that a converted button beside an unconverted
> sibling — both disabled by the same click — shows two different disabled
> states in one row. That harm is real and it is **local**: it needs the two
> buttons to share a row. It does not reach across files, and there are 88
> such call sites across five repositories. (Counted by `className` value,
> which is the unit the enforcing test uses. A line-based count says 95 and
> is wrong: one class list can span several lines.)
>
> A pull request that moves 88 call sites cannot be reviewed. That is a
> quality argument, not an effort one. Phase 2 measured it: independent review
> ran 98 mutations against work its author had already mutated ~49 times, and
> 28 survived the first pass — two of them defects that had already shipped.
> **A PR too large to review is a PR that goes unreviewed, so making one large
> is itself a decision to pass defects through.** The local harm gets the
> local fix instead.
>
> **Progress: 31 of the 40 converted, 9 remain.** The first 13 were
> the call sites under `frontend/src/components/` (PR A2b); 11 more came from
> media_import in C1 and intelligence in C2a and C2b, and 7 from
> knowledge in C3. Every addon pointer has moved. The population fell from 43
> to 40 when knowledge's unreachable two-pane view was deleted, taking three
> converted sites with it — `ClipInput`, `FolderView` and `MoveDialog`; the
> fourth deleted file that held one, `UnresolvedLinkDialog`, came back in
> review. The 9 unconverted are untouched by that. Of the 9 left, seven are
> core — four in the first-run wizard and one on the unlock gate, brand
> surfaces outside the AppShell, plus two under `app/admin/`, which 案 15 /
> 案 16 rebuild in Phase 4 — and two are cloud-sync's and stay, per the
> paragraph above.
>
> `src/__tests__/button-adoption.test.ts` holds that list per file, across core
> and every addon, so the set cannot change without an edit to it. Its first
> version scanned core alone and so measured 20 of the 43 the population then
> held — a scope that leaves out 23 sites cannot be contradicted by them,
> which is the failure this paragraph's own numbers exist to prevent.
>
> **Only the 9 is checked.** That test asserts the unconverted sites per file
> and their total; 40, 31 and 38 are historical bookkeeping that no test can
> recompute, because "converted" is a fact about a file's past and the tree
> holds 50 `<Button>` call sites for every reason including this one. They
> are kept honest by being derived here from measurements, and by being wrong
> once already: the four this paragraph first blamed on the deletion were
> counted before one of the four files came back in review.
>
> **What Phase 3 converts: 38 sites.** 40 carry the
> `disabled:bg-sand` treatment, all of them accent fills — the one exception
> was an accent *tint* on knowledge's folder pane, converted in C3 and
> deleted with the pane — and two of those 40 are
> cloud-sync's, which stay. Add to the 38 any non-accent sibling inside a file
> Phase 3 opens for another reason. The rest move opportunistically, when a
> later change touches the row they sit in — the same terms §2.2 gives the
> accent fills that are not yet on `Button`.
>
> **`addons/cloud-sync` is deliberately not converted**, and the reason is not
> the one first written here. `SyncDriveCard.tsx:187-205` already puts a
> `disabled:bg-sand` button and a `disabled:opacity-50` button in one
> `flex gap-2` row, so "two disabled treatments in one row" is not hypothetical
> there — it is on screen today. What keeps it harmless is that the two are
> driven by *independent* flags (`actionLoading` and `logLoading`), so they are
> never disabled by the same click and the reader never sees the two treatments
> side by side in the same state. That is a narrower guarantee than the original
> wording claimed, and it is the one that actually holds. **If those flags are
> ever merged, this exemption expires** — which is why the reason is recorded
> and not just the conclusion. Still a decision, not an oversight: do not open
> that repository to "finish" the sweep without re-reading this paragraph.

### The `Button` component

`frontend/src/components/Button.tsx` renders the five variants above. Reach for
it rather than writing the classes out; the variants exist here so that a
recipe can be corrected in one place, and a hand-written class list is a copy
that will not receive the correction.

```tsx
<Button variant="primary" onClick={add}>Add files</Button>
<Button iconOnly aria-label="Delete Q1 notes" variant="ghost"><Trash2 size={18} /></Button>
```

- **`variant` defaults to `secondary`.** A default of `primary` would spend the
  page's one accent fill (§2.2) every time a caller left the prop off.
- **Three sizes, and they were counted rather than chosen**: `sm`
  (`px-3 py-1.5 text-sm`), `md` (`px-4 py-2 text-sm`, the default) and `lg`
  (`px-5 py-2.5 text-sm`). These are the values the tree already used — nine
  call sites on `md`, four on `sm`, four on `lg`. The component's first draft
  invented `sm` as `px-3 py-1.5 text-xs`, which matched nothing: a scale
  written without measuring what it was replacing, which is how five sizes
  came to exist. (Exact on padding; on type size three of the four `lg` sites
  used `text-sm` and one used `text-base`, which the scale rounds down.)
  **A labelled button is sized by padding, never `h-*`**, so a Japanese label
  that wraps grows it instead of being clipped. An `iconOnly` button is the
  exception and is a fixed `h-8 w-8` square — it has no label to wrap, and the
  hit-area arithmetic needs a known box.
- **`iconOnly` requires `aria-label` in the type.** A `<button>` holding one
  `<svg>` has no accessible name at all, and nothing at runtime says so. The
  type can insist a name exists; only review can insist it is *entity-specific*
  ("Delete Q1 notes", not "Delete"), which repeated icon-only controls need
  (hako `Prwd_iaXmCjWfY24KjFz2`).
- **`iconOnly` also grows the hit area on `pointer: coarse`**, by the §Row
  Actions recipe — the overhang, not the box, so the icon stays 32px at every
  pointer type.
- **Hover is written `enabled:hover:`.** A bare `hover:` repaints a *disabled*
  button under the cursor, which is the defect the Known gap above names for
  `disabled:hover:bg-accent`. Guarding it inside the variant means a call site
  cannot forget.
- **A link wearing this recipe takes `buttonClass()`, which un-guards the
  hover.** CSS `:enabled` matches form elements — `button`, `input`, `select`,
  `textarea`, `optgroup`, `option`, `fieldset` — and never an `<a>`, so the
  guard above silently removes the hover state instead of conditioning it, and
  the `disabled:` classes beside it are unreachable markup. `buttonClass` emits
  bare `hover:` and no `disabled:` for that reason, and adds the coarse-pointer
  floor `Button` gives only its icon-only shape. The condition the guard exists
  for — a disabled control repainting — cannot arise on an anchor.
  **A destination is a link; only an action is a `Button`.**
- **`className` is for layout only** — width, margin, flex. A colour passed
  here is a variant that should have been added above.

### Page Header

`frontend/src/components/PageHeader.tsx`. One header for every screen that has
a subject. Fourteen styles were in the tree before this existed.

Composition, top to bottom:

| Part | Prop | Notes |
|---|---|---|
| Trail row | `leading`, `breadcrumb` | `leading` is a small navigation control (today only `<TreeToggle>`) and stays leftmost |
| Subject row | `titleIcon`, `title`, `scope`, `actions` | `title` becomes the `<h1>` at the §3.2 size |
| Tab row | `tabs` | A `<PageTabs>`, or nothing |

- Padding `px-4 py-2`, rows separated by `gap-1`.
- **Omit `title` when the breadcrumb is the subject.** Folders and the inside of
  an archive name themselves in the trail; a heading repeating the last segment
  states one subject twice. No `title`, no `<h1>`.
- **`scope` is one line under the subject**: counts, duration, state, drive
  name. With no title it joins the trail instead — "Documents / 2024 · 138
  items" reads as one subject with its measure, where a second row reads as two.
- **`leading` joins the first row that exists**, so the tree toggle does not
  move between folder mode (trail) and search mode (subject).
- The component renders and holds no state. The Container/Presenter split in
  `.claude/rules/frontend-conventions.md` applies where state *and* UI are both
  non-trivial; here half is missing.

### Tabs

`frontend/src/components/PageTabs.tsx`. **Underline tabs, and only underline
tabs.** Selected is `border-accent font-semibold text-text-primary`; unselected
is `border-transparent text-text-muted`.

The border costs no layout: both states carry `border-b-2` and only its colour
changes. **The weight does** — `font-semibold` is wider than the unselected
400, so the selected label grows and its neighbours move by a pixel or two.
That is accepted rather than overlooked. Weight is a second, non-colour signal
for which tab is current, and dropping it would leave a 2px accent underline as
the only one, which is the thing §2.2 warns against for a different reason.
(An earlier draft of this section claimed "nothing shifts". It was wrong, and
the mutation that proved it — deleting `font-semibold` — went unnoticed by
every test.)

Two styles were retired for it. The pill (`ModeTabs`) painted its selected tab
`bg-accent text-white` — the page's one accent fill (§2.2) spent on saying which
tab you are already looking at. The segmented control on `/admin/settings` is a
third; it survives until that screen is rebuilt (UI redesign Phase 4) and is the
one exception in the tree.

- **A row that navigates is not a tablist.** `role="tab"` promises a screen
  reader that activating the control swaps a panel in this view; a `<Link>`
  replaces the page. `PageTabs` decides from the items: any `href` and the row
  is a `<nav>` whose current item carries `aria-current="page"`; none, and it
  is a `role="tablist"` whose current item carries `aria-selected`. Do not set
  both, which is what `ModeTabs` did — and note that this cuts both ways:
  `aria-current="page"` on a tab that swaps a panel is the same conflation
  running the other direction, so the tablist branch does not carry it.
- Tabs clear the 44px floor on `pointer: coarse` (`pointer-coarse:min-h-11`).

### Selected-state controls (segmented toggles, tabs)

A control that says **which of N equal options you are in** — the grid/list
toggle, a tab row — marks the selected one with a **border in the accent
colour**, never with a fill.

- A fill would spend §2.2's one accent per screen on a state indicator rather
  than on what the screen is for. A 2px border is not a fill.
- **A surface cannot carry this selection at this palette, and the arithmetic
  is the reason.** `--bg-card` and `--bg-primary` are both `#ffffff` in the
  light theme, so a card-coloured selected state *is* the page background
  (1.00 : 1) wherever the control sits directly on the page. Measured against
  every surface token, the best available was `--sand` at 1.23 : 1 light and
  1.28 : 1 dark. The accent border measures 4.85 / 5.53 against the page and
  4.48 / 4.83 inside a `--bg-elevated` pill, clearing the 3 : 1 that WCAG
  1.4.11 asks of a state indicator.
- **Give the unselected control `border-transparent`, not no border**, so the
  box is the same size in both states and nothing shifts on selection.
- The tab row's weight change (§Tabs) is a second, non-colour signal. A toggle
  showing only icons has no text to thicken, which is why its border is doing
  the whole job and has to clear 3 : 1 on its own.
- **On a crowded bar, prefer a labelled menu to a segmented toggle.** The
  border says *which* option is on; it cannot say what the options are, so a
  segmented toggle of icons puts N wordless controls on the bar to express one
  choice. A menu whose face reads the option that is on — `View: List view`,
  `Sort: Newest first` — spends one control, carries a word at every state,
  and grows without taking more width. Use it where the bar is competing for
  room or where N is above two; the toggle stays where the two options are
  glanceable and the row has space (the drive home, Trash, a collection,
  Missing, inside an archive). The name is `label: state`, so WCAG 2.5.3's
  containment holds while the control is still findable by what it does.

### Cards

- Radius: `rounded-xl` (12px)
- Background: `bg-bg-card`
- Shadow: `shadow-card` resting only on media-bearing cards (FileCard, FolderCard, MiniPlayer). Dense list rows and inline cards stay flat (no shadow).
- Hover: surface color change only (e.g. `hover:bg-bg-elevated`). **Never expand or darken the shadow on hover, and never use `scale()`.**

### Inputs

- Radius: `rounded-2xl`
- Border: `border border-bg-border` or `border border-warm-silver/40`
- Focus ring: `var(--focus-ring)` (`#435ee5` light / `#617bff` dark)
- Line-height: automatically applied by `:lang(ja)` rules (1.5)

### Modals / Dialogs

- Radius: `rounded-2xl`
- Background: `bg-bg-card`
- Button order: Cancel (`bg-sand`) then Confirm (`bg-accent`)

### Header

- Height: `h-14` (56px)
- Position: **`sticky top-0 z-20`** — stays pinned to the viewport top during body scroll. The sidebar floats above at `z-40`; the floating menu button sits at `z-50`.
- Contains no menu/hamburger of its own; see §Sidebar for the shared floating menu button.

### Sidebar

- Background: `bg-bg-sidebar`
- Active link: `bg-bg-elevated rounded-2xl font-medium`
- Composition, top to bottom: **logo → current drive → views → addons → reorderable sections → Lock.**
  The drive you are on is one row at the top that opens the others, not a list at the bottom: it is
  where you are, and the sidebar reads as a place before it reads as a menu. Off a drive (root, `/admin`)
  that row names the list instead — "Drives (N)" — and folds the same way. The views carry no heading — a
  heading over the whole top of the column labels nothing, since there is nothing beside it to tell it
  from. The four reorderable sections (collections / pins / smart folders / tags) keep their own headings
  because their order is the user's to change.
- Section headers: see §Section Header Labels. The sidebar's size is `text-[11px]`, and every one of them is drawn by `SidebarSectionHeading` — including the vertical margin, which is the component's and never a parent's.
- Position: **always `position: fixed top-0 left-0 h-dvh z-40 w-60`**. Does not scroll with page content, independent of breakpoint.
- Two display modes (derived state, `isOverlay = routeOverlay || narrowViewport`):
  - **Inline** (viewport ≥ 1200px, non-overlay routes): no backdrop. The outer layout adds `min-[1200px]:pl-60` to reserve space so content sits beside the sidebar. Toggling persists to `localStorage["sidebar-open"]`.
  - **Overlay** (viewport < 1200px, **or** file detail / knowledge addon at any width): slides over content with a `z-30 bg-black/50` backdrop. Closes on backdrop click and `ESC`. Body scroll is locked while open. State is ephemeral — not persisted.
- Transitioning into overlay mode forces closed initial state; transitioning out restores the persisted global preference.

- Nav-item click behavior: **inline mode keeps the sidebar open** across navigations; **overlay mode closes it** before the route change so the backdrop is gone on arrival. The hamburger, backdrop click, and `ESC` always close regardless of mode. Overlay mode and inline mode share the same sidebar layout — no empty top bar; the first visible row is the logo.
- Menu (hamburger) button lives outside the sidebar as a `fixed top-3 left-3 z-50` floating control, visible in all states (sidebar open or closed, inline or overlay). The sidebar's logo row uses `pl-12` so the button visually sits in the sidebar's top-left without overlap.
- Transform transition: `duration-150 ease-out`. Layout padding transition: `duration-150 ease-out`.

#### The three axes of "where you are"

The sidebar's location surface has three independent pieces of state. **They are not
merged**: each answers a different question, and collapsing any two makes one of the
answers unreachable.

| Axis | Owner | Persisted | Default | Off a drive (`/`, `/admin`) | On a drive |
|---|---|---|---|---|---|
| Is the sidebar open? | `SidebarProvider.isOpen` | `localStorage["sidebar-open"]` | open | same | same |
| Is it lending its place? | `SidebarProvider.routeOverlay` ＋ `narrow` | no | not lending | width only — there is no tree here | width, **or** the folder tree being open |
| Is the drive list open? | `SidebarDriveSwitcher.open` | no | folded | opens from the "Drives (N)" row | opens from the current-drive row |

**One exception, on both sides of that last row.** With a single visible drive
there is nothing to fold into and nothing to fold: on a drive the current-drive
row is a label rather than a button, and off one there is no fold row at all and
the list is drawn open. Folded or open it is one line either way, so a control
would turn one line into two — and a choice between one thing is not a choice.

**Exclusivity (NAV-2).** The sidebar and the folder tree both name where you are, and
design principle 3 allows one such surface at a time, so the tree borrows the sidebar's
place while it is open. Three rules follow:

1. **Borrow, do not take.** The borrower asks for overlay mode
   (`useOverlaySidebarWhen`), never `close()`. Overlay stops the sidebar taking width and
   forces it shut, restores the stored preference when the borrower is done, and leaves
   `localStorage` untouched — `close()` writes `false` into it, so "put it back when I
   close the tree" could not hold. The hamburger still opens the sidebar over the top
   meanwhile: nothing is taken away, only moved.
2. **The breadcrumb stays.** `PageHeader` draws it in every combination of the two, so
   the path is readable whichever surface is showing.
3. **Both controls show their state.** `TreeToggle` and the hamburger each carry
   `aria-pressed` and the active-link treatment (`bg-bg-elevated text-text-primary`) when
   on. No accent fill — the screen's one fill belongs to its one action.

Below 1200px the sidebar is already an overlay, so the tree's request changes nothing and
the exclusivity is invisible rather than special-cased.

**The drive list's default is a default, not a suppression.** The first two axes restore
what the system took away; this one was never taken, so there is nothing to restore and
nothing to persist. It folds when the drive changes — including to and from "no drive" —
so `/` is not a state the sidebar remembers.

**Thresholds are per question.** The tree uses `md` (768px): can the tree and the content
sit side by side? The sidebar uses 1200px: can the sidebar and the content? Two questions,
two numbers, and merging them would answer one of them with the other's measurement.

### Inspector tab strip

The row of tabs under the inspector's fixed header. One strip, one
place: the file detail inspector is the only surface that has one, and
what it is made of is decided by the file rather than by the layout.

- **One tab is no strip.** A single-tab strip is chrome answering a
  question nobody asked, so a Markdown note ends up with the shape it
  has always had — no strip drawn at all.
- **A core tab with no content is not a tab.** A tab is a row, and a row
  that only announces a feature could exist is the thing the 2026-09
  redesign set out to remove. So an archive gets a page-list tab *when
  there is a page list*, and it appears the moment that list is
  implemented, without anyone editing the strip.
- **An addon tab is content-gated by the entry, not by core.** Core
  cannot ask "will you render anything for this file" without naming the
  addon, so it does not ask: it hands every `player-side` entry an
  `onAvailability(boolean)` — the generic form of the `onResolved` its
  own `ChaptersPanel` already uses — and an entry that answers `false`
  loses its button. **Silence means available**, so an entry that never
  calls it behaves exactly as it did before the signal existed.
- **An unlisted tab keeps its panel, mounted and `hidden`.** The panel
  is the thing doing the reporting: drop it on the first "nothing" and
  that answer becomes permanent, so a transcript still fetching when it
  first answered would never get its tab back. It also cannot be
  selected, and the arrow keys walk past it.
- The same answer decides the page row's beside/below toggle and, in the
  below form, whether the canvas box is drawn — `data-occupied="false"`,
  which hides it in CSS rather than removing it, for the same reason.
- Composition: **core before addon**, addons in the priority their
  manifests declare. Nothing in the strip knows an addon's name; a tab
  is a slot entry, and its label comes from that entry's `i18n_key`
  falling back to its manifest `label`.
- Button: `px-3 py-2 text-xs font-medium`, `border-b-2` as the selected
  indicator — `border-accent text-text-primary` selected,
  `border-transparent text-text-muted` otherwise. The underline is the
  state, not a fill: §2.2 keeps `accent` fills to one per screen, and
  the page already spends it elsewhere.
- **Roving tabindex.** One tab stop for the whole strip; `←` / `→` move
  within it and take the focus with them. Every tab being its own stop
  is what makes a long strip tedious to get past.
- **Scrolls, never wraps** (`overflow-x-auto`). A control row that wraps
  to two lines takes the height back off the region it is labelling, and
  the mobile sizing rules forbid it outright.
- **Every panel stays mounted; only the selected one is shown**
  (`hidden`, not conditional rendering). The occupants hold fetches,
  clock subscriptions and scroll positions — see §8.5 — so switching
  tabs must move attention, not rebuild the panel. It also keeps every
  `aria-controls` pointing at an element that exists.
- Touch floor per §Row Actions: `pointer-coarse:min-h-11` on the strip
  and on its buttons.

### Context Menus / Dropdowns

- Radius: `rounded-2xl`
- Danger item: `text-danger hover:bg-accent/10`

### Layering

Stacking is tiered. Pick the tier by what the element *is*, not by
picking a number one higher than whatever it currently sits under.

| Tier | `z` | What belongs here |
|---|---|---|
| In-flow chrome | `z-10` – `z-30` | Sticky bars, the header (`z-20`), the file-detail inspector where it has to cover the canvas rather than sit beside it (`z-20`, §8.5), popovers anchored to a control, the sidebar backdrop (`z-30`) |
| Floating surfaces | `z-40` | Sidebar in overlay mode, mini-player, upload progress, bottom-anchored mobile menus including the file detail sheet's resting strip |
| Inspector sheet | `z-[45]` / `z-[46]` | The mobile Bottom Sheet — above every floating surface, below every dialog |
| Modal dialogs | `z-50` | Confirm / Rename / Move and anything else that interrupts to ask a question, including addon dialogs |
| Immersive viewers | `z-[60]` | Full-screen image gallery and archive viewer, which replace the page rather than overlay it |
| Always on top | `z-[100]` | Shortcut cheat sheet, quick note, file save, toasts |

**A panel that has run out of room is still in-flow chrome.** The
inspector covers the canvas at widths where it cannot sit beside it, and
that makes it look like a floating surface — but pick the tier by what
the element *is*. It is part of the page's layout, not something
floating over it, and putting it at `z-40` buried the mini player
outright: that is ~320px against the right edge, entirely inside the
panel's 384px band, so its close and restore buttons went with it. At
`z-20` it also sits under the sidebar's backdrop, which is right — the
sidebar is modal while open, and a bright interactive panel above its
dim is the page claiming to be two things at once.

**An immersive viewer takes the page out of reach, not just out of
sight.** Its surface is opaque and covers everything, so nothing signals
that the page is still live underneath — yet every control back there stays
focusable, and a scroll the viewer does not consume moves the page. While
one is open it marks every subtree outside itself `inert` and locks the body
scroll, restoring both on close. `useInertBackdrop` does this; attach its ref
to the viewer's root rather than reaching for `document.body`, which a viewer
rendered inline is itself inside.

**The Bottom Sheet rests; it does not close.** Three states, not two:

| State | Height | What is on screen |
|---|---|---|
| peek | `56px` | The file's name and the row that acts on it — like, favourite, the AI menu, the overflow |
| half | 50% | The inspector's fixed part, the tab strip, and the tab |
| full | 90vh | The same, with room for it |

The resting state is the point. On a phone the per-file controls used to
be somewhere in a column the reader had to find; at 56px they are in the
same place on every file, and the page ends above them rather than
behind them.

**The drawer exists only while it covers the page; the strip is drawn
outside it.** vaul hands Radix's `Dialog.Root` nothing but `open`,
`defaultOpen` and `onOpenChange` — its own `modal` prop never reaches
Radix, which therefore defaults to modal and calls `hideOthers()` on
every other body child. A drawer mounted at rest puts
`aria-hidden="true"` on the whole application, on every file page a
phone opens, for as long as it is open. The page stays scrollable, so
nothing looks wrong; it is simply gone for anyone using a screen reader.
**Passing `modal={false}` does not avoid this** — it controls vaul's own
scroll-lock and pointer-events extras and nothing about Radix.

The cost is that what is below the strip unmounts on collapse and
refetches on the way back up. That is what a closed sheet already did,
and it is the cheaper of the two prices.

**The player is stuck to the top of the canvas on a phone, in CSS, and
is never told about the sheet.** The sheet's state is published as
`data-sheet-snap` on the shell root and read by a stylesheet.

It has to be that way round. Handing the state down means re-rendering
the player, and re-parenting it — which a portal does by `appendChild` —
reloads any `<iframe>` in the subtree by the browser's own rule. A
`.loft` embed loses its position, its player state and its API binding;
a remounted `<video>` restarts at zero with `ended` rebound, which is
how a completion path comes to write a position nobody played
(`.claude/rules/design-decisions.md`, watch history). The element stays
where it is and only its position changes — the same conclusion
`MiniPlayerContainer` reached for the desktop mini player.

**Sticky goes on the element that can travel.** A sticky box moves only
within its own containing block, so putting it on a wrapper that
contains nothing but the player gives it nowhere to go and it scrolls
away like anything else. It belongs on the child of the tall thing.

**At `full` the player is behind the sheet, and stays there.** Docking
it into the strip the sheet leaves was tried and does not work: at
`full` vaul is modal, so everything outside the drawer is inside
Radix's `hideOthers()` — a docked player there is under the dim, inert,
and hidden from a screen reader. Putting it *inside* the drawer means
re-parenting, which is the one thing forbidden above. `full` is the
state for reading, and `half` is one drag away.

**The resting strip owns `bottom-0` on the file surface.** It is
full-width and permanent, so nothing else bottom-anchored may share the
screen with it. Today nothing does — the mini player is desktop-only by
breakpoint, and the upload toast lives in the folder listing that the
two-pane layout replaces when a file is open — but both of those are
consequences of other decisions rather than of this one. Anything new
that anchors to the bottom of a file page has to go above the strip, not
beside it.

**Fade the backdrop from the first snap point.** vaul defaults
`fadeFromIndex` to the *last* one, which leaves `half` — the state the
toggle opens — covering the page with no dim to say so, and a tap
outside then collapses the sheet with nothing on screen having
explained why.

A dismiss gesture — the backdrop, Escape, a swipe down — collapses to
peek. There is no closed state to dismiss to, and refusing the gesture
would leave a reader who tapped the dim with nothing happening.

**A dialog must outrank the surface that launched it.** The mobile
Bottom Sheet hosts the same inspector the desktop pane does, `[...]`
menu included, so a dialog opened from inside it has to paint above it —
that is why the sheet sits below the dialog tier rather than at the top
of the stack.

Correct stacking is necessary but not sufficient there. The sheet runs
vaul in `modal` mode, which puts `pointer-events: none` on `<body>` and
`aria-hidden="true"` on every other body child — a dialog portalled
beside it would be stacked correctly and still be inert. So **a dialog
never hard-codes `document.body`**; it portals into
`useDialogPortalTarget()`, which is `document.body` everywhere except
inside the sheet, where the sheet hands out a host in its own subtree.

The host sits inside `Drawer.Content`, but a `fixed inset-0` dialog
placed there still resolves against the viewport and covers the whole
screen — verified in the running app. Were vaul to leave a transform on
`Drawer.Content` at rest, that ancestor would become the containing
block and the dialog would be confined to the sheet instead; it does
not today.

### Over-video chrome (player controls, mini-player buttons)

Chrome that sits **on top of a video frame** is the one place that deliberately ignores the light/dark theme tokens. The backdrop is the video itself — near-black in practice — so theme-following surfaces would render pale controls on a black frame in light mode and become unreadable.

- Foreground: `text-white`. Secondary text: `text-white/70`. Dividers and inert marks: `text-white/50`.
- Button surfaces: transparent at rest, `hover:bg-white/15`. Standalone circular buttons over video (mini-player `×` / `↩`) use `bg-black/70 hover:bg-black/90`.
- Button sizes: `h-11 w-11` (44px) in a control-bar row. A transport button placed **standalone over the frame** on touch steps up to 64px.
- Large standalone buttons use a **lighter** disc than the small ones: `bg-black/50 hover:bg-black/70`. Opacity that reads as a subtle backing at 32px reads as a heavy blob at 64px — the disc exists for legibility, and past a certain size it starts covering the video instead.
- Control-bar backdrop: a scrim gradient, `bg-gradient-to-t from-black/80 via-black/50 to-transparent`. This is legibility, not decoration — it is not a shadow and is not subject to §4's shadow ban.
- **Over an embedded player** (YouTube and anything else we do not draw ourselves) the scrim is stronger and blurred: `bg-gradient-to-t from-black/95 to-black/60` plus `backdrop-blur-[3px]`, on its own `-z-10` layer so the controls above it stay sharp. The embed draws chrome of its own in the same strip — YouTube's pause overlay puts a share pill, a related-video card and its wordmark exactly where the transport and right-hand controls sit — and a thin scrim lets it read as a second, broken row of controls. The blur demotes it to a backdrop.
  - The blur needs `[mask-image:linear-gradient(to_top,black_0%,black_55%,transparent_100%)]` (and the `-webkit-` twin). A gradient fades the tint but not the blur, which would otherwise end at a visible horizontal seam.
  - **Revert to the plain scrim while the embed owns the frame** (ad, end screen). Those surfaces carry the skip button and the links the viewer needs; obscuring an ad's controls also breaches the embed terms.
- Track fills: `bg-white/25` (empty), `bg-white/40` (buffered), `bg-accent` (played), `bg-accent` (volume level). `--accent` reads clearly against black in both themes. A range input over video paints its own track — the shared range styling leaves the native one transparent, so an input without a painted line renders as a knob floating in space.
- Focus rings still use the themed `ring-focus-ring` token — focus visibility must not depend on the surface.
- Radius follows §5 as normal (`rounded-2xl` for buttons and inputs).
- **Transient gesture feedback** (what a touch gesture just did, with no button of its own) is the one place a half-disc appears: `w-1/2` filled `bg-white/15`, rounded on its inner edge only (`rounded-r-full` on the left half, `rounded-l-full` on the right). It carries an icon plus a label, animates in with `animate-fade-in-scale`, and clears itself. It is `aria-hidden` — the same operation must also be reachable as a real button or shortcut.
- **Transient state pills** (a mode that is on right now, e.g. a held speed boost) use `bg-black/70 rounded-2xl` and sit clear of the control bar, at `top-4` centred.
- **Player settings** are one panel (`bg-black/85`) rendered inside the frame, in two shapes: a full-width sheet rising from the bottom edge on touch, and a `w-64` `rounded-2xl` popover parked above the button that opened it on mouse. The popover skips the dimming backdrop — a mouse user sees the whole frame at once and the panel covers very little of it. Settings do **not** go in the bar as bare native controls: a `<select>` there is sized by its widest option and drawn by the OS, so it matches nothing else in the row.

Do not "fix" these to semantic surface tokens. Everything **outside** the video frame (metadata panels, action bars, mini-player placeholder) uses the normal themed tokens.

### Tables ("quiet editorial" style)

Default table aesthetic for MarkdownPreview and any other reading-surface table. The idea: **dividers and font-weight alone carry structure** — no fills, no zebra, no cell grid.

- `border-collapse: separate; border-spacing: 0` (so individual cells can carry their own accent border without colliding with neighbour cells).
- `th`, `td`: `border-bottom: 1px solid var(--bg-border)`, padding `0.6em 0.85em`, `text-align: left`, `vertical-align: top`.
- `thead th`: **no background fill** — the bottom rule + `font-weight: 650` carries the header role.
- No zebra stripes, no cell side-borders.
- **Exception**: vertical-header tables (`tbody th`) may keep a subtle fill on the header column to distinguish the axis.
- Mobile (`max-width: 767px`): trim table `font-size` to `0.93em`. Do not reflow — horizontal scroll is preferred to structure loss.

### Search result timestamp pills

- Colour: **`text-text-muted`**, with `hover:bg-accent/10` kept.
- Not `text-accent`, and specifically **not** the rule §2.5 gives timestamp
  links inside a description. There the timestamp is the thing being offered;
  in a result row it is the third rank of information, under a title that is
  not accented itself, and a row full of accent spends the screen's loudest
  colour on "there is also a hit at 13:19".
- The colour went and the affordance did not: the pills are still links, and
  still light up under the pointer.
- At most three per hit, de-duplicated on the whole second, with a quiet
  `+N` for the rest. One rule for both surfaces
  (`frontend/src/lib/matchTimestamps.ts`).

### Search Snippet (MatchOverlay excerpt row)

The one-line excerpt showing *where* a search hit matched, inside a file card or list row. It is a quotation in a dense surface, so it deliberately does **not** reuse the long-form `blockquote` treatment from §3.3 — a `bg-bg-elevated` fill would read as a nested card in the grid, and it collapses into the row's own `hover:bg-bg-elevated` state.

- Marker: `border-l-2 border-bg-border pl-2` — a rule, never a fill, never the accent border reserved for §3.3 prose blockquotes.
- Text: `text-[11px] leading-relaxed text-text-muted`, clamped with `line-clamp-2`. The excerpt is truncated in the data layer too, so a long source never ships into the card's DOM.
- **One snippet per hit.** Do not stack a row per match — the badges and timestamp pills above already enumerate the evidence, and repeating a timestamp as a text row shows the same fact twice.
- Row actions follow the general rule below; the excerpt adds one constraint of its own — keep the action's box in flow at `opacity-0`, so revealing it never reflows the excerpt.

### Row Actions

A control repeated once per row — the capture button on a search snippet or a
transcript line, a `⋮` on a list row. Written once here because three surfaces
were hand-rolling the same recipe and drifting apart.

- **Trailing edge of the row**, in flow, sized so revealing it reflows nothing.
- **Hidden by default, revealed by the row.** Put `group/<name>` on the row and
  `opacity-0 group-hover/<name>:opacity-100 group-focus-within/<name>:opacity-100`
  on the action. The group goes on the **row**, not the action: focusing the row's
  primary control has to reveal the secondary one, or the keyboard path is the one
  path that never shows the control it needs.
- **`opacity-0`, never `hidden` / `invisible` / `display: none`.** Those take the
  action out of the tab order, and `group-focus-within` then has nothing to fire on.
- **Always visible under `pointer-coarse`.** `group-hover` compiles inside
  `@media (hover: hover)`, so a touch device gets no reveal at all without it.
- **A name per row, not per control.** Several hundred identically-named buttons
  give a screen reader no way to tell which row is about to be acted on. Put the
  row's identity in the accessible name — a timestamp, a filename. Do not also set
  `title` to the same string: with an `aria-label` present it becomes the accessible
  *description*, which NVDA and JAWS read after the name, so the sentence is
  announced twice.
- **Touch targets: 44px on `pointer: coarse`, 32px on `fine`.** The 44px floor is
  stated under the mobile sizing rules, so it governs touch input and says nothing
  against a dense list on a desktop — where 32px already clears the 24px minimum for
  repeated icon-only controls (hako `Prwd_iaXmCjWfY24KjFz2`). The two rules agree;
  neither asks for 44px everywhere. Applying it everywhere is not free either: a
  transcript runs to several hundred rows, and that extra height comes straight off
  what fits in the mobile sheet the floor exists to protect.

  Reach it on **the row**, with `pointer-coarse:min-h-11`, and give the row's own
  controls the same class wherever `items-start` stops them inheriting that height.
  Not on one control: the row is what both of them are asking to be big enough, and a
  list whose secondary action clears the floor while its primary one does not has
  bought nothing.

  Then grow the *action's* hit area rather than its box — `relative` plus
  `pointer-coarse:before:absolute pointer-coarse:before:-inset-1.5` — so the icon
  stays 32px at every pointer type. The 44px row is also what makes that overhang
  safe: at a shorter pitch, adjacent pseudo-elements overlap and the later row wins
  the hit test, so every control silently keeps less than it looks like it has.

### Section Header Labels (i18n)

The label above a group of rows — an admin section, a sidebar section. This is the
upper rule; §Sidebar defers to it rather than stating its own.

Common to every surface:

- `font-semibold text-text-muted`
- Do **not** use `tracking-wider` — these render Japanese text (§3.5)
- Do **not** use `uppercase`. It does nothing to Japanese, so on a column that mixes
  scripts it stops being the thing that makes the headings look alike — it becomes one
  more axis they differ on. This is why Phase 0's `tracking-wider` fix made the
  remaining difference visible rather than removing it.

Size is the one thing that varies, because density does:

| Surface | Size |
|---|---|
| Admin / setup sections | `text-sm` |
| Sidebar sections | `text-[11px]` |

The sidebar is `text-[11px]` and not `text-sm` because its rows are `text-sm`: at the
same size the heading and the rows below it stop being two levels.

**Addon surfaces are not there yet.** Fourteen labels across three addons still
carry `uppercase` — most of them `<h2>` / `<h3>` section headings, not the
field labels the first count called them. Counted as occurrences of
`uppercase` in each addon's non-test `.tsx`, so the table can be checked
rather than remembered:

| Addon | Count |
|---|---|
| `media_import` | 11 (`SubscriptionDetailPanel`, `Page`, `Composer`, `ActivityFeed`) |
| `knowledge` | 2 (`ActiveSummarySection`, `graph/GraphControls`) |
| `intelligence` | 1 (`FailedJobsModal`) |

Knowledge's row was 8 before its unreachable two-pane view was deleted; four
of the files that carried them went with it. The media_import row read 10 and
measures 11, and the 10 was wrong when it was written rather than overtaken
by a later change: the count is 11 at the pin that commit carried, and
`git log -S uppercase` shows no change since.

They are the same shape and want the same sweep; it reaches three submodules, so
it is deferred rather than smuggled into the change that wrote this rule.
**New addon headings follow the rule above** — the fourteen are a backlog, not a
precedent. `frontend/src/__tests__/sidebar-headings.test.ts` enforces the rule in
core only, for that reason.

The one exception already closed is `cloud-sync/CloudSyncWidget`: it renders into
core's `dashboard-widgets` slot, so it shared a screen with `/admin`'s own
headings and the mismatch was visible on one page rather than across two.
**An addon heading that lands inside a core surface is not part of the backlog** —
it is a violation the moment core's neighbouring headings change.

### Properties Panel (Obsidian-style frontmatter display)

Machine-readable frontmatter of a Markdown note (`---\nkey: value\n---`) is presented above the rendered body as a compact label-value table. See spec `2026-04-24-knowledge-frontmatter-schema-and-display.md`.

- **Container**: `rounded-xl overflow-hidden border border-bg-border bg-bg-elevated` — **matches `.markdown-body pre` exactly** (same 12px radius, same 1px border, same elevated fill). Properties Panel is the metadata counterpart to code blocks in the "long-form content block" family described in §3.3, so the two visually echo each other when both appear in the same note.
- **No row dividers**: rows are separated by `py-2.5` padding alone. A fine inner rule would compete with the outer border and clutter the already-dense label/value grid — the uppercase label column already carries enough vertical rhythm.
- **Row**: `grid grid-cols-[minmax(80px,auto)_1fr] gap-x-4 px-4 py-2.5`
- **Label column (`dt`)**: `text-xs uppercase tracking-wide text-text-muted` — matches the section-header label style but stays terse (one token)
- **Value column (`dd`)**: `text-sm text-text-primary break-anywhere`, `min-w-0` so long values wrap inside the cell
- **Empty frontmatter** → the Panel renders nothing; no stray chrome on notes that have no metadata
- **Recognised keys** get typed renderers; unknown keys fall through to plain text. See spec for the list of recognised keys (`tags` / `aliases` / `description` / `created` / `url` / `origin` / `source_file_ids`)
- **Value truncation** happens at the value level only (never collapse the whole Panel):
  - `description`: `line-clamp-3 hover:line-clamp-none`
  - `source_file_ids`: first 5 cards + a "more" button to expand the rest
- **Origin badge**: `rounded-full` pill (matches tag pills for height consistency inside the row). `webclip` uses `--accent`, `detailed_summary` uses `--accent-teal`, `manual` uses the muted elevated fill. Reuses existing semantic tokens — no dedicated `--origin-*` token is introduced (keeps the semantic-token contract intact)
- **Internal radius**: the outer Panel is `rounded-xl` (12px). All inner chips/cards inside value cells use `rounded-lg` (8px) — source-file cards, the "more" button, loading/missing placeholders — keeping the radius scale unified. Tag and origin chips use `rounded-full`. Do not introduce `rounded`/`rounded-md` here; they are outside the §5 scale.
- **Hover affordance**: interactive inner chips (source-file cards, "more" button) use warm neutrals on hover — `hover:border-warm-silver/60 hover:bg-bg-elevated` on cards, `hover:bg-bg-card` on the "more" button. Do **not** use `hover:border-accent` here — §2.2 reserves `--accent` for CTAs and brand highlights, which these inline chips are not.

### Editable Tag Chips (EditableTagChips)

When the Properties Panel is in editable mode (spec `2026-04-24-knowledge-tag-unification.md` §D4), the `tags` row becomes an in-place chip editor. The same component is also the canonical tag-editing surface in the plain file-detail page for non-`.md` files (spec §D3 dispatch unifies the save path).

- **Chip style**: inline-flex `rounded-full bg-accent-teal/15 text-accent-teal px-2 py-0.5 text-xs` — matches the read-only `TagPill` exactly so read and edit modes don't visually shift
- **Per-chip remove**: trailing `<X size={11}/>` inside a round button, `hover:bg-bg-elevated` — do not introduce an `--accent-danger` hover here; deletion is cheap and undo-able via re-add
- **"Add tag" affordance**: bare `+ Add tag` button styled as a muted chip (`bg-bg-card text-text-muted hover:text-text-primary`) — distinguishable from real chips by the absence of the teal fill
- **Input**: `rounded-full bg-bg-card px-2 py-0.5 text-xs` with `focus:ring-2 focus:ring-accent` — sits in the same row as the chips so the chip/input boundary feels continuous
- **Autocomplete popover**: `absolute top-full left-0 z-10 mt-1 w-40 rounded-lg bg-bg-card py-1 shadow-lg`. Suggestions come from `GET /api/drives/{drive}/tags` scoped to the current drive. Max 5 rows
- **Selected suggestion**: keyboard-highlighted row uses `bg-accent text-white` — this is the only place `--accent` is applied on a chip surface because the highlight follows a specific user action (arrow-key selection) and therefore counts as a CTA-equivalent per §2.2
- **Keyboard**: Enter commits / arrow keys navigate suggestions / Backspace on empty input drops the last chip / Escape cancels. Matches Gmail, GitHub, Obsidian conventions so the affordance is discoverable
- **Inline validation error**: `mt-1 text-xs text-danger` line, only shown when the user triggers it — never pre-emptively
- **Persistence**: 2s debounce via `createDebouncedTagSaver`; edits coalesce into a single backend write. Do not surface saving/saved state in the chip row — the latency is imperceptible in the happy path and the error line handles failures
- **Internal radius**: chips stay `rounded-full` (§5 `full`), input stays `rounded-full`, popover `rounded-lg` (8 px). Do not introduce `rounded-md` here

---

## 7. Animation

| Utility | Motion | Used on |
|---|---|---|
| `animate-fade-in` | 200ms fade | General element appearance |
| `animate-fade-in-scale` | 200ms fade + scale 0.95→1 | Modals, dialogs |
| `animate-slide-up` | 250ms slide (center-anchored) | Toasts |
| `animate-slide-up-bar` | 300ms cubic-bezier slide | Selection bar |
| `animate-pop` | 250ms scale 1→1.25→1 | Heart / favorite icons |

All animations are disabled via `@media (prefers-reduced-motion: reduce)`.

---

## 8. Display preferences applied before first paint

One inline script in `<head>` — `lib/preferenceInitScript.ts` — reads two
preferences from `localStorage` and stamps both onto `<html>`, so neither
flashes the other value for a frame. Both are acted on entirely in CSS from
those attributes.

**`data-theme`**, from `theme-preference`:

- `'light'` → applies `[data-theme="light"]` rules
- `'dark'` → applies `[data-theme="dark"]` rules
- `'system'`, or nothing stored → **resolved by the script** to `light` or
  `dark` from `prefers-color-scheme`. The attribute is never written as
  `system`; there are no `[data-theme="system"]` rules and nothing would
  match them.

**`data-media-layout`**, from `media-layout-preference` — see §8.5.

Two things about this script are load-bearing and easy to undo:

- **Only the storage reads are inside its `try`.** A browser with site data
  blocked throws from `getItem` itself, and an unguarded throw skips both
  `setAttribute` calls. Wrapping the whole body instead would also stop the
  crash and would silently discard `prefers-color-scheme`.
- **`data-media-layout` is written first**, ahead of anything else that can
  throw, because it is the attribute whose CSS fallback does *not* match its
  JS default: absent, the page renders the stacked form while
  `useMediaLayoutPreference` reports beside, and the layout toggle then
  appears to do nothing until pressed twice.

Its default is `DEFAULT_MEDIA_LAYOUT`, exported from the same module and
imported by `lib/mediaLayout.ts`, so the two cannot drift. Anything else
reading a preference should go through `lib/safeStorage.ts` for the same
reason the script has its `try`.

---

## 8.5 Layout

### File detail: one shell, two canvases

Every kind the file detail shell carries gets the same page row, the same
fixed inspector header and the same Info tab. What differs is the canvas,
and there are only two of them:

| Canvas | Kinds | What is in it |
|---|---|---|
| **Viewer** | video, audio, `.loft`, PDF, archive, image | the viewer, and what belongs to that viewer alone — a media file's description, its long AI summary, and the transcript when the reader has put it below the player |
| **Document** | a Markdown note, and the HTML preview that borrows its single scroll | the Knowledge editor, with the note's own chrome in the page row (save dot, view-mode switch, click-to-edit filename) |

**The viewer has the column to itself.** That is the whole of the 2026-09
change for PDF, archives and images: each of them used to be a viewer at
the top of one column with the metadata stacked under it, so the viewer's
height was what was left over. A 190-page archive at 1512×807 got 100px
of listing under 440px of metadata, and going a level down inside it
moved every section below.

What is deliberately not here keeps the stacked layout: plain text and
subtitles, the Office formats, and anything whose type Litloft does not
recognise. A text file has no viewer whose height is being squeezed, and
Office has no viewer at all. They are Phase 4's.

### Inspector column (document layout)

The Markdown document layout puts an inspector beside the canvas: file
meta, tags, related files, comments and the addon sections that fit a
narrow column.

| Token | Value | Meaning |
|---|---|---|
| inspector width | `24rem` (384px) | Fixed, in both forms. When the row cannot hold it beside the canvas it covers the canvas at the same width rather than narrowing — 320px was tried and Japanese wrapped at 12–14 characters a line, so a responsive inspector is an unreadable one. |
| canvas padding | `2rem` (32px) | What the canvas puts around its own contents. Part of the sum because the player is inside it — leave it out and the threshold hands the canvas exactly the player minimum, then the padding comes out of the player. |
| beside threshold | `60.5rem` (968px) | Player minimum + canvas padding + inspector width, measured on the row that holds both. Never on the canvas: the canvas is what changes width when the inspector opens, so measuring it would make the answer depend on the answer. |

**A separate entry from the companion rail below, despite the same
number.** They are different parts — one holds a document's metadata,
the other follows a player's clock — and they arrive at 384px for the
same reason rather than by sharing a value: it is the narrowest column
where Japanese does not wrap at 12–14 characters a line. Merging them
into one row would make a later change to either look like a change to
both.

It was 300px until 2026-09, chosen as part of a three-column budget
(sidebar 240 + tree 280 + inspector 300 = 820px, spec
`2026-05-10-markdown-document-layout.md`). The 2026-09 file-detail
design puts a fixed header and a tab strip in this column, which 300px
cannot hold. Recording the old number here so the next person to count
the budget does not read 384 as drift and put it back.

### The Related group

One heading over both kinds of relation — core's own `file_relations`
and whatever an addon derives (similarity, shared keywords). Two
headings meant a reader had to guess which one a given connection had
been filed under.

- The group heading is drawn **only when there is a second source to
  group with**, asked of the slot catalogue and not of the DOM: a
  derived source is allowed to be a collapsed control that has computed
  nothing yet, so "did it produce anything" is not knowable from what it
  rendered.
- Group heading: `text-sm font-semibold text-text-muted`.
- **Its members are a step quieter**: `text-xs font-medium
  text-text-muted`, no card of their own and no glyph of their own. At
  section weight a member is louder than the heading grouping it, which
  reads as two lists rather than one; a card inside the group draws a
  second box inside the group's own.
- Ungrouped — no addon has published to `file-relations` on this drive —
  core's relations are a section again and keep the card every other
  section there has. The collection-playback route draws the group too:
  it has no inspector, but an addon that moved its entry into this slot
  is no longer reachable through `file-detail-sections`, so leaving the
  group out there would lose the section rather than restyle it.
- **The members live in two repositories**, so the weights above are the
  contract between them, the way the duplicated frontmatter parsers are.
  Core's `RelatedFilesSection` reads it from a context; an addon's entry
  reads it from this table.

### Companion region (media file detail)

Chapters and the transcript. **A player's, not a canvas viewer's** — a
PDF has a viewer but no playback clock, so nothing follows it, and the
region, its tabs and the control that moves them between the two places
are all absent there. **Where it goes depends on which surface the file
is on**, and the two answers are not variants of one layout:

| Surface | "Beside" means | "Below" means |
|---|---|---|
| Canonical (`?file=`), on `FileDetailShell` | a **tab in the inspector** | a bounded box in the canvas, under the description |
| Collection playback (`/files/{id}`), legacy stack | a **second column of `.media-detail-grid`** | the same box, under the player |

The canonical surface has an inspector, so a column of its own would be
a third one; the collection route deliberately does not have one (the
canonical URL is a file's address, so a second inspector there would be
work to throw away) and keeps the grid it already had.

**The occupant is moved, never duplicated.** It fetches, subscribes to
the playback clock and holds a scroll position, so a second copy is a
second competing reader of the same file rather than a second render.
Whichever of the two homes is in use, the other one is empty.

Widths and heights:

| Token | Value | Meaning |
|---|---|---|
| rail width | `24rem` (384px) | Fixed, on the grid. 320px was tried first and Japanese wrapped at 12–14 characters a line, which reads as cramped. |
| box height | `60%` of the measured scroll container | The bounded box the companion becomes when it is below the player, on either surface. Expressed as `calc(var(--rail-avail) * 0.6)`, falling back to `60dvh` before the first measurement — "60vh", but measured, because a self-scrolling pane is not the viewport. |
| below: index column | `12.5rem`–`22rem` (200–352px) | The chapter list beside the transcript, when there is one. 200px is the floor; past about 350px a column of timestamps stops reading as an index and starts competing with what it indexes. A width of its own — not the `lead cap, rail` below, which is a height. |
| below: body column | `68ch` | The reading measure, and the body's **flex base**, not only its cap. A time-ordered transcript is never set in two text columns — reading one to the bottom and back to the top of the next is the wrong way through a clock — so leftover width goes to the index instead. Base and cap being the same number is what makes that exact: the body cannot grow past its measure and the index cannot shrink past its floor, so below the pair's combined width the body absorbs the whole deficit and above it the index takes the whole surplus. Basing the body at zero instead would have both grow from where they start, leaving the 200px index permanently 200px ahead. |
| player minimum | `34.5rem` (552px) | Narrower than this and a 16:9 video stops being watchable. |
| gap | `1.5rem` (24px) | The standard section gap. |
| switch threshold | `60rem` (960px) | The sum of the first, fifth and sixth. |
| lead cap, stacked | `12rem` (192px) | Most a short index may take of the box, leaving the body it indexes readable. |
| lead cap, rail | `22rem` (352px) | The same index where there is room for it. |

The threshold is a **sum, not a feel**. Change either minimum and
recompute it; do not nudge it to make a particular window look right.
Widening the rail from 320px to 384px moved the threshold from 56rem to
60rem for exactly this reason.

**Four thresholds, four questions. Do not merge any two of them.**

| Threshold | Question | Measured against |
|---|---|---|
| `60rem` = 960px | Can a rail sit beside the player? | The host's **measured width**. Gates the grid's second column, so it applies on the collection route only — on the shell the companion is a tab, and a tab fits at any width. |
| `60.5rem` = 968px (`INSPECTOR_BESIDE_MIN_REM`) | Can the inspector sit *beside* the canvas, or must it cover it? | The **measured width of the row holding both** — never the canvas, whose width is the thing being decided. A sum, not a feel: the player's 34.5rem, the canvas's own 2rem of padding around it, and the inspector's 24rem. |
| `1120px` (`VIEWPORT_OPEN_THRESHOLD`) | Does the inspector *start* open? | The **viewport**. Not a layout branch: it is how the default is derived when the reader has no stored choice, and any choice they make outranks it. |
| 768px | Is the inspector a pane or a Bottom Sheet? | The **viewport**. |

**The middle two are the pair that has to stay apart**, and they are the
same pair §8.5 draws above: the viewport decides whether the inspector
*starts* open, the container decides whether it can be *beside*. A
preference can outrank the first; nothing outranks the second, because
it is a fact about the space rather than a choice about it.

Keying placement to the viewport is what put a 296px video on screen at
1200px — narrower than the same rule produced at 1120 — because the
shell also renders inside the 2-pane right pane, where an inline sidebar
and a 280px tree have already taken up to 520px the viewport says
nothing about. That is this section's own rule, failing in the words it
uses to state itself.

960 and 968 are both container questions and still not one question:
960 asks whether a *rail* fits beside the *player* inside the canvas,
968 whether the *inspector* fits beside the *canvas*. Different boxes,
different occupants, and they are near each other by coincidence of
arithmetic rather than by meaning. 968 and 1120 are not one either —
968 is "can they be side by side", 1120 is "should they be, by
default". The band between those two, where they fit but start closed,
is a real state that one number cannot express.

Every one of these is derived in `lib/layoutSizes.ts` from the same
three primitives, and the rows above are asserted against it.

1120 was 1280 until 2026-09, which left a band of its own. The media
layout's default puts the transcript and chapters in the inspector, so
between 1120 and 1279 a video arrived with both mounted behind an
inspector that started closed: nothing on screen, and nothing pressed
to put it there.

**The host holds the height, in both forms.** Which form is in use is a
container-width question answered in CSS, while an occupant is handed
its props in JS — so an occupant cannot know which form it is in and
must never be the one bounding itself.

**Lead and fill, not equal shares.** The region takes two kinds of
occupant: a *lead* that sizes to its own content under a cap (a short
index, such as chapters) and a *fill* that takes whatever remains (the
long body, such as the transcript). Giving both an equal share is wrong
for either.

**The lead must not shrink.** In a box sized by `max-height` rather
than `height`, the fill's `flex-basis: 0%` does not resolve to zero: a
percentage basis resolves against the container's main size, that size
is content-derived here, and the percentage falls back to content. The
fill's flex base size is therefore the whole length of its content, and
the shortfall against the box is enormous. Since shrinkage is
distributed by `flex-shrink × base`, the lead's proportionally small
share of that shortfall is still many times its own height — measured
at 14px against 36px of content, clipping its own header. Give the lead
`flex-shrink: 0` and let its cap bound it.

Both caps are absolute (`rem`), because a percentage `max-height` does
not resolve against a parent whose height is its content either. Where
a measured height is available — `--rail-avail` — cap against the
smaller of the two, since a lead that cannot shrink has no other way to
give space back on a short window.

### Measure against the container, not the viewport

Any layout that can appear both full-width and inside a pane must
switch on the width **it actually has**, never on a viewport
breakpoint. The file-detail surface renders in the full-screen route
and in the 2-pane right pane, which is 280px narrower than the window;
a `lg:` rule fires on window size and splits the pane at widths where
two columns do not fit.

This is the general rule, not a note about one component. Before
reaching for `md:` / `lg:`, ask whether the component ever renders
somewhere narrower than the window.

**Which mechanism depends on what is inside.** A container query
(`@container`) is the natural tool, but `container-type` establishes a
containment context, and on iOS Safari a containment context wrapped
around a `<video>`, `<audio>` or cross-origin iframe renders the whole
subtree rotated and continuously spinning. No desktop browser shows it,
so it survives review. Confirmed on device 2026-08-12.

- **No media in the subtree** → `@container` + `@4xl:`-style rules.
- **Media in the subtree** → measure the width with a `ResizeObserver`
  and publish a `data-*` attribute the CSS branches on. The file-detail
  surface does this (`data-media-width`), because the grid it switches
  necessarily contains the player. This form is also the testable one:
  container queries are not evaluated by jsdom, attributes are.

Keep the threshold in `rem` on both sides and resolve it against the
root font size when measuring, so scaled text still gets the layout the
numbers were chosen for.

**A core grid of equal cards goes through `lib/cardGrid.ts`.** Do not
write `repeat(auto-fill, minmax(min(16rem, 100%), 1fr))` — or a
`sm:`/`lg:`/`xl:` column count — into a card grid directly. Call
`useCardColumns()`, attach its `ref` to the grid element, and pass its
`columns` through `cardGridTemplate()`.

Addon card grids are not through it yet: `intelligence`'s
`SimilarFilesSection` and `media_import`'s `WatchLaneSection` still count
their own columns. They clear the floor of two, so the rule they break is
the container one, and each is a separate repository's PR — not a
silent exemption, an unfinished sweep.

**Card grid minimum width: `16rem`. Minimum column count: 2.**
`min(16rem, 100%)` collapses to a single column below 256px, and a 375px
phone then shows one full-width tile per row — less per screen than the
list view, which is the shape the mobile sizing rule rules out.

CSS alone *can* hold the floor: `minmax(min(16rem, calc(50% - <gap>/2)),
1fr)` yields the same counts at every width. It is not used because the
count is also a **number** the shelves need — how many cards to render
at all, rather than how wide to draw them (§ the drive home's rows). CSS
deriving it for layout while JS derives it for the count is two
implementations of one rule, and they drift. One measurement feeds both.
The `auto-fill` string survives as the pre-measurement fallback only.

An unmeasured grid — a server render, or no `ResizeObserver` — still
holds the floor: `cardGridColumns` caps its track at
`calc(50% - <half the gap>)`, so `auto-fill` cannot reach one column.
The percentage resolves against the grid container's inline content
size. That is the whole CSS answer to the floor; the count is measured
because it is also a number the rows need, not because CSS could not
lay the grid out.

**The gap is part of the rule, not a per-grid choice.** `columnsFor`
divides by `CARD_MIN_PX + CARD_GAP_PX`, so a grid with a wider column
gap under-fills — cards below the declared 16rem — and a folder row only
lines up with the file grid beneath it if their tracks start at the same
x, which needs the same gap and not just the same count. Every card grid
uses `gap-3` on the column axis; the row axis is free.

Card widths the rule produces, at `gap-3` and less the page's `px-4`
gutters: **≈165px at 375px** and **≈178px at 400px** (2 columns),
**≈294px in a 600px pane** (2 columns) and in a 1213px canvas beside the
open tree pane (4 columns).

Every card grid measures itself, so they all agree: the file grid
(`FileGrid`), the folder grids above it (`FolderContent`, `DriveHome`,
`RightPaneFolder`), and the trash and missing grids. A folder row and
the file grid under it have to line up, and a shared helper is what
makes that structural rather than a habit. Breakpoint column counts
cannot do it: they fire on window size and so mis-count inside the tree
pane, which is 280px narrower than the window.

### Justified thumbnail rows

A folder whose rows are all photographs does not go into equal cards.
Every thumbnail is a 320×180 JPEG with the picture letterboxed inside
it, so a grid of 16:9 cards draws black bars on three or four of every
ten cells in a folder of portraits. Those rows are packed at their own
proportions instead: variable widths, one fixed height per row, each
line filling the width exactly.

**Which shape a listing gets is derived, not chosen.** `deriveListMeta`
answers it from the rows that are loaded — `justifyThumbnails` is true
when at least 90% of them are images with stored dimensions — and it
sits beside the two flags that already hide a column whose every row
says the same word. A third `ViewMode` would be asking the reader a
question the folder has already answered.

**Video folders stay on equal cards**, and not only because their
thumbnails are genuinely 16:9. A justified cell carries no meta row —
unequal widths mean a caption under each cell never lines up into a
column — and in a folder of videos the relative date was measured to be
the one column still distinguishing anything. Packing them would spend
the black bars to buy nothing and drop the one line that was working.

**Flexbox does the arithmetic; nothing measures.** `flex-grow` is
distributed per wrapped line, so a cell with `flex-grow: <ratio>` and
`flex-basis: calc(<ratio> * var(--jg-row-h))` makes each line resolve to
exactly the container width. No `ResizeObserver`, no container query —
the same reasoning as the equal-card grid's `auto-fill`, one step up in
generality.

**The last line does not stretch** — but only because the absorber's
grow factor *dominates*. Free space is shared in proportion to the grow
factors, and every cell already carries `flex-grow: var(--jg-ratio)`,
summed across the line. A trailing absorber at `flex-grow: 1` therefore
loses the argument: measured on a 1469px grid, a three-cell last row
still stretched 1.645x — more than any full row on the page — while the
absorber took 129px of the 590 going spare. It is `flex-grow: 9999`,
three orders above the largest total a line can present, which leaves a
residue under a pixel (measured 150.1px against a 150px basis). Its
height is `0` rather than absent, so the row `gap` above it does not
open an empty line.

**Row height: 120px under 40rem, 200px at or above it** — switched with
a container query on the grid's own width, not a media query. The grid
renders beside a 280px tree pane, and these cells hold `<img>` and
nothing else, so a containment context here is safe (see *Which
mechanism depends on what is inside*).

**Ratio stops: 0.5× and 3×.** A 10:1 panorama laid out at the row height
would be wider than the row on its own; a 1:10 strip would be a
hairline. Both are cropped by `object-fit: cover` instead. A row with no
stored dimensions is drawn square, because a 16:9 cell among portraits
is the widest thing on the line and so the one placement a reader would
read as deliberate.

**The stops do not bound the enlargement, because the line stretches on
top of them, and the stretch itself has no bound.** Only width grows —
the row height is fixed — so every cell on a line is widened by the same
factor and `object-fit: cover` crops into the picture past the padding.
Line-breaking is greedy, so a line can end up holding a single narrow
cell: at `--jg-row-h: 120px` a 0.5-ratio cell is 60px and the next 3.0
cell is 360px, which will not fit beside it on a 375px line, and the
narrow one is then stretched alone to the full width — **6.25×**.

Two measured samples, not limits, both taken on the 995-photo folder
after the absorber fix below: **per-row stretch** ran 1.007–1.271× at
1512px and 1.010–2.075× at 375px, and the **worst single cell's
enlargement over its 320px stored thumbnail** was 2.97× (a 949px cell).
The two are different quantities; neither is a ceiling.

So the paragraph below is true of an unstretched cell and only
approximately true of a real one: the further a line has to stretch, the
more of the picture goes. Bounding it properly means varying the row
height per line rather than only the widths, which flexbox cannot do on
its own — it needs the row heights computed in JS, the way a classic
justified-gallery layout does. Not done; recorded here so the next
reader does not take the crop for zero.

**`object-fit: cover` puts the padding back, so no thumbnail is
regenerated.** The stored JPEG is the picture centred in a 320×180
frame; cropping that frame to a cell of the picture's *own* ratio removes
exactly the bars, because the padding is symmetric. A stretched cell is
not at its own ratio, so it removes the bars and then some — see the
measured factors above. Generating unpadded image thumbnails stays
available and would raise the resolution ceiling, but it does not
address the crop, which is a layout property rather than a thumbnail
one.

**The filename is a hover/focus band, and is always visible under
`pointer: coarse`** — there is no hover to ask with on a touch screen,
and a name that cannot be reached at all is worse than one that is
always drawn.

**The cell is named by `aria-label` on the link.** An explicit label is
what makes the accessible name the same string in every branch — a name
computed from contents says the title twice on a text row, because the
text preview draws it too. The band is deliberately *not* `aria-hidden`:
with the label present it cannot add a second copy anyway, and leaving
it in the tree means that if the label is ever dropped the name degrades
to the visible filename rather than to nothing.

**The 10% that are not photographs get `FileCard`'s answer.** The 90%
threshold admits them on purpose, so a cell draws a thumbnail, a text
preview or a type icon on the same three-way test the card form uses,
plus a duration badge for timed media. What it does *not* draw is the
hover video preview: the grid host is a `container-type` context, and a
containment context around a `<video>` renders its subtree rotated and
spinning on iOS Safari (see *Which mechanism depends on what is
inside*). The card grid resolves that tension the other way — it keeps
the preview and measures its width with a `ResizeObserver` — and either
answer is fine as long as the pair stays consistent. Here the row height
is the only thing switching on width, so giving up the preview is the
cheaper half to lose.

**The archive listing uses these rows too, with the ratio measured from
the picture rather than the database.** A zip directory carries no
dimensions, but the cell loads the original image, so the browser is
asked on `load`; until then the cell is drawn at 0.7, a scanned page's
usual shape, so the common case is the one that does not reflow. A
picture that fails to load goes back to square, because what is drawn
then is a 32px icon. Folders, text and binaries are square throughout.

**Its filename band is over the picture, not under it.** A caption in
the flex column shortened the image area while the cell's width still
came from the picture's own ratio, so `object-fit: cover` cropped the
difference — about 12% of the height on a 200px row and 20% on a 120px
one, in exactly the mixed levels that show captions.

**Cells carry `min-width: 0`.** The grid these replaced was
`repeat(N, minmax(0, 1fr))`, so a long name could not widen a column. A
flex item's automatic minimum is its min-content width instead, and the
archive puts a `truncate` — that is, `white-space: nowrap` — filename in
flow. One long name would otherwise become the cell's minimum, the row
would stop justifying, and `cover` would go back to cropping its
neighbours.

### A floor under the canvas viewer

An archive holding seven entries drew a 200px band with the rest of the
canvas empty under it: the viewer is the whole reason the page exists,
and its height came from how much happened to be inside it.

The canvas viewer takes `min-height: max(320px, calc(var(--canvas-h) *
0.7))` — **70% of the canvas**, not of the viewport. The canvas is the
scrollport left after the page row and beside the inspector, which is
384px narrower and a row shorter than the window.

A floor, not a ceiling. A 2439-entry archive still grows past it.

**`--canvas-h` is measured, not `70cqh`** — and the reason has nothing
to do with heights. `container-type: size` implies `contain: layout`,
which makes the element the containing block for every `position:
fixed` descendant and gives it a stacking context of its own. The
archive canvas holds two unportalled fixed elements: the full-screen
page-turner and the toolbar's overflow backdrop. Under containment the
page-turner's `inset-0` resolves to the canvas — it covers the column
instead of the screen, cannot rise above the header, and scrolls away
with the content, while its inert backdrop has already made everything
behind it unclickable. So the height is published from a
`ResizeObserver`, which is the mechanism `lib/cardGrid.ts` already uses
and the shape this document prescribes wherever a subtree may hold
media.

The lesson generalises past this floor: **`container-type` is not only
a question about media in the subtree.** It changes what `position:
fixed` means underneath it. Check for fixed descendants before
establishing one, not just for `<video>`.

**Archives and PDFs only, and not on a phone.** Which viewers get a
floor is a named list in `lib/fileDetailShell.ts`
(`viewerTakesCanvasFloor`), not a mime prefix: `startsWith("text/")`
was the first spelling, it was unreachable — plain text does not ride
the shell — and it would have matched `text/html`, which renders in a
sandboxed opaque-origin iframe. A prefix asks "does this look like the
family I meant"; a list asks "is this one I have checked".

Images are excluded for a different reason: `FilePreview` already caps
them at `70vh`, so a floor would add white space around a small
photograph and nothing else. A phone is excluded because there the
canvas *is* the screen — there is no gutter beside a short viewer to
fix — and the player is `position: sticky` under `[data-sheet-snap]`,
so a floor would pin 70% of the screen for the whole scroll and leave
the description and comments a slot to be read through.

### Sticking below the header

`--app-header-h` is published by `Header` from its measured height (the
PWA safe-area inset changes it, so it is not a constant). Anything that
sticks under the header positions itself with it rather than
duplicating the header's shape.

The offset depends on the host: a pane that scrolls itself starts at
its own top, while under document scroll the sticky header would cover
the element. Hosts signal which they are; see
`.media-detail-companion-inner` in `globals.css`.

---

## 9. Do's and Don'ts

### Do
- Use warm neutrals (`--sand`, `--warm-light`, `--warm-silver`) — olive/sand tone is the identity
- Reserve `--accent` for CTAs and brand highlights only
- Use `rounded-2xl` (16px) for buttons and inputs, `rounded-xl` (12px) for cards
- Separate line-height rules for headings, body, and forms (jp-ui-contracts)
- Avoid `tracking-wider` on any element that may render Japanese text
- Use the `break-anywhere` utility for long words and URLs — not `break-all`
- Use plum black (`#211922` / `#f5e6e8`) for primary text
- Apply 12px radius uniformly to long-form content blocks (`blockquote`, `pre`, `img`, fenced code)
- Let tables carry structure via `border-bottom` + `font-weight` only — no zebra, no fills
- Toggle `chrome` on MarkdownPreview to switch between "page reading surface" (860px cap) and "embedded segment" (inherit width)

### Don't
- Do not apply `word-break: break-all` globally to body text or UI labels
- Do not use `scale()` hover or active on cards / buttons — preserve the static weight
- Do not introduce additional brand colors — coral red + warm neutrals is the complete palette (the `--graph-cat-*` chart-only scale in §2.4 is the sole sanctioned exception, and only on chart surfaces)
- Do not grow / darken `box-shadow` on hover. Resting `shadow-card` stays constant; hover changes surface color only
- Do not handroll arbitrary `shadow-[0_*]` values, or stack `shadow-2xl` with `ring-*` — use the `shadow-card` (Level 1) or `shadow-lg` (Level 3) tokens
- Do not use border-radius below 12px on outer surfaces
- Do not use cool grays — always warm/olive-toned
- Do not use pure black in dark mode — use warm plum dark (`#1a0e10`)
- Do not re-introduce the UA default yellow on `<mark>` — it is reset globally so utilities and `--highlight-bg` stay in control
- Do not add zebra stripes or cell grid borders to reading-surface tables
- Do not hard-code `max-width` on MarkdownPreview callers — flip `chrome` instead so the cap stays centralised
