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

---

## 1. Visual Theme

A **warm white canvas** with **coral red** as the single brand accent — flat,
minimal, photography-forward: generous border-radius, depth without shadows.

**Light**: white canvas, plum black text, coral red accent.
**Dark**: warm plum dark (`#1a0e10`) with bright coral (`#e85d5e`) — a red-tinted
plum rather than pure black, so the warm character stays consistent.

---

## 2. Color System

### 2.1 CSS Custom Properties

All tokens are exposed as Tailwind utility classes via `@theme inline` (e.g.
`bg-accent`, `text-text-muted`).

**Except two.** `--danger-bg` and `--kbd-shadow` are consumed by rules inside
`globals.css` and are absent from `@theme inline`, so `bg-danger-bg` and
`shadow-kbd-shadow` do not exist. Tailwind v4 emits nothing for a utility whose
token it does not know — no error, no warning — so writing one gives an element
with no background. For an error surface in markup, use the alpha derivation `bg-danger/15`.
`frontend/src/__tests__/design-tokens.test.ts` compiles every colour utility
written in core and the addons against this stylesheet and fails on the ones
that produce no rule, which is what stops this from recurring.

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
| `--accent-teal` | `#103c25` | Success / accepted state |
| `--accent-amber` | `#78350f` | AI-generated / suggestion pending state |
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
| `--accent-amber` | `#f4c674` | Warm honey |
| `--sand` | `#3d2023` | Dark sand |
| `--sand-hover` | `#4a2a2e` | Dark sand hover |
| `--warm-light` | `#3d2023` | Same as sand |
| `--warm-silver` | `#7a6668` | Muted pink-silver |
| `--dark-surface` | `#0d0608` | Deepest surface |
| `--focus-ring` | `#617bff` | Bright blue |
| `--danger` | `#ff8a8a` | Bright coral error |
| `--danger-bg` | `rgba(255,45,66,0.12)` | Error background |
| `--highlight-bg` | `rgba(244,198,116,0.55)` | Mark highlight, lifted to read against the dark canvas |
| `--kbd-shadow` | `inset 0 -1px 0 rgba(255,255,255,0.2)` | `<kbd>` bottom bevel |

#### System preference

There is no `[data-theme="system"]`. A stored `'system'` is resolved to `light`
or `dark` by the pre-paint script (§8); only those two are ever written.

### 2.2 Color Usage Rules

- **`--accent`**: primary CTAs and brand highlights only.
- **One accent *fill* per screen.** At rest, at most one control carries
  `bg-accent` (or `bg-accent-cta`) as a background. **Which action gets it
  changes per screen** — Play is bordered on a folder, where the fill belongs to
  Add, and filled on a collection, which exists to be played; a screen with no
  such action spends none. Give every other control `secondary`, `ghost`, or a
  border. Only *fills* count: `bg-accent/10` behind a hovered row,
  `enabled:hover:bg-accent-hover` and a `border-accent` selected state do not.
  `frontend/src/__tests__/accent-budget.test.tsx` counts core's own fills; an
  addon-owned screen counts its own, in its own repository.
- **`--sand`**: secondary button backgrounds, tags, mid-tone surfaces.
- **`--accent-teal`**: success / accepted state (e.g. a confirmed tag).
- **`--accent-amber`**: AI-generated / suggestion-pending state. Pair with a
  dashed border. Not a brand accent.
- **`--danger`**: errors, deletions, destructive actions. Not `--accent` red.
- **`--text-muted`**: keep contrast readable; do not reduce opacity beyond
  legibility.
- Never rely on colour alone to convey state — pair with an icon or text.
- **`<mark>`'s UA default is reset globally** (`background: transparent; color:
  inherit`) so utilities apply outside the Markdown pipeline; inside
  `.markdown-body`, `--highlight-bg` wins. **Keep the reset in `@layer base`** —
  an unlayered rule beats a layered one whatever its specificity, so as plain CSS
  it defeats every utility a caller puts on a mark.
- **A persistent highlight outside `.markdown-body` uses `bg-highlight-bg`.**
  `.ask-citation-highlight` is the *temporary* jump flash, not a substitute.

### 2.3 Wiki-link classes

Three classes for `[[X]]`-style wiki-links, each reusing an existing token.

| Class | Element | Color token | Usage |
|---|---|---|---|
| `wiki-link wiki-resolved` | `<a>` | `--accent` (canonical in-app prose link red) | Resolved to a single `.md` file_id; a real link to `/files/<id>`. Hover `--accent-hover`. |
| `wiki-link wiki-unresolved` | `<span>` | `--text-muted` | Target not found. A dashed underline says "could become a link". |
| `wiki-link wiki-ambiguous` | `<span>` | `--accent-amber` | Matched more than one note; `title` carries the candidate count. |

- Always pair the class with the marker icon or underline, so the state survives
  for readers with colour-vision deficiencies.
- The classes are on DOMPurify's `data-wiki-target` allowlist, so the target
  survives sanitization.

### 2.4 Chart-only Categorical Scale

`--graph-cat-1` … `--graph-cat-6` is a **qualitative data-visualization scale**,
not part of the brand palette. The semantic accents cannot serve that role:
`--accent-teal` and `--accent-amber` are deep colours built to sit *behind* text
at low opacity, so as solid small fills they collapse into dark blobs.

| Token | Light | Dark | Role hint |
|---|---|---|---|
| `--graph-cat-1` | `#d63031` | `#e85d5e` | coral |
| `--graph-cat-2` | `#1f7a5a` | `#4caf80` | green |
| `--graph-cat-3` | `#c2740a` | `#f0a847` | ochre / honey |
| `--graph-cat-4` | `#8e4585` | `#c98bc0` | plum / orchid |
| `--graph-cat-5` | `#7c7a45` | `#bdb869` | olive |
| `--graph-cat-6` | `#3f6fa3` | `#7fa6d4` | dusty blue |

- **Chart surfaces only** — graph nodes, legend swatches, chart segments. Never
  for buttons, links, text, borders, or any brand/UI affordance.
- Derive faint fills with `color-mix(… 16-18%, transparent)`; never hand-pick a
  separate light tint.
- Out-of-scale buckets and `flat` mode use `--text-muted`, not a 7th hue.
- Selection / focus / search-match highlight is `--accent`, independent of this
  scale.
- This scale is §9's sole sanctioned exception to "no additional brand colors":
  documented, namespaced, and forbidden on brand surfaces.

### 2.5 Description timestamp links

A media description renders its timestamps as inline `<button>`s that seek the
player. No new token — it reuses §2.3's canonical prose-link `--accent`.

| State | Color token | Usage |
|---|---|---|
| default | `--accent`, hover `--accent-hover` | A timestamp the player can seek to. |
| `:disabled` | inherits the paragraph (`text-inherit`) | No media controller — the player has not published one, or never will. |

- **Do not dim the disabled state.** It is also the permanent state of a file
  with no working player, and a timestamp that will never do anything must read
  as the prose it sits in.
- The button carries **no font utility**, so it inherits the paragraph's size and
  family.

---

## 3. Typography

### 3.1 Font Stack

```css
--font-sans: -apple-system, system-ui, "Segoe UI", Roboto, "Oxygen-Sans",
  "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", Ubuntu, Cantarell,
  "Fira Sans", "Droid Sans", "Helvetica Neue", Helvetica,
  "ヒラギノ角ゴ Pro W3", メイリオ, Meiryo, "ＭＳ Ｐゴシック", Arial, sans-serif;
```

Japanese fonts are listed explicitly — do not leave Japanese rendering to browser
defaults. Stable on both macOS and Windows.

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
interface. Long-form prose has its own scale in §3.3, in `em` against the element
it sits in, which is why H3 here is smaller than body text while
`.markdown-body h3` is larger: one is a label for a box, the other a heading
inside a text. A heading level that gains a rule gains it here, not in the
component that needed it.

> **Known gap — H2 and H3 are stated ahead of the tree.** H1 has a single
> implementation (`PageHeader`) and a test that pins its size, so the rule and
> the code agree. H2 and H3 have neither. They move as the screens holding them
> are next opened, not in a sweep — the same terms §6's button gap runs on, and
> for the same reason.

### 3.3 Long-form Prose (MarkdownPreview / "reading-A")

Applies wherever `.markdown-body` renders — `MarkdownPreview` (FilePreview `.md`,
Ask answers, knowledge preview) and the `detailed_summary` segment wrappers.
Keep these values identical across those surfaces.

| Element | Size | Weight | Line Height | Margin (top/bottom) |
|---|---|---|---|---|
| Body | 16px (inherited) | 400 | 1.625 | `0 0 1em` |
| h1 | 1.75em | 700 | 1.35 | `1.8em / 0.55em` |
| h2 | 1.35em | 700 | 1.4 | `1.6em / 0.5em` |
| h3 | 1.15em | 650 | 1.45 | `1.4em / 0.4em` |
| h4 | 1.03em | 650 | 1.45 | `1.2em / 0.35em` |
| Inline `code` | 0.85em | — | — | — |
| `pre` / code block | 0.85em | — | 1.6 | `1em 0 1.15em` |

- `blockquote`, `pre`, `img` and fenced code blocks all use **12px radius** (§5
  card radius — they are one "long-form content block" family).
- `blockquote`: `border-left: 3px solid var(--accent)`, `background:
  var(--bg-elevated)`, radius `0 12px 12px 0`.
- `.markdown-body > :first-child` / `:last-child` strip outer margins, so the
  first and last block never paint a phantom gutter against their host.
- `.markdown-segment` strips the same on **immediate** children only — use it
  where the host already owns vertical rhythm.
- **Consecutive images auto-group into a flex row** (`.markdown-image-group`):
  images with no blank line between them are wrapped into one row, each at a
  fixed `height` (200px desktop, 120px below 767px), `width: auto`, `gap: 8px`,
  wrapping when they do not fit. A single image keeps the plain `img` rule.

### 3.4 Reading Measure

Long-form prose has an **860px** max-width cap, applied only in `chrome=true`
mode (FilePreview, Ask panel full view, knowledge preview).

- **Embedded contexts drop the cap** — `chrome=false` lets the parent decide.
- Do not hard-code a max-width on MarkdownPreview callers; flip `chrome`.

### 3.5 Japanese Typography Rules (jp-ui-contracts)

```css
html:lang(ja) {
  line-break: strict;
  word-break: normal;
  overflow-wrap: anywhere;
  font-kerning: auto;
  font-feature-settings: normal;
  text-autospace: normal; /* progressive enhancement */
}

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

- `word-break: break-all` globally on body text or UI labels. For machine-like
  strings (logs, hashes, paths, URLs) use the `break-anywhere` utility.
- `letter-spacing` beyond `0.02em` on body text without strong justification.
- `tracking-wider` (`0.05em`) on any element that renders i18n text.

**Allowed:**

- `uppercase tracking-wider` on hardcoded English-only labels. No such label
  exists in the app today, so adding a use means adding a real example here.
- `break-anywhere` on machine-like strings.

### 3.6 List row measure

A listing row's **contents** are capped at `60rem` (960px), exposed as the
`max-w-list-row` utility (`--container-list-row`). It applies to the text column
of `FileListRow` and `FolderListRow`.

- **The cap is on the contents, not on the row.** The row keeps its full width,
  so the hover band and the click target still span the listing.
- **Why a cap at all**: the title takes the space going and the size and date pin
  to the right edge, so on a wide screen the two halves of one row sit far enough
  apart that the eye has to travel to pair them up.
- **It is not §8.5's `60rem`, and not §3.4's 860px.** §8.5 asks whether a rail
  fits beside the player, against a container. §3.4 caps a column of running
  text. This caps a row, where the question is how far apart the two ends of one
  line may sit and still read as one thing. Do not merge any two of them.

### 3.7 Fitted page measure

A **fitted** page image is capped at **900px** wide (`MAX_FITTED_WIDTH` in
`lib/pdfZoomMode.ts`), in the PDF viewer's `fit-width` and `fit-page` modes,
**before the reader's own zoom**, which multiplies it. The cap decides where
fitting stops, not how large a page the reader may ask for.

- **It does not apply to `actual` size.** That mode's whole claim is that the
  page is the size it says it is, and a capped "actual size" is a lie.
- The cap is not explained in the UI. An explanation is owed for things the
  reader can choose, and this is not one of them.

---

## 4. Depth & Elevation

| Level | Treatment | Usage |
|---|---|---|
| 0 (Flat) | No shadow | Buttons, inline chrome, dense list rows |
| 1 (Card resting) | `shadow-card` token only | Media cards (FileCard / FolderCard / grid items), MiniPlayer, mid-page floating affordances |
| 2 (Elevated surface) | `bg-bg-elevated` surface shift | Toolbars, sub-panels, banners |
| 3 (Overlay) | `shadow-lg` + `bg-bg-card` | Modals, dropdowns, context menus, command bars |

Depth comes first from surface colour and border-radius. Shadow is allowed only
as a **single resting elevation** on media-bearing cards (Level 1) and as a
**minimal overlay shadow** on dialogs and dropdowns (Level 3).

**Forbidden:**

- **Hover-shadow expansion** — hover changes the surface colour, never the
  shadow. A card's resting shadow stays exactly the same on hover.
- **Decorative large-offset shadows** — `shadow-2xl`, custom
  `shadow-[0_8px_40px_*]`, or any shadow with blur ≥ 24px / opacity ≥ 0.2.
- **Stacked shadow + ring** to fake depth.
- **Decorative use on flat-surface components** — sidebars, properties panels,
  markdown blocks, inline chips and ghost buttons stay Level 0.

**`--shadow-card` (Level 1)**: light `0 1px 2px rgba(33, 25, 34, 0.04), 0 1px 3px
rgba(33, 25, 34, 0.04)`; dark `0 1px 2px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0,
0, 0, 0.25)`. Use the `shadow-card` utility; never handroll a card shadow.

---

## 5. Border Radius Scale

| Class | Value | Usage |
|---|---|---|
| `rounded-full` | 9999px | Avatars, circle buttons, filter pills |
| `rounded-2xl` | 16px | **Standard** — buttons, inputs, modals, badges |
| `rounded-xl` | 12px | Cards, containers, sub-panels |
| `rounded-lg` | 8px | Small elements inside icon containers only |

- Do not expose less than 12px border-radius on outer surfaces.
- Do not use `scale()` transforms on hover — keep the cards' static weight.

**Exception — mobile media frames**: video / Loft playback frames render
edge-to-edge with **0px radius on mobile** (`<md`) to maximize the viewable frame
and match platform expectations; desktop (`md+`) keeps `rounded-xl`. Use
`md:rounded-xl` on the player wrapper and `-mx-4 md:mx-0` on the parent slot.
Primary playback surface only — not thumbnails, mini-player placeholders, or
cards listing media.

---

## 6. Component Styling

### Buttons

| Variant | Background | Text | Hover | Radius |
|---|---|---|---|---|
| Primary (CTA) | `bg-accent` | `text-white` | `hover:bg-accent-hover` | `rounded-2xl` |
| Secondary (Sand) | `bg-sand` | `text-text-primary` | `hover:bg-sand-hover` | `rounded-2xl` |
| Danger | transparent | `text-danger` | `hover:bg-danger/10` | `rounded-2xl` |
| Ghost | transparent | inherited | — | `rounded-2xl` |
| Circle Action | `bg-warm-light` | inherited | — | `rounded-full` |
| **Disabled (every variant)** | `disabled:bg-sand` | `disabled:text-warm-silver` | `disabled:cursor-not-allowed` | — |

- Padding is at least `px-4 py-2` — Japanese labels need the room.
- A disabled button drops its enabled background rather than fading it: keeping
  `bg-accent` on a disabled control leaves it reading as the page's one call to
  action (§2.2).
- **Do not use `disabled:opacity-*`.** Transparency dims a control without
  changing what it says, and the contrast loss lands hardest on the label.

> **Known gap — the rule is ahead of the code.** Only buttons filled with
> `bg-accent` (or `bg-accent-cta`, its twin) follow this today; the enforcing
> test scans for that pairing alone. Every other variant still carries
> `disabled:opacity-*`, including the saturated `bg-accent-teal` fills with
> white labels in the intelligence summary sections, which fade in exactly the
> way this rule forbids. They move opportunistically, when a later change
> touches the row they sit in — the same terms §2.2 gives the accent fills that
> are not yet on `Button`.
>
> **`addons/cloud-sync` is deliberately not converted.** `SyncDriveCard.tsx`
> already puts a `disabled:bg-sand` button and a `disabled:opacity-50` button in
> one `flex gap-2` row, so "two disabled treatments in one row" is not
> hypothetical there — it is on screen today. What keeps it harmless is that the
> two are driven by *independent* flags (`actionLoading` and `logLoading`), so
> they are never disabled by the same click and the reader never sees the two
> treatments side by side in the same state. **If those flags are ever merged,
> this exemption expires** — which is why the reason is recorded and not just
> the conclusion. Still a decision, not an oversight: do not open that
> repository to "finish" the sweep without re-reading this paragraph.

### The `Button` component

`frontend/src/components/Button.tsx` renders the five variants above. Reach for
it rather than writing the classes out, so the recipe has one place to be
corrected in.

```tsx
<Button variant="primary" onClick={add}>Add files</Button>
<Button iconOnly aria-label="Delete Q1 notes" variant="ghost"><Trash2 size={18} /></Button>
```

- **`variant` defaults to `secondary`** — a `primary` default would spend the
  page's one accent fill (§2.2) whenever a caller left the prop off.
- **Sizes**: `sm` `px-3 py-1.5 text-sm`, `md` `px-4 py-2 text-sm` (default), `lg`
  `px-5 py-2.5 text-sm`.
- **A labelled button is sized by padding, never `h-*`**, so a Japanese label
  that wraps grows it instead of being clipped — the coarse-pointer floor below
  is a `min-h` for the same reason, raising a short box without capping a tall
  one. `iconOnly` is the exception: a fixed `h-8 w-8` square.
- **`iconOnly` requires `aria-label` in the type**, and the name must be
  entity-specific ("Delete Q1 notes", not "Delete").
- **Every shape reaches the 44px touch floor on `pointer: coarse`, and no call
  site adds it by hand.** Two mechanisms, because the two shapes are sized
  differently: a labelled button takes `pointer-coarse:min-h-11`, and `iconOnly`
  takes the §Row Actions overhang instead — the hit area, not the box, which
  stays 32px at every pointer type. `buttonClass()` emits the same floor as a
  labelled button, so a link and a button standing next to each other are the
  same height. Both are gated on `coarse`: on a fine pointer each shape keeps
  the size its padding gives it.
- **Hover is written `enabled:hover:`.** A bare `hover:` repaints a *disabled*
  button under the cursor, which is the defect the Known gap above names for
  `disabled:hover:bg-accent`. Guarding it inside the variant means a call site
  cannot forget.
- **A link wearing this recipe takes `buttonClass()`**, which emits bare `hover:`
  and no `disabled:`: CSS `:enabled` never matches an `<a>`. **A destination is a
  link; only an action is a `Button`.**
- **`className` is for layout only.** A colour passed here is a variant that
  should have been added above.

### Page Header

`frontend/src/components/PageHeader.tsx`. One header for every screen with a
subject. Padding `px-4 py-2`, rows separated by `gap-1`.

| Part | Prop | Notes |
|---|---|---|
| Trail row | `leading`, `breadcrumb` | `leading` is a small navigation control (today only `<TreeToggle>`) and stays leftmost |
| Subject row | `titleIcon`, `title`, `scope`, `actions` | `title` becomes the `<h1>` at the §3.2 size |
| Tab row | `tabs` | A `<PageTabs>`, or nothing |

- **Omit `title` when the breadcrumb is the subject** — a heading repeating the
  trail's last segment states one subject twice. No `title`, no `<h1>`.
- **`scope` is one line under the subject** (counts, duration, state, drive
  name); with no title it joins the trail instead.
- **`leading` joins the first row that exists**, so the tree toggle does not move
  between folder mode and search mode.

### Tabs

`frontend/src/components/PageTabs.tsx`. **Underline tabs, and only underline
tabs.** Selected `border-accent font-semibold text-text-primary`; unselected
`border-transparent text-text-muted`. Both carry `border-b-2`, so only the colour
costs layout; the weight change is a second, non-colour signal and is accepted.

- **A row that navigates is not a tablist.** Any `href` and the row is a `<nav>`
  whose current item carries `aria-current="page"`; none, and it is a
  `role="tablist"` whose current item carries `aria-selected`. Never both.
- Tabs clear the 44px floor on `pointer: coarse` (`pointer-coarse:min-h-11`).
- The inspector's tab strip draws this recipe by hand because it carries a roving
  `tabIndex`; `src/__tests__/tab-styles.test.ts` holds that exemption by name and
  checks its class strings against `PageTabs`'s.

### Selected-state controls (segmented toggles, tabs)

A control that says **which of N equal options you are in** marks the selected one
with a **border in the accent colour**, never a fill.

- A fill would spend §2.2's one accent per screen on a state indicator; a 2px
  border is not a fill.
- **No surface token can carry this selection**: `--bg-card` and `--bg-primary`
  are both `#ffffff` in the light theme. The accent border clears the 3 : 1 WCAG
  1.4.11 asks of a state indicator.
- **Give the unselected control `border-transparent`, not no border**, so nothing
  shifts on selection.
- **On a crowded bar, prefer a labelled menu.** The border says *which* option is
  on and cannot say what the options are; a menu face reading `View: List view`
  spends one control and carries a word at every state. Use the toggle only where
  two options are glanceable and the row has space.

### Cards

- Radius `rounded-xl` (12px); background `bg-bg-card`.
- `shadow-card` resting only on media-bearing cards (FileCard, FolderCard,
  MiniPlayer); dense list rows and inline cards stay flat.
- Hover changes the surface colour only. **Never expand or darken the shadow on
  hover, and never use `scale()`.**
- **A card's name row clamps to two lines where it clamps at all.** The scope
  is the row of text under the card's media area, and nothing else: not every
  card clamps there — `FolderCard` and `ArchiveEntryCard` cut theirs to one
  line with `truncate`, and `JustifiedFileCell` draws its name as an overlay
  governed by `.justified-grid-name` in `globals.css` — but the ones that
  reach for `line-clamp-*` do not each pick a different number. Walk
  `grep -rn 'line-clamp-' frontend/src addons/*/frontend` rather than trusting
  this list — three consecutive reviews found a name missing from it, each
  time because it had been copied from the previous round instead. The name
  rows it returns today are `FileCard`, `TrashFileGrid`, `MissingFileGrid`,
  `media_import`'s `WatchCard` and `intelligence`'s `SceneCard`, all at two.
- **The media area is a different surface, and `TextThumbnail` clamps at
  three there.** A text file has no picture to show, so `TextThumbnail` draws
  one: the title in bold over a shrunken cast of the body text, inside the
  media box, where a photograph would be. Three surfaces mount it, and only
  one of them pairs it with a clamped name row:
  - `FileCard` does, so it is the one place the same title is drawn twice at
    two different limits — three lines inside the picture, two below it.
  - `JustifiedFileCell` puts the name over the picture on one line, which is
    the overlay the bullet above already describes.
  - `FileListRow` is a list row rather than a card, so §Cards does not reach
    it at all; it sets the name beside the picture on one line with
    `truncate`.

  The `FileCard` pairing is not the bullet above being broken: the rule there
  is scoped to the name row, and a stand-in for a thumbnail is sized by the box
  it fills. **Whether three is the right number for that box is not decided
  anywhere** — not in hako, not in a spec — so treat it as the thumbnail's own
  and leave it alone unless something decides it. What would break the rule
  above is the *name row* picking a third number. The rest of what that grep
  returns clamps something that is not a name at all — an excerpt, a search
  snippet, a quote, a description, `SceneCard`'s own second line — and neither
  bullet says anything about them.
- **Nothing else in that class list may set a `display`.** `line-clamp-*`
  compiles to `display: -webkit-box` plus `-webkit-line-clamp`, and the clamp is
  a property of that box: any other `display` utility on the same element
  overrides it at equal specificity and leaves `-webkit-line-clamp` nothing to
  act on, with the clamp still written on the element and nothing rendering
  differently from a card that never had one. `block` beside a clamp is the
  spelling this has taken twice. `line-clamp-none` is the exception — it is the
  clamp's own release valve and is meant to be paired with one, as
  `PropertiesPanel` pairs it. `frontend/src/__tests__/line-clamp-display.test.ts`
  holds the mechanical half of this rule for core and every checked-out addon.

### The first fact under a file's name

What a card, a list row and the file page each say first about a file is one
rule, in one table: `frontend/src/lib/primaryMeta.ts`. Not a list of exceptions
but a question asked of the kind — *what has this surface not already said, that
a reader would use to tell this file from the one beside it?*

| Kind | First metadatum |
|---|---|
| video, audio | none |
| image | its dimensions, `1920 × 1080` |
| everything else | its size |

- **One table, and every surface that draws a file's name with a fact under it.**
  Named rather than counted, because a count is a claim about completeness and
  two of them were wrong before this list existed: `FileCard`, `FileListRow`,
  `FileMetaBlock`, `TrashFileList`, `TrashFileGrid`, `MissingFileList`,
  `MissingFileGrid`, `AudioPlayer`, and the duplicates panel's file row.
  `JustifiedFileCell` draws a badge and no meta line, so it takes
  `hasKnownLength` and nothing else. A rule written down and read by one caller
  is indistinguishable from no rule: `FileCard` alone obeyed it for a while, and
  every other surface went on labelling a 19-minute video "83 B".
- **A viewer is one of these surfaces.** The audio panel is a filename with a
  fact beneath it, so it reads the same table, and the answer for audio is to
  draw nothing — the length is on the `<audio controls>` transport bar below it.
  Being in the viewer column rather than the inspector does not make it a
  different question.
- **What the table does not cover** is a quantity that is not a fact about one
  file: disk and cache usage, a duplicate group's wasted bytes, a "too large to
  preview" warning, an entry inside an archive, and the size beside
  `FilePreview`'s Download button, which `playerKind` puts out of reach of video
  and audio anyway.
- **The size is not a neutral default.** On a `.loft` reference row `file_size`
  is the pointer's, not the media's, so for video and audio it is not merely
  redundant but false.
- **Where the length goes is the surface's business, not the table's**, and it
  is the one thing to check before handing the table to a new surface. A
  surface that says it elsewhere — a thumbnail badge (`FileCard`,
  `FileListRow`, `JustifiedFileCell`, `TrashFileList`, `MissingFileList`, all
  five under `hasKnownLength`) or a transport bar (`AudioPlayer`) — asks only
  `primaryMetaText`. A surface with nowhere else to put it (`FileMetaBlock`,
  `TrashFileGrid`, `MissingFileGrid`, the duplicates row) draws it at the head
  of the line the table finishes — `primaryMetaLine`. The video row of the
  table is `none` everywhere for the same reason; taking that to mean "draw
  nothing" on a badgeless card would delete the length from it entirely.
- **`primaryMetaLine` returns one string, never two.** The length and the
  table's answer are mutually exclusive by construction, so the shape says so
  rather than a comment saying so. An earlier version returned a list and
  joined it with a separator that nothing could ever reach.
- **A missing badge is not always an omission to correct.** The corner
  `FileCard` puts the length in, `bottom-2 right-2`, is the deadline's on a
  trash card and the neighbour of the *missing* mark on a missing one. Those
  cards are not `FileCard` with a badge forgotten.
- **A kind gets one answer, not two.** An image whose dimensions were never
  probed does *not* fall back to its size — a fallback stops "kind → first
  metadatum" being a function, and two image cards would then describe
  themselves differently for a reason the reader cannot see.
- **Nothing is drawn where nothing is known.** Where a surface has neither a
  length nor anything the table adds, it draws no line at all rather than an
  empty one.
- **This is not the `deriveListMeta` question.** That one asks whether a column
  *varies* across the loaded rows and drops it where it does not; this one asks
  whether a fact belongs to the kind at all. Uniformity cannot detect wrongness,
  so the size column is not gated on it — sixty rows differing in their sizes
  are still sixty wrong sizes. Kind first, variation second.

### Inputs

- Radius `rounded-2xl`; border `border border-bg-border` or
  `border border-warm-silver/40`; focus ring `var(--focus-ring)`.
- Line-height comes from the `:lang(ja)` rules (1.5).

### Modals / Dialogs

- Radius `rounded-2xl`, background `bg-bg-card`.
- Button order: Cancel (`bg-sand`) then Confirm (`bg-accent`).

### Header

- Height `h-14` (56px), position **`sticky top-0 z-20`**.
- Contains no menu button of its own; see §Sidebar.

### Sidebar

- Background `bg-bg-sidebar`; active link `bg-bg-elevated rounded-2xl
  font-medium`; position **always `fixed top-0 left-0 h-dvh z-40 w-60`**.
- Composition, top to bottom: **logo → current drive → views → addons →
  reorderable sections → Lock.** The drive you are on is one row at the top that
  opens the others, so the sidebar reads as a place before it reads as a menu;
  off a drive that row names the list instead ("Drives (N)"). The views carry no
  heading; the four reorderable sections (collections / pins / smart folders /
  tags) keep theirs, because their order is the user's to change.
- Section headers follow §Section Header Labels at `text-[11px]`, all drawn by
  `SidebarSectionHeading` — including the vertical margin, which is the
  component's and never a parent's.
- Two display modes (`isOverlay = routeOverlay || narrowViewport`):
  - **Inline** (≥ 1200px, non-overlay routes): no backdrop, outer layout adds
    `min-[1200px]:pl-60`, toggling persists to `localStorage["sidebar-open"]`.
  - **Overlay** (< 1200px, **or** file detail / knowledge addon at any width):
    `z-30 bg-black/50` backdrop, closes on backdrop click and `ESC`, locks body
    scroll, ephemeral state.
- Entering overlay mode forces closed; leaving it restores the preference.
- Nav-item click: **inline keeps the sidebar open**, **overlay closes it** before
  the route change.
- The hamburger is outside the sidebar, `fixed top-3 left-3 z-50`, visible in
  every state; the logo row uses `pl-12` so it does not overlap.
- Transitions `duration-150 ease-out` on the transform and the layout padding.

#### The three axes of "where you are"

Three independent pieces of state. **They are not merged**: collapsing any two
makes one answer unreachable.

| Axis | Owner | Persisted | Default | Off a drive (`/`, `/admin`) | On a drive |
|---|---|---|---|---|---|
| Is the sidebar open? | `SidebarProvider.isOpen` | `localStorage["sidebar-open"]` | open | same | same |
| Is it lending its place? | `SidebarProvider.routeOverlay` ＋ `narrow` | no | not lending | width only — there is no tree here | width, **or** the folder tree being open |
| Is the drive list open? | `SidebarDriveSwitcher.open` | no | folded | opens from the "Drives (N)" row | opens from the current-drive row |

- **With a single visible drive there is nothing to fold**: the current-drive row
  is a label rather than a button, and off a drive the list is drawn open with no
  fold row at all.
- **Exclusivity (NAV-2).** The folder tree borrows the sidebar's place while it
  is open by asking for overlay mode (`useOverlaySidebarWhen`), **never
  `close()`** — which writes `false` into `localStorage`, so the preference could
  not be restored. The breadcrumb stays in every combination, and both
  controls carry `aria-pressed` plus the active-link treatment when on — no
  accent fill.
- **The drive list's default is a default, not a suppression**, so it is not
  persisted; it folds when the drive changes.
- **Thresholds are per question**: the tree uses `md` (768px), the sidebar 1200px.

### Inspector tab strip

The row of tabs under the inspector's fixed header. What it is made of is decided
by the file, not by the layout.

- **One tab is no strip** — a Markdown note gets none drawn at all.
- **A core tab with no content is not a tab**: an archive gets a page-list tab
  when there *is* a page list, and it appears the moment that list exists.
- **An addon tab is content-gated by the entry**: core hands every `player-side`
  entry an `onAvailability(boolean)`, and one answering `false` loses its button.
  **Silence means available.**
- **An unlisted tab keeps its panel, mounted and `hidden`** — the panel is what
  reports availability, so dropping it on the first "nothing" makes that answer
  permanent. It cannot be selected and the arrow keys walk past it.
- The same answer decides the page row's beside/below toggle and, below, whether
  the canvas box is drawn (`data-occupied="false"`, hidden in CSS not removed).
- Composition **core before addon**, addons in their manifests' priority; a tab's
  label comes from its slot entry's `i18n_key`, falling back to `label`.
- Button `px-3 py-2 text-xs font-medium`, `border-b-2` as the selected indicator.
- **Roving tabindex**: one tab stop for the strip, `←` / `→` move within it.
- **Scrolls, never wraps** (`overflow-x-auto`).
- **Every panel stays mounted; only the selected one is shown** (`hidden`, not
  conditional rendering) — the occupants hold fetches, clock subscriptions and
  scroll positions, and every `aria-controls` keeps pointing at something.
- Touch floor per §Row Actions: `pointer-coarse:min-h-11` on the strip and its
  buttons.

### Context Menus / Dropdowns

Radius `rounded-2xl`; danger item `text-danger hover:bg-accent/10`.

- **An anchored dropdown measures both axes before it commits to a
  direction.** In core the measurement is `useAnchoredDirection` and there is
  one of it.
  Hanging below and to one side is right wherever the trigger has the room; on
  the Bottom Sheet's resting strip (`fixed bottom-0`, §Layering) there is none
  below it, and a menu that could only open downward was drawn entirely
  off-screen. It reads the rendered box — not a breakpoint, and not a row
  count, which the addon slot in a menu is free to change — and flips only
  when the other side is the better of the two, so a trigger with room for
  neither keeps the direction the panel reads as everywhere else. The same
  rule runs on the horizontal axis, against the panel's own rendered width.

  **The room a panel has is what is both unclipped and on screen.** The frame
  is the clipping ancestor's box intersected with the visual viewport, not one
  or the other: an on-screen keyboard shrinks what is visible without moving
  any element's box, so a panel inside a column would otherwise count room the
  keyboard is covering.

  **A panel that is not anchored decides nothing**, and the hook tests that by
  reading the panel's own computed `position` rather than by asking a media
  query which form is on screen. The toolbar menus are a viewport-spanning
  sheet below `sm` and an anchored panel above it; the sheet is pinned to the
  bottom of the screen already and has nowhere else to be.

  The clipping half of that frame is the first ancestor that clips *this
  panel*: an `overflow` box counts only while it is still in the panel's
  containing-block chain, which a `fixed` ancestor leaves for good and an
  `absolute` one leaves as far as its own containing block. Where the chain
  has no such box the visible band is the whole frame. What the walk does
  **not** do is notice an ancestor with `transform` / `filter` / `contain`,
  which becomes the containing block of even a `fixed` descendant — vaul's
  drawer is one. Inside the expanded sheet the drawer is never reached: the
  sheet's own scroller clips first.

  **Two addons still carry their own copy**, and saying so is the point of this
  paragraph rather than an aside: the intelligence addon's
  `FileAIActionsButton` runs its own version of the ancestor walk, and the
  knowledge addon's `[[` autocomplete flips against `window.innerHeight`. They
  are separate repositories, so replacing them is an addon PR and a pointer
  bump rather than an edit here, and until that happens the pair is kept in
  step by PR review — the same standing arrangement as the duplicated
  `frontmatter.py` and `credentials.py` implementations. The copy is currently
  the *older* rule: core's walk collects the frame's right-hand edge, reads the
  visual viewport's offsets and re-derives when the viewport moves, and the
  addon's does none of the three.

  **Two families are not this**, and they are named so that the next reader
  does not unify them. *Point-anchored* menus — `ContextMenu` and its callers,
  and the knowledge addon's capture button — clamp a panel to a cursor
  position; there is no trigger box to flip against. *Frame-parked* panels —
  `OverFrameSettingsPanel`'s two callers — are anchored to the viewer chrome by
  a measured decision of their own.

  `SelectionBar` is the exception the rule accommodates rather than converts:
  it opens upward unconditionally because the bar it hangs from is pinned to
  the bottom, which is right by construction.

  **The sweep is finished in core**, so `SelectionBar` above is the only
  popup left that states a direction rather than measuring one. The corner
  classes themselves live with the measurement — `ANCHORED_VERTICAL` beside
  the hook, and `MENU_SURFACE_BASE`'s `sm:`-scoped pair for the toolbar
  surface, which is a sheet below 640px and so needs a scoped spelling the
  shared table has no entry for. A panel that hand-spells `top-full` outside
  those two is a panel that decides nothing, and
  `frontend/src/__tests__/anchoredDropdowns.test.ts` enumerates the family so
  that the next one is a failure rather than a discovery.

  **A menu drawn inside the Bottom Sheet cannot take the `fixed` form**, and
  that is why the AI menu moved groups. The sheet's `Drawer.Content` carries
  a transform, so a `fixed` box inside it resolves against the drawer rather
  than the viewport, and the drawer hangs below the fold by whatever vaul has
  translated it — a menu pinned to "the bottom of the screen" opens off the
  bottom of the screen. Anchoring removes the question instead of answering
  it: `absolute` resolves against the wrapper, which is on screen wherever
  the sheet is. `e2e-components/popup-dismiss.spec.ts` measures both forms
  inside a real sheet, in both of the sheet's states.

  **And the direction it hangs in is measured too**, for the same reason
  `FileActions` measures it two paragraphs up: the file detail draws that
  action row a second time in the sheet's resting strip, which is
  `fixed bottom-0`, and a menu that could only hang downward from a row
  whose bottom edge is the bottom of the screen is off the screen. One
  state or the other is always the broken one for a constant direction.

  What keeps the `fixed … bottom-4` form is every menu that hangs off a
  *bar*, and the property that matters is not which names are on a list —
  a list of this kind has been wrong in both directions twice here. It is
  that **nothing rendered inside the Bottom Sheet or its resting strip
  spells `fixed inset-x-2 bottom-4`**, which is a claim `git grep` settles
  in one line and which stays true as components are added. The form is
  right where it is used, because a bar is pinned to the screen already
  and its menu has nowhere else to be.
  `AddButton` still records a measurement of its own menu ending below the fold
  and accepts it, and is on that list.
- **A popup is dismissed by a press outside it, and the click that press
  produces is swallowed.** One primitive, `DismissScrim`, and every
  **anchored** popup in core on it — a menu, a filter panel, a picker, a
  typeahead. It takes the popup as its child, so "outside" is a subtree and
  not a box. A modal dialog is a different pattern and keeps its own
  backdrop; `popup-dismissal.test.ts` enumerates which surfaces are which
  rather than leaving it to whichever ones happen to spell `role="dialog"`.
  The addons are each their own repository and are named where they stand:
  `knowledge`'s `[[` candidate list and `intelligence`'s AI menu are both
  on the primitive and pinned here. The AI menu was the last one
  dismissing on its own scrim's `click` — the `scrim-click` strategy
  `e2e-layout/popup-dismiss.spec.ts` measures as wrong at two of its four
  arrangements — and took the primitive in the change that stopped it
  positioning itself against the screen.

  The requirement is that **dismissing a menu must not also activate what
  is under the finger**, and it is a statement about event order. A tap's
  `click` is dispatched after `touchend`, against whatever is topmost
  *then*, so a popup that closes on the press and lets that click go has
  activated the page. Answering the press and then refusing the one click
  it produces — `document`, capture phase, `stopPropagation` and
  `preventDefault`, armed for that interaction only — says exactly that,
  and says it whatever is stacked where. A mouse hides half of the old
  defect, because cancelling `pointerdown` suppresses the compatibility
  mouse events, which is how the tree ended up with three behaviours at
  once.

  **The same holds for the press that *raises* a popup.** A long press
  opens `ContextMenu` from a 500 ms timer, and the primitive never answered
  that press — so nothing armed for the click the lift produces, and the
  tap that opened a file card's menu also opened the file. A scrim that
  mounts while a press is in flight arms the swallow for it, which closes
  the class rather than that one opener. Measured in
  `e2e-components/popup-dismiss.spec.ts`, on the real components.

  **The scrim is appearance.** It draws the dim below 640px and takes no
  pointer events at all (`pointer-events: none`, inline, so no caller's
  class list can turn it back on). Its tier says what the dim covers and
  nothing else: no dismissal depends on the scrim being the element a tap
  reaches. That is also why the case above needed fixing rather than
  ignoring: the old scrim intercepted the long press's click by accident,
  being in the way, and appearance cannot.

  That is a correction, and it cost three rounds to arrive at. The scrim
  used to absorb the click, which is a claim that it is above everything a
  finger can reach — and every rule written to hold that claim lost to an
  arrangement it had not foreseen: `z-[9]` under the inspector's tab strip;
  a band admitting `z-10`, which ties that strip and loses on document
  order; a floor-and-ceiling that forbade clearing `SelectionBar`'s
  `fixed bottom-0 z-50`, said nothing about the five scrims inside
  `FolderToolbar`'s own stacking context, and skipped the shared default
  entirely. There is no bounded list of ways one box ends up over another,
  so a rule about position loses to the next position.
  `e2e-layout/popup-dismiss.spec.ts` measures both mechanisms at four
  arrangements in a real browser; the numbers are in that PR, not here.

  A right-press retargets, and now does so by itself: the press dismisses,
  the browser's `contextmenu` reaches the row underneath, and the row
  raises the menu there. Nothing prevents or re-dispatches it.

  The scrim is written where the popup is and needs no portal: it is a
  sibling of the popup, so it is already in the popup's interactive subtree
  and in a box that *contains* whatever the popup is drawn against (inside
  the sheet, vaul makes `<body>` inert and only `Drawer.Content` is live —
  §Layering). Not the *same* containing block, and the two words decide
  different questions: a `fixed` box resolves against the viewport — or
  against the nearest ancestor carrying a `transform`, `filter` or
  `contain`, which is what vaul's drawer is — while an `absolute` one
  resolves against its nearest positioned ancestor. Fifteen of the sixteen
  scrims are `fixed`; the over-frame settings panel's is `absolute`, so
  that a panel drawn inside a frame that goes `position: fixed` cannot
  leave it. The menus themselves are not one shape: `SortButton` and the
  shared surface `useMenuSurface` hands out are `fixed` bottom sheets below
  640px and `sm:absolute` above it, while `AddButton`, `FileActions`,
  `FilterField`, `TrashToolbar`, `EditableTagChips`, `FolderPicker`,
  `SmartFolderSaveButton` and `SelectionBar` are `absolute` against their
  wrapper at every width. The split is why the anchored form's direction
  classes are scoped in one family and bare in the other.

  The scrim carries no name and no role, except where it is the popup's
  *stated* way out — the over-frame settings panel names its backdrop,
  because over media there is no page edge to say where the panel stops.
  That one keeps its pointer events and its `onClick`, which is the path a
  keyboard activation takes.

  The exception is a field, not a popup: an inline rename commits on an outside
  press and lets the click through on purpose, so that clicking a second row
  while renaming the first both commits and selects.
- **Where a popup's direction is measured, everything else anchored to the same
  control uses that same answer** — on both axes, and including an error raised
  after the popup has closed. `FileActions`'s error toast is
  `whitespace-nowrap` and wider than its menu, so a trigger near its column's
  left edge would spill the message past exactly the edge the menu was flipped
  to stay inside. One answer per trigger, or the message lands where the popup
  was not allowed to.

### Layering

Stacking is tiered. Pick the tier by what the element *is*, not by picking a
number one higher than whatever it currently sits under.

| Tier | `z` | What belongs here |
|---|---|---|
| In-flow chrome | `z-10` – `z-30` | Sticky bars, the header (`z-20`), the file-detail inspector where it covers the canvas rather than sitting beside it (`z-20`, §8.5), popovers anchored to a control, the sidebar backdrop (`z-30`) |
| Floating surfaces | `z-40` | Sidebar in overlay mode, mini-player, upload progress, bottom-anchored mobile menus including the file detail sheet's resting strip |
| Inspector sheet | `z-[45]` / `z-[46]` | The mobile Bottom Sheet — above every floating surface, below every dialog |
| Modal dialogs | `z-50` | Confirm / Rename / Move and anything else that interrupts to ask a question, including addon dialogs |
| Immersive viewers | `z-[60]` | Full-screen image gallery and archive viewer, which replace the page rather than overlay it |
| Always on top | `z-[100]` | Shortcut cheat sheet, quick note, file save, toasts |

- **Inside a tier, the number is not the whole answer, so do not build
  behaviour on it.** A sticky bar and a popover anchored to a control are
  both in `z-10`–`z-30`; at an equal number the later element in the
  document wins, a bar in its own stacking context is compared only against
  its siblings, and a `fixed bottom-0 z-50` bar is over the lot. Pick the
  tier by what the element *is* and let it decide what covers what
  visually. Nothing that has to be *correct* may depend on it —
  `DismissScrim` used to and could not be made to hold (§Context Menus /
  Dropdowns).
- **A panel that has run out of room is still in-flow chrome.** The inspector
  covering the canvas looks like a floating surface but is part of the page's
  layout; at `z-40` it buries the mini player, and at `z-20` it correctly sits
  under the sidebar's backdrop.
- **An immersive viewer takes the page out of reach, not just out of sight**: it
  marks every subtree outside itself `inert` and locks body scroll, restoring
  both on close. `useInertBackdrop` does this — attach its ref to the viewer's
  root, not `document.body`, which a viewer rendered inline is itself inside.

**The Bottom Sheet rests; it does not close.** Three states, not two:

| State | Height | What is on screen |
|---|---|---|
| peek | `56px` | The file's name and the row that acts on it — like, favourite, the AI menu, the overflow |
| half | `90vh` less `vh × (1 − 0.5)` = **40vh** where nothing is measured; on a page with a player, the room under the player's bottom edge | The top of the inspector: title, meta, action row, tags. The tab strip and the tab body are below it, and are reached by scrolling |
| full | `90vh` less `vh × (1 − 0.9)` = **80vh** | Most of that column at once, with room to read a tab |

**The snap does not set the height.** The drawer is nine tenths of the window at
both states; the snap sets how far vaul translates it down, and what is left on
screen is that height less the translate. So the fixed `half` is 40% of the
window and not 50%, and the two rows above are the same subtraction with a
different snap — which is why the Height column is written as the arithmetic
rather than as a figure, and why `inspectorThresholdParity.test.ts` evaluates it
against `SHEET_SNAP_HALF_FALLBACK`, `SHEET_SNAP_FULL` and `SHEET_DRAWER_VH`. The
third column is prose and nothing enforces it.

**`vh` above means `window.innerHeight`, and the drawer is sized in it too.** Not
the CSS unit: on a phone `100vh` is the *large* viewport, the height with the
browser's chrome retracted, while every snap point vaul computes is a fraction of
`window.innerHeight`, the height with the chrome showing. A drawer given its
height in `vh` and a snap solved in `innerHeight` are two definitions of one edge
and differ by the height of the URL bar, which puts the sheet's top that far above
where the arithmetic put it. So `Drawer.Content` takes its height in px from
`sheetDrawerHeightPx(window.innerHeight)` and carries no viewport unit at all —
the same rule as the visible-height bullet below, which is why `100%` there is the
drawer's own box rather than a copy of it.

- **`half` is where the player ends, not half the window.** On a page with a
  player the snap is derived — `halfSnapUnderPlayer` solves `drawerHeight −
  vh × (1 − snap) = vh − playerBottom`, which is the visible-height subtraction
  in the bullet below set equal to the room under the player — so the sheet's
  top edge lands on the player's bottom edge, the video stays whole and
  everything under it goes to the tab. **Derive it; do not write an offset.** An
  offset term is that expression with the drawer's height already substituted
  into it, and it goes silently wrong the moment the drawer's height moves. The
  room is bounded at both ends by states the sheet already has. Above, it never
  comes nearer than one `peek` row to `full`'s own room, or the two expanded
  states stop being distinguishable and the drag between them moves nothing.
  Below, **the derivation applies only while it gives more room than the fixed
  fraction it replaced**: under that there is nothing to buy, because a sheet
  raised to less than `half` used to show has taken the page away to protect a
  player that has already taken the screen, so `half` is the fixed fraction
  again. A phone held sideways is where that happens — the stylesheet caps a
  framed player at the scrollport's own height there — and it is a state, not a
  fallback from failure. A surface with no player — Markdown, PDF, an image —
  keeps the fixed fraction for the other reason, and `full` is unchanged
  everywhere: it is the state for reading *without* following playback, so it
  does not depend on the player's size.
- **On a phone the player's top edge is the scrollport's own, and it takes two
  rules to get there.** Anything between them is travel in front of a sticky
  box: `top: 0` only catches the player once the reader has scrolled past it, so
  the wrapper has two bottom edges and the derived `half` is solved from
  whichever was current when it was measured.
  - The media host's `p-4` is cancelled on this surface. Measured while scrolled
    and then scrolled back, the sheet covers the player by exactly that padding.
  - And so is the **negative top margin on the player's first child**, which
    bleeds the picture to both screen edges and was written to cancel that same
    padding. With the padding gone it is not a correction any more: it puts the
    player's flow position *above* the scrollport, where the top of the video is
    behind the page chrome if nothing follows the player, and where `sticky`
    corrects it downward if something does — moving the box with its size
    unchanged, which is the one channel `useSheetHalfSnap` does not watch. The
    inline bleed is untouched.

  Zero at the top, rather than smaller: any non-zero amount is the same defect
  with a smaller number in it.
- **`.media-detail-player` is the playable surface, and content does not go in
  it — nor does a box around it.** It is what the sheet's `half` clears, what
  `--player-avail` caps as a width, and what a phone makes `position: sticky`,
  so both of those are ways of taking the reader's video away:
  - **Inside it**, anything is something the sheet protects and the phone pins.
    The core action row directly under the frame belongs there — those controls
    act on what is playing. A description does not: the `loft-metadata` occupant
    in there put `half` below the video's bottom edge on `.loft` files and
    nowhere else, so its host is `MediaPlayerBlock`, as the player's **sibling**
    in a grid area of its own (`.media-detail-player-aside`).
  - **Around it** is worse, and it is the shape a first fix reached for. Sticky
    travels only inside its own containing block, so a wrapper holding the player
    and one panel has the player's own height for every file that has no panel —
    zero travel, and the pinned player scrolls off the top of the canvas instead.

  When adding anything near the player, ask all three: must the sheet keep it on
  screen, may it stay pinned to the top of the page, and is it a sibling?
- **Two gestures, and each moves exactly one thing.** The **knob** moves the
  sheet between its states — `handleOnly` is what makes it the only thing that
  can, by stopping `Drawer.Content` from calling vaul's press and drag handlers.
  A **pull on the content** collapses the sheet to `peek` and can do nothing
  else: not `full` to `half`, and not upward.

  Which pulls qualify is decided **once, when the finger lands**, from three
  numbers — whether the scroller can scroll, where it stands, and how far the
  finger later pushes past the top (`sheetPullGesture`). Deciding per frame is
  what vaul does and is the defect: it answers "may I drag?" from whether the
  scroller *happens* to be at its top, so reading with a finger still down turned
  into dragging the sheet, and a fling that coasted to the top became a drag on
  the frame it arrived. So a gesture that began below the top belongs to the
  scroller, and the sheet is handed it only after the finger keeps pushing once
  the scroller has nothing left — which is what separates "scrolled up and kept
  pushing" from "flung, and the momentum reached the top".

  The distances and speeds are in `sheetPullGesture.ts`, and the gesture is
  touch-only: refusing the browser a scroll takes `preventDefault()` on a
  non-passive `touchmove`, which pointer events cannot express, and a mouse never
  scrolls by dragging. The knob still drags with a mouse.
- **The shell stores the state, never the snap.** vaul re-derives its offsets
  from `window.innerHeight`, so `half`'s number moves when a phone's URL bar
  collapses mid-scroll; a stored number would then name a snap point that is no
  longer in the list vaul was handed. `MobileInspectorSheet` is the one place
  the state and the snap meet, and it maps back by `full`'s fixed value rather
  than by comparing against a derived float.
- **On a phone the sheet is one scroller, and the inspector inside it is not a
  second.** `InspectorShell` takes a `scroll` mode from its caller: the desktop
  pane keeps the pinned header, and the sheet asks for `column`, where the header
  scrolls away and only the tab strip stays — `sticky top-0`, against the sheet's
  own scroller. **The header goes with it**: the file's name and its action row
  scroll away and are reached by scrolling back to the top of the column, because
  the resting strip is not drawn while the sheet is up — the sheet renders the
  strip *or* the drawer, never both (`MobileInspectorSheet.test.tsx`, "draws no
  resting strip at 0.5 / 0.9", which is where that sentence can fail). What the
  strip buys is the state the sheet spends most of its time in, and the trade for
  the header is the height a `half` sheet does not have. Confirmed with the user,
  2026-09-09; do not read it as free.
- **What is on screen is the drawer less what vaul slid past the bottom edge.**
  vaul translates the drawer down by `vh × (1 − snap)` and publishes it as
  `--snap-point-height`, having assumed the drawer starts at the viewport top;
  `Drawer.Content` is `bottom-0`, so that translate lands its foot below the fold
  at every snap and a scroller filling it ends where nobody can reach. The box
  between the drawer and the scroller is
  `calc(100% - var(--snap-point-height, 0px))` — vaul's own number, so no snap
  value, no handle height and no viewport unit is written a second time, and a
  snap point added later needs no edit here. **Do not shrink `Drawer.Content` to
  correct the overhang.** vaul's translate is a pure function of
  `window.innerHeight` and the snap — the drawer's own box is not an input — so
  shrinking it moves the drawer's top *down* without moving the translate, and it
  is the drawer's height that the correction subtracts from. At `h-[50vh]` and
  snap `0.5` the whole drawer would sit at or below the fold.
- **The drawer exists only while it covers the page; the strip is drawn outside
  it.** vaul hands Radix's `Dialog.Root` only `open` / `defaultOpen` /
  `onOpenChange`, so Radix defaults to modal and `hideOthers()` puts
  `aria-hidden="true"` on the whole application. **`modal={false}` does not avoid
  this.** The cost is that what is below the strip unmounts on collapse.
- **The player is stuck to the top of the canvas in CSS and is never told about
  the sheet** — the sheet publishes `data-sheet-snap` and a stylesheet reads it.
  Handing state down re-renders the player, and re-parenting it reloads any
  `<iframe>` and restarts a `<video>` at zero with `ended` rebound.
- **Sticky goes on the element that can travel** — the child of the tall thing,
  not a wrapper holding only the player.
- **At `full` the player is behind the sheet and stays there**: docking it into
  the strip puts it inside `hideOthers()`, and moving it inside the drawer means
  re-parenting.
- **The resting strip owns `bottom-0` on the file surface.** Anything new that
  anchors to the bottom of a file page goes above it.
- **Fade the backdrop from the first snap point** — vaul's default is the last,
  which leaves `half` covering the page with no dim.
- A dismiss gesture — backdrop, Escape, swipe down — collapses to peek.
- **A dialog never hard-codes `document.body`**; it portals into
  `useDialogPortalTarget()`. The sheet runs vaul in `modal` mode, so a dialog
  portalled beside it would be stacked correctly and still be inert.

### Over-video chrome (player controls, mini-player buttons, full-screen viewers)

Chrome **on top of a video frame** is the one place that deliberately ignores the
theme tokens: the backdrop is the video itself, near-black in practice, so
theme-following surfaces would render pale controls on a black frame in light
mode. This is about chrome over a frame, not about video — the full-screen image
gallery and the archive's image viewer are bound by the same rules.

- Foreground `text-white`; secondary `text-white/70`; dividers and inert marks
  `text-white/50`.
- Buttons transparent at rest, `hover:bg-white/15`; standalone circular buttons
  `bg-black/70 hover:bg-black/90`.
- Sizes `h-11 w-11` (44px) in a control-bar row; a standalone transport button on
  touch steps up to 64px and takes a **lighter** disc
  (`bg-black/50 hover:bg-black/70`), because opacity that reads as a backing at
  32px reads as a blob at 64px.
- Control-bar backdrop `bg-gradient-to-t from-black/80 via-black/50
  to-transparent` — legibility, not decoration, and not subject to §4.
- **Over an embedded player** the scrim is `bg-gradient-to-t from-black/95
  to-black/60` plus `backdrop-blur-[3px]` on its own `-z-10` layer, because the
  embed draws chrome in the same strip that a thin scrim lets read as a second,
  broken row of controls. It needs
  `[mask-image:linear-gradient(to_top,black_0%,black_55%,transparent_100%)]` and
  its `-webkit-` twin, or the blur ends at a visible seam. **Revert to the plain
  scrim while the embed owns the frame** (ad, end screen).
- Track fills `bg-white/25` empty, `bg-white/40` buffered, `bg-accent` played and
  volume. A range input over video paints its own track.
- Focus rings still use the themed `ring-focus-ring` token; radius follows §5.
- **Transient gesture feedback** is the one place a half-disc appears: `w-1/2`
  `bg-white/15`, rounded on its inner edge only, icon plus label,
  `animate-fade-in-scale`, self-clearing, `aria-hidden` — the same operation must
  also be a real button or shortcut.
- **Transient state pills** use `bg-black/70 rounded-2xl` at `top-4` centred.
- **Player settings are one panel** (`bg-black/85`) inside the frame, in two
  shapes: a full-width sheet from the bottom edge on touch, a `w-64`
  `rounded-2xl` popover above its button on mouse. **No bare native controls in
  the bar** — a `<select>` is sized by its widest option and drawn by the OS.
- **Chrome over a frame withdraws after 2 seconds of being left alone** and
  returns on pointer movement, a key, or focus — **not on a press**, because the
  frame's centre tap toggles the chrome and a press that restored it would cancel
  itself. On a coarse pointer the tap toggles it and a press *on the chrome*
  restarts its clock.
- Withdrawn chrome is `inert` per §Layering; `opacity: 0` alone leaves it in the
  tab order.
- **A panel open over the frame holds the chrome open** and owns `Escape`.

Do not "fix" these to semantic surface tokens. Everything **outside** the frame
uses the themed tokens.

### Tables ("quiet editorial" style)

Default table aesthetic for MarkdownPreview and any other reading surface:
**dividers and font-weight alone carry structure** — no fills, no zebra, no cell
grid.

- `border-collapse: separate; border-spacing: 0`, so a cell can carry its own
  accent border without colliding with its neighbours.
- `th`, `td`: `border-bottom: 1px solid var(--bg-border)`, padding
  `0.6em 0.85em`, `text-align: left`, `vertical-align: top`.
- `thead th`: **no background fill** — the bottom rule plus `font-weight: 650`
  carries the header role.
- **Exception**: vertical-header tables (`tbody th`) may keep a subtle fill on
  the header column.
- Mobile (`max-width: 767px`): `font-size: 0.93em`. Do not reflow — horizontal
  scroll is preferred to structure loss.

### A control table: say each explanation once, and keep the headings

The listings' rule — *draw a column only where its values differ*
(`lib/listMeta.ts`) — is not about listings. It is about repetition, and a
table of settings repeats harder: the drive axis multiplies everything on the
other one.

- **A line whose words do not change from row to row is not telling the reader
  which row they are on.** What varies per row is the control; the sentence
  explaining what the control does is a property of the column, so it goes
  once, below the table, and the row keeps the control and its name. Measured
  on `/admin/settings`: one help paragraph rendered four times, wrapped into a
  186px column, and the table stood 1152px against an 863px viewport. Saying it
  once left 548px.
- **Conditional does not mean per-row.** A warning drawn only for switches that
  are off still says the same words on every row that draws it. It belongs in
  the same place, shown when any row is in that state.
- **A legend entry for a control nobody can see is a heading for a thing that
  does not exist**, which the redesign's first principle rejects. Derive the
  entries from the rows the table is actually showing.
- **Column headings are `sticky top-0` inside a bounded scroller, not the
  page.** `position: sticky` resolves against the nearest scrollport, and a
  wrapper with `overflow-x: auto` is already one in both axes — a sticky head
  inside an unbounded one sticks to a box that never scrolls and does nothing.
  Measured: 290px above the viewport, i.e. gone. Cap the wrapper (`70vh`) so it
  becomes a real scrollport.
- **The cap is a trade, and where it falls is arithmetic, not a promise about
  phones.** The wrapper scrolls wherever the table is taller than 70% of the
  viewport. For the addon-policy table that is 548px at four drives, so it
  scrolls below a 783px viewport and not above one — **every phone is below**,
  and there a phone gets a nested scroller in both axes at once. What it buys
  is the headings, without which four columns of checkboxes are unlabelled.
  State the boundary; do not say "the scrollbar does not appear", which is true
  only of the window the number was taken in. `DESIGN.md` §8.5 already carries
  #201's correction of the same mistake.
- **`sticky` goes on the `th`, not the `tr`**, which is not a positioned box in
  most engines, and the cells need their own background or the rows travel
  visibly underneath them.

### Search result timestamp pills

- **`text-text-muted`** with `hover:bg-accent/10` — not `text-accent`, and
  specifically not §2.5's rule for timestamps inside a description: in a result
  row the timestamp is the third rank of information, under a title that is not
  accented itself.
- At most three per hit, de-duplicated on the whole second, with a quiet `+N` for
  the rest. One rule for both surfaces (`frontend/src/lib/matchTimestamps.ts`).

### Match badges and their legend

- **One table.** `frontend/src/lib/matchBadges.ts` holds the eight badges' keys
  and tokens; both drawing surfaces and the legend read it, so the legend cannot
  describe a badge nobody draws or leave one unexplained.
- **The explanation is not on the badge.** No `title`: with an accessible name
  present it becomes a *description* read out a second time (§Row Actions), and
  it never appears on a touch screen.
- **It is asked for, never volunteered** — a footer entry in the search popup, at
  `pointer-coarse:min-h-11` and outside the scrolling list.
- **It is not a second modal.** The legend takes the list's place and Escape
  closes the legend alone, ordered by `NESTED_OVERLAY_PRIORITY` in
  `lib/shortcuts.ts` rather than by registration.

### Search Snippet (MatchOverlay excerpt row)

The one-line excerpt showing *where* a hit matched. A quotation in a dense
surface, so it deliberately does **not** reuse §3.3's `blockquote` treatment — a
fill would read as a nested card and collapses into the row's hover state.

- Marker `border-l-2 border-bg-border pl-2` — a rule, never a fill, never §3.3's
  accent border.
- Text `text-[11px] leading-relaxed text-text-muted`, `line-clamp-2`; the excerpt
  is truncated in the data layer too.
- **One snippet per hit.** Do not stack a row per match.
- Row actions follow §Row Actions, plus: keep the action's box in flow at
  `opacity-0`, so revealing it never reflows the excerpt.

### Row Actions

A control repeated once per row — the capture button on a search snippet or a
transcript line, a `⋮` on a list row.

- **Trailing edge of the row**, in flow, sized so revealing it reflows nothing.
- **Hidden by default, revealed by the row**: `group/<name>` on the row and
  `opacity-0 group-hover/<name>:opacity-100 group-focus-within/<name>:opacity-100`
  on the action. The group goes on the **row**, so focusing the row's primary
  control reveals the secondary one.
- **`opacity-0`, never `hidden` / `invisible` / `display: none`** — those take
  the action out of the tab order and `group-focus-within` has nothing to fire on.
- **Always visible under `pointer-coarse`**: `group-hover` compiles inside
  `@media (hover: hover)`, so a touch device gets no reveal at all without it.
- **A name per row, not per control.** Put the row's identity in the accessible
  name. Do not also set `title` to the same string — with an `aria-label` present
  it becomes the accessible *description*, read after the name.
- **Touch targets: 44px on `pointer: coarse`, 32px on `fine`.** 32px already
  clears the 24px minimum for repeated icon-only controls, and 44px everywhere
  costs height a transcript of several hundred rows cannot spare.
- **Every control in the row, or the floor buys nothing.** A list whose
  secondary action clears the floor while its primary one does not has spent
  the width and kept the miss: the finger still lands between two targets, and
  the one it was reaching for is the small one.
- **More than one of them is a group, not a sequence.** On `pointer: coarse`
  they sit together at the trailing edge with **no gap between them**, and the
  group's own padding replaces the row's gap and trailing padding rather than
  being added to it. A 44px target carries 14px of empty box on each side of a
  16px glyph; a row that then draws its gap and its padding around that has
  drawn the same separation twice, and both times out of the name. The leading
  padding stays: a thumbnail has no padding of its own to stand in for it. A row
  that draws *no* trailing control keeps its trailing padding for the same
  reason.
  **The rule is the floor's, so it ends where the floor does**: at a fine
  pointer the boxes are their own size and carry no padding to stand in for the
  row's, so the group keeps the row's gap between the controls and the row keeps
  its trailing padding. Cancel the spacing under the same condition that grows
  the boxes, never unconditionally: controls left at their own size have only
  their own padding between them, and taking the row's gap away as well leaves
  the two glyphs closer than either rule asked for.
  **Cancel only the spacing around boxes you wrote.** A group may stand its own
  padding in for the row's when it knows what is inside each box — every
  control the list row's group holds carries the floor in its own class list
  (`ROW_ACTION_FLOOR` in `rowFurniture.ts`), so the group can say the 14px is
  already there. That holds however many the row draws — a star and a `⋮`, or
  either of them alone — because it is a property of each control rather than
  of the group's size. `.file-action-row-touch` cannot: it *imposes* a floor on
  children it does not write, through a `> *` rule in `globals.css`, and those
  children are shared buttons drawn at other sizes elsewhere plus whatever an
  addon put in `file-detail-actions` — which brings its own trigger and takes
  no sizing from the host. A group that cannot say what its children's boxes
  contain keeps a real gap between them (`gap-0.5` in the resting strip, `gap-1` in the
  inspector) and gives up none of its host's padding. It takes the floor from
  this section; it does not take the grouping.
- Reach the floor on **the row** (`pointer-coarse:min-h-11`), and give the row's
  own controls the same class wherever `items-start` stops them inheriting it —
  **unless the control is a `Button`**, which brings §6's own answer either
  way: labelled shapes carry the floor class, `iconOnly` takes the overhang.
  A hand-written copy on either is the duplication §6 says no call site should
  write — including on `iconOnly`, whose 32px box is the deliberate shape and
  not an omission to patch.
  Then grow the *action's* hit area rather than its box — `relative` plus
  `pointer-coarse:before:absolute pointer-coarse:before:-inset-1.5` — so the icon
  stays 32px at every pointer type. The 44px row is what makes that overhang
  safe: at a shorter pitch, adjacent pseudo-elements overlap and the later row
  wins the hit test.
- **Grow the box instead wherever the controls are side by side.** The overhang
  above is safe *down a column that has reached the floor*, where the row pitch
  is what separates neighbours — that precondition is the bullet above's, and
  repeating `iconOnly` buttons down a list without giving the row the floor
  reproduces the defect the overhang was written to prevent (`Button.tsx`).
  Along a row it is not: two overhung 32px boxes sitting together overlap, and
  the later sibling wins the hit test for its neighbour's edge — so each one
  silently keeps less than it appears to have. A trailing group and the action
  row in the resting strip both take real 44px boxes for this reason
  (`rowFurniture.ts`, and `.file-action-row-touch` in `globals.css`).
  **This is where the `Button` exception above stops.** A `<Button iconOnly>`
  keeps its 32px box at every pointer type, so it is not a control that has
  reached the floor and does not belong in a group that has cancelled its own
  spacing on the promise that its children have. Use the group's own recipe
  there, or a labelled shape.

### Section Header Labels (i18n)

The label above a group of rows — an admin section, a sidebar section. This is
the upper rule; §Sidebar defers to it rather than stating its own.

- `font-semibold text-text-muted`.
- Do **not** use `tracking-wider` — these render Japanese text (§3.5).
- Do **not** use `uppercase`. It does nothing to Japanese, so on a column that
  mixes scripts it becomes one more axis the headings differ on.

| Surface | Size |
|---|---|
| Admin / setup sections | `text-sm` |
| Sidebar sections | `text-[11px]` |

The sidebar is `text-[11px]` and not `text-sm` because its rows are `text-sm`: at
the same size the heading and the rows stop being two levels.
**Addon surfaces are not there yet.** Fourteen labels across three addons still
carry `uppercase` — most of them `<h2>` / `<h3>` section headings, not field
labels. Counted as occurrences of `uppercase` in each addon's non-test `.tsx`,
so the table can be checked rather than remembered:

| Addon | Count |
|---|---|
| `media_import` | 11 |
| `knowledge` | 2 |
| `intelligence` | 1 |

They are the same shape and want the same sweep; it reaches three submodules, so
it is deferred rather than smuggled into the change that wrote this rule.
**New addon headings follow the rule above** — the fourteen are a backlog, not a
precedent. `frontend/src/__tests__/sidebar-headings.test.ts` enforces the rule in
core only, for that reason. **An addon heading that lands inside a core surface
is not part of the backlog** — it is a violation the moment core's neighbouring
headings change.

This governs headings. A `<dt>` field label in §Properties Panel and a machine
string on a row are not headings, and keep `uppercase`.

### Properties Panel (Obsidian-style frontmatter display)

A Markdown note's frontmatter, above the rendered body, as a label-value table.

- **Container** `rounded-xl overflow-hidden border border-bg-border
  bg-bg-elevated` — **matches `.markdown-body pre` exactly**, because the Panel is
  the metadata counterpart to code blocks in §3.3's content-block family.
- **No row dividers**: `py-2.5` padding alone separates rows.
- **Row** `grid grid-cols-[minmax(80px,auto)_1fr] gap-x-4 px-4 py-2.5`; label
  (`dt`) `text-xs uppercase tracking-wide text-text-muted` — matches the
  section-header label style but stays terse (one token); value (`dd`)
  `text-sm text-text-primary break-anywhere` with `min-w-0`.
- **Empty frontmatter renders nothing.** Recognised keys get typed renderers;
  unknown keys fall through to plain text.
- **Truncate values, never the Panel**: `description` is `line-clamp-3
  hover:line-clamp-none`, `source_file_ids` shows five cards and a "more" button.
- **Origin badge** `rounded-full` — `webclip` `--accent`, `detailed_summary`
  `--accent-teal`, `manual` the muted elevated fill. No `--origin-*` token.
- **Internal radius**: Panel `rounded-xl`, inner chips and cards `rounded-lg`,
  tag and origin chips `rounded-full`. No `rounded` / `rounded-md` — outside §5.
- **Hover affordance** uses warm neutrals
  (`hover:border-warm-silver/60 hover:bg-bg-elevated`), never
  `hover:border-accent`: §2.2 reserves `--accent` for CTAs.

### Editable Tag Chips (EditableTagChips)

The `tags` row in editable mode, and the canonical tag-editing surface for
non-`.md` files.

- **Chip** `rounded-full bg-accent-teal/15 text-accent-teal px-2 py-0.5 text-xs`
  — matches the read-only `TagPill` exactly, so read and edit modes do not shift.
- **Per-chip remove**: trailing `<X size={11}/>` in a round button,
  `hover:bg-bg-elevated`. No danger hover; deletion is undo-able by re-adding.
- **"Add tag"** is a muted chip
  (`bg-bg-card text-text-muted hover:text-text-primary`), told from real chips by
  the absence of the teal fill.
- **Input** `rounded-full bg-bg-card px-2 py-0.5 text-xs`, `focus:ring-2
  focus:ring-accent`, in the same row as the chips.
- **Autocomplete popover** `absolute top-full left-0 z-10 mt-1 w-40 rounded-lg
  bg-bg-card py-1 shadow-lg`, scoped to the current drive, max 5 rows.
- **Selected suggestion** uses `bg-accent text-white` — the only `--accent` on a
  chip surface, because the highlight follows a specific user action and counts
  as a CTA-equivalent per §2.2.
- **Keyboard**: Enter commits, arrows navigate, Backspace on an empty input drops
  the last chip, Escape cancels.
- **Inline validation error** `mt-1 text-xs text-danger`, only once triggered.
- **Persistence**: 2s debounce via `createDebouncedTagSaver`. Do not surface
  saving/saved state in the chip row — the error line handles failures.

---

## 7. Animation

| Utility | Motion | Used on |
|---|---|---|
| `animate-fade-in` | 200ms fade | General element appearance |
| `animate-fade-in-scale` | 200ms fade + scale 0.95→1 | Modals, dialogs |
| `animate-slide-up` | 250ms slide (center-anchored) | Toasts |
| `animate-slide-up-bar` | 300ms cubic-bezier slide | Selection bar |
| `animate-pop` | 250ms scale 1→1.25→1 | Heart / favorite icons |

A pull on the Bottom Sheet's content follows the finger with no transition at
all, and springs back over 200ms `ease-out` when it is released without earning
the collapse — the same figure and the same reason as the listing's FLIP below: a
box travelling back to where it belongs.

All animations are disabled under `@media (prefers-reduced-motion: reduce)`. That
includes the ones written as inline transitions from JavaScript: the rule at the
top of `globals.css` caps every `transition-duration` with `!important`, which an
inline style does not outrank.

### A change to a list's contents is carried, not cut to

When the set of cells in a listing changes, the cells that were already there
travel from where they were rather than appearing at their new size and position
in one frame. The previous rect is inverted with a `transform` and released
(FLIP); 200ms, `ease-out`, as the table above.

Three conditions decide it, and they are conditions rather than a list of the
controls that meet them. **Do not write the list here.** Which control lands on
which side depends on the width, the folder, and how far a filter narrows, and
it has been recorded wrongly twice.

- **A cell has to have somewhere to come from.** One that did not exist before
  has no previous position, so it is never moved into place — it fades in over
  the same 200ms. A change where *no* cell survives is a different listing
  rather than a change to this one, and is not carried at all.
- **The measurement has to still describe the container.** A grid whose own
  width moved is left to snap, and so is the first change after it moved:
  following a drag frame by frame reads as weight, and the width the cells were
  last measured at is what tells the two apart.
- **`prefers-reduced-motion: reduce` writes no transform at all.** Shortening
  the transition is not enough on its own — the inverted frame is painted before
  the transition starts.

The play's length is written in three places — the CSS state, the constant, and
the delay after which the marks come off. The marks coming off cancels a play
still running, so the delay must outlast the CSS; tests read all three.

`hooks/useJustifiedFlip.ts` and the two `.justified-grid-cell[data-flip]` states
in `globals.css`.

---

## 8. Display preferences applied before first paint

One inline script in `<head>` — `lib/preferenceInitScript.ts` — reads two
preferences from `localStorage` and stamps both onto `<html>`, so neither flashes
the other value for a frame. Both are then acted on entirely in CSS.

- **`data-theme`**, from `theme-preference`: `'light'` and `'dark'` apply their
  own rules; `'system'`, or nothing stored, is resolved from
  `prefers-color-scheme`. The attribute is never written as `system`.
- **`data-media-layout`**, from `media-layout-preference` — see §8.5. Its default
  is `DEFAULT_MEDIA_LAYOUT`, exported from the same module and imported by
  `lib/mediaLayout.ts`, so the two cannot drift.
- **Only the storage reads are inside its `try`.** A browser with site data
  blocked throws from `getItem` itself, and an unguarded throw skips both
  `setAttribute` calls; wrapping the whole body would discard
  `prefers-color-scheme` instead.
- **`data-media-layout` is written first**, ahead of anything that can throw,
  because it is the attribute whose CSS fallback does *not* match its JS default.
- Anything else reading a preference goes through `lib/safeStorage.ts`.

---

## 8.5 Layout

### File detail: one shell, two canvases

Every kind the file detail shell carries gets the same page row, the same fixed
inspector header and the same Info tab. What differs is the canvas, and there are
only two:

| Canvas | Kinds | What is in it |
|---|---|---|
| **Document** | a Markdown note, and the HTML preview that borrows its single scroll | the Knowledge editor, with the note's own chrome in the page row (save dot, view-mode switch, click-to-edit filename) |
| **Viewer** | **everything else** | the viewer, and what belongs to that viewer alone — a media file's description, its long AI summary, and the transcript when the reader has put it below the player |

**The viewer has the column to itself**, rather than sitting at the top of one
column with metadata stacked under it, where its height is whatever is left over.

- **On the canonical surface the shell carries every kind, and the table above is
  read as a default with one exception rather than as two lists.** It was two
  lists — media, then PDF, archives and images, each added by name as it was
  looked at — and what that produced was not a decision about the kinds outside
  it but a *fallthrough*: an `.xlsx` had no inspector and no way to open one, and
  neither did `text/plain`, which was the largest group left behind and does have
  a viewer. A predicate whose answer is "the ones somebody remembered" is wrong
  again the next time a mime is classified into a new kind.
- **A kind with no viewer is not an exception to this.** The *cannot be shown*
  panel and its download are what goes in the canvas, and the reason the page is
  worth having is the same one: the title, tags, relations and comments belong in
  the inspector whether or not anything can be drawn beside them.
- **The exceptions are named where they are actually exceptional**, and they are
  not all the same shape — listed rather than counted, because a count is a claim
  about completeness:
  - `usesDocumentShell(mime, editorEnabled)` — which canvas goes inside the
    shell, the editor's single scroll or a viewer.
  - `viewerTakesCanvasFloor(fileType, mime)` — whether the viewer gets a floor
    under it, and the allowlist inside it is where "which viewers have I actually
    looked at" is written down for that question.
  - **The surface, which is not a predicate at all**: a `FileDetailSurface` the
    caller declares, honoured by one line inside `ridesFileDetailShell` and set
    to `"collection"` at exactly one call site (`FileDetailFullScreen`). The
    collection route keeps the stacked layout deliberately — the canonical URL is
    a file's address, so a second inspector on the theatre route would be work to
    throw away — but nothing in this file decides that, so a second caller
    passing `"collection"` would move a page off the shell with no predicate to
    notice.

### Inspector column (document layout)

The Markdown document layout puts an inspector beside the canvas: file meta,
tags, related files, comments and the addon sections that fit a narrow column.

| Token | Value | Meaning |
|---|---|---|
| inspector width | `24rem` (384px) | Fixed, in both forms. Where the row cannot hold it beside the canvas it covers the canvas at the same width rather than narrowing — at 320px Japanese wraps at 12–14 characters a line. |
| canvas padding | `2rem` (32px) | What the canvas puts around its own contents. Part of the sum below because the player is inside it — leave it out and the padding comes out of the player. |
| beside threshold | `60.5rem` (968px) | Player minimum + canvas padding + inspector width, measured on the row that holds both. Never on the canvas: the canvas is what changes width when the inspector opens, so measuring it would make the answer depend on the answer. |

**A separate entry from the companion rail below, despite the same number.** They
are different parts — one holds a document's metadata, the other follows a
player's clock — and they arrive at 384px for the same reason rather than by
sharing a value. Merging them would make a later change to either look like a
change to both.

### The Related group

One heading over both kinds of relation — core's own `file_relations` and
whatever an addon derives (similarity, shared keywords).

- The group heading is drawn **only when there is a second source to group
  with**, asked of the slot catalogue and not of the DOM: a derived source may be
  a collapsed control that has computed nothing yet.
- Group heading `text-sm font-semibold text-text-muted`.
- **Its members are a step quieter**: `text-xs font-medium text-text-muted`, no
  card and no glyph of their own — at section weight a member is louder than the
  heading grouping it, which reads as two lists rather than one.
- Ungrouped, core's relations are a section again and keep the card every other
  section has. The collection-playback route draws the group too, because an
  addon that moved its entry here is no longer reachable through
  `file-detail-sections`.
- **The members live in two repositories**, so the weights above are the contract
  between them.

**The list of relations takes a second column at `45rem` of its own width**, and
that width is not the window's: the same list is drawn in the 24rem inspector
rail, in the canonical vertical stack (the window less the 280px tree pane) and
in the collection route's, capped at 1120px by `max-w-6xl`. A viewport
breakpoint put two columns inside a 351px rail — 172px tiles showing four
characters of a 27-character filename, on every tile, at every window width.

| Token | Value | Meaning |
|---|---|---|
| second-column threshold | `45rem` (720px) of the **list's own width** | `2 × 22rem + 0.5rem gap = 44.5rem`, rounded to a whole rem **upward**. A second column is worth having exactly where each column is at least as wide as the one column the rail already gives, and rounding down inverts that: at `44rem` each column is 348px against the rail's 352 and reads a character worse. Measured on `15792094940_54b0fd8f84_o.jpg`: 26 characters in the rail, 25 at a 44rem switch, 26 at 45rem. |
| the rail's own grid | `22rem` (352px) | The 24rem rail less the pane's `px-4`, **before its scrollbar**. The pane always scrolls, so a classic 15px scrollbar leaves 336 instead; derive from the widest form, because the threshold has to satisfy the widest rail it can face. The rail's own column count is the same either way. |

The wrapper carrying `container-type` is inside the section, not the section
itself: ungrouped it has `p-4` and grouped it has none, so the section's inline
size is the list's width in one case and 2rem more in the other, and one
threshold could not mean one width on both.

### Companion region (media file detail)

Chapters and the transcript. **A player's, not a canvas viewer's** — a PDF has a
viewer but no playback clock, so the region, its tabs and the control that moves
them are absent there. **Where it goes depends on which surface the file is on**,
and the two answers are not variants of one layout:

| Surface | "Beside" means | "Below" means |
|---|---|---|
| Canonical (`?file=`), on `FileDetailShell` | a **tab in the inspector** | a bounded box in the canvas, under the description |
| Collection playback (`/files/{id}`), legacy stack | a **second column of `.media-detail-grid`** | the same box, under the player |

The canonical surface has an inspector, so a column of its own would be a third
one; the collection route deliberately has none and keeps the grid it had.

**The occupant is moved, never duplicated.** It fetches, subscribes to the
playback clock and holds a scroll position, so a second copy is a second
competing reader of the same file.

| Token | Value | Meaning |
|---|---|---|
| rail width | `24rem` (384px) | Fixed, on the grid. 320px was tried first and Japanese wrapped at 12–14 characters a line, which reads as cramped. **§The Related group's `45rem` is twice this less the inspector's padding, plus a gap — change this and recompute that**, and note it moves twice as fast as the `60rem` below. |
| box height | `60%` of the measured scroll container | The bounded box below the player: `calc(var(--rail-avail) * 0.6)`, falling back to `60dvh` before the first measurement — "60vh", but measured, because a self-scrolling pane is not the viewport. |
| below: index column | `12.5rem`–`22rem` (200–352px) | The chapter list beside the transcript. 200px is the floor; past about 350px a column of timestamps competes with what it indexes. |
| below: body column | `68ch` | The reading measure, and the body's **flex base**, not only its cap. Base and cap being one number is what makes the split exact: below the pair's combined width the body absorbs the whole deficit, above it the index takes the whole surplus. |
| player minimum | `34.5rem` (552px) | Narrower than this and a 16:9 video stops being watchable. |
| gap | `1.5rem` (24px) | The standard section gap. |
| switch threshold | `60rem` (960px) | The sum of the first, fifth and sixth. |
| lead cap, stacked | `12rem` (192px) | Most a short index may take of the box. |
| lead cap, rail | `22rem` (352px) | The same index where there is room for it. |

The threshold is a **sum, not a feel**. Change either minimum and recompute it.

**Four thresholds, four questions. Do not merge any two of them.**

| Threshold | Question | Measured against |
|---|---|---|
| `60rem` = 960px | Can a rail sit beside the player? | The host's **measured width**. Gates the grid's second column, so it applies on the collection route only — on the shell the companion is a tab, and a tab fits at any width. |
| `60.5rem` = 968px (`INSPECTOR_BESIDE_MIN_REM`) | Can the inspector sit *beside* the canvas, or must it cover it? | The **measured width of the row holding both** — never the canvas, whose width is the thing being decided. |
| `1120px` (`VIEWPORT_OPEN_THRESHOLD`) | Does the inspector *start* open? | The **viewport**. Not a layout branch: it is how the default is derived when the reader has no stored choice, and any choice they make outranks it. |
| 768px | Is the inspector a pane or a Bottom Sheet? | The **viewport**. |

**The middle two are the pair that has to stay apart**: the viewport decides
whether the inspector *starts* open, the container whether it can be *beside*. A
preference outranks the first; nothing outranks the second, because it is a fact
about the space rather than a choice about it. Keying placement to the viewport
puts a 296px video on screen at 1200px, because the shell also renders inside the
2-pane right pane, where an inline sidebar and a 280px tree have already taken up
to 520px the viewport says nothing about. 960 and 968 are both container
questions and still not one: 960 asks whether a *rail* fits beside the *player*,
968 whether the *inspector* fits beside the *canvas*. Every one of these is
derived in `lib/layoutSizes.ts` from the same three primitives, and the rows
above are asserted against it.

- **The host holds the height, in both forms.** Which form is in use is a
  container-width question answered in CSS while an occupant is handed its props
  in JS, so an occupant cannot know which form it is in and must never bound
  itself.
- **Lead and fill, not equal shares.** The region takes a *lead* that sizes to
  its own content under a cap (a short index) and a *fill* that takes whatever
  remains (the long body).
- **The lead must not shrink.** In a box sized by `max-height`, the fill's
  `flex-basis: 0%` does not resolve to zero — a percentage basis against a
  content-derived main size falls back to content — and shrinkage is distributed
  by `flex-shrink × base`, so the lead's small share of an enormous shortfall is
  still many times its own height. Give the lead `flex-shrink: 0`.
- Both caps are absolute (`rem`), because a percentage `max-height` does not
  resolve against a content-height parent either. Where a measured height is
  available (`--rail-avail`), cap against the smaller of the two.

### Measure against the container, not the viewport

Any layout that can appear both full-width and inside a pane must switch on the
width **it actually has**, never on a viewport breakpoint. The file-detail
surface renders in the full-screen route and in the 2-pane right pane, which is
280px narrower than the window; a `lg:` rule fires on window size and splits the
pane at widths where two columns do not fit. This is the general rule, not a note
about one component.

**Which mechanism depends on what is inside.** A container query (`@container`)
is the natural tool, but `container-type` establishes a containment context, and
on iOS Safari a containment context wrapped around a `<video>`, `<audio>` or
cross-origin iframe renders the whole subtree rotated and continuously spinning.
No desktop browser shows it.

- **No media in the subtree** → `@container` + `@4xl:`-style rules.
- **Media in the subtree** → measure with a `ResizeObserver` and publish a
  `data-*` attribute the CSS branches on. This form is also the testable one:
  container queries are not evaluated by jsdom, attributes are.
- Keep the threshold in `rem` on both sides and resolve it against the root font
  size when measuring, so scaled text still gets the layout the numbers were
  chosen for.
- **"No media" is a fact about the scope, so scope it deliberately and hold it.**
  Put `container-type` on a wrapper whose subtree is only the thing being laid
  out, not on a section that also hosts an addon slot — an addon may render
  anything. jsdom cannot see a column count but it can see a `<video>`, and on
  this question it is the only suite that can, because no desktop browser
  reproduces the bug.
- **Ask whether media is *reachable*, not whether it is in the first paint.**
  This repository's `<video>` is not in anybody's initial render: `VideoPreview`
  mounts one 200ms after `mouseenter`, and `lib/cardGrid.ts` names exactly that
  as the reason the card grids measure instead of asking `@container`. A guard
  that renders a subtree and looks at it passes the change that adds a hover
  preview. Fire the events and run the timers out first
  (`relatedFilesFixtureParity.test.tsx`), and declare the scope's whole shape —
  the host's children and the grid's — so anything added anywhere inside it is
  red rather than only the elements someone thought to name.
- **Put the wrapper where its inline size *is* the laid-out element's width.**
  A section whose padding changes with context (the related-files list has `p-4`
  standing alone and none inside the Related group) cannot be the container: one
  threshold would mean two different widths.

**A container query is not verifiable by reading the stylesheet.** #200 measured
that: the defect came back in full by appending one line to the end of
`globals.css` and every suite stayed green. A new threshold gets a case in
`frontend/e2e-layout/`, which lays the markup out in Chromium against the app's
own compiled sheet, plus a parity test keeping that fixture's markup the
component's.

**A core grid of equal cards goes through `lib/cardGrid.ts`.** Do not write
`repeat(auto-fill, minmax(min(16rem, 100%), 1fr))` — or a `sm:`/`lg:`/`xl:`
column count — into a card grid directly. Call `useCardColumns()`, attach its
`ref` to the grid element, and pass its `columns` through `cardGridTemplate()`.

**Card grid minimum width: `16rem`. Minimum column count: 2.**
`min(16rem, 100%)` collapses to a single column below 256px, and a 375px phone
then shows one full-width tile per row — less per screen than the list view. The
count is measured rather than left to CSS because it is also a **number** the
shelves need. An unmeasured grid still holds the floor: `cardGridColumns` caps
its track at `calc(50% - <half the gap>)`.

**The gap is part of the rule, not a per-grid choice.** `columnsFor` divides by
`CARD_MIN_PX + CARD_GAP_PX`, and a folder row only lines up with the file grid
beneath it if their tracks start at the same x — which needs the same gap, not
just the same count. Every card grid uses `gap-3` on the column axis; the row
axis is free.

Card widths the rule produces, at `gap-3` and less the page's `px-4` gutters:
**≈165px at 375px** and **≈178px at 400px** (2 columns), **≈294px in a 600px
pane** (2 columns) and in a 1213px canvas beside the open tree pane (4 columns).
Every card grid measures itself, so the file grid (`FileGrid`), the folder grids
above it (`FolderContent`, `DriveHome`, `RightPaneFolder`) and the trash and
missing grids all agree. Breakpoint column counts cannot do it: they fire on
window size and so mis-count inside the tree pane, which is 280px narrower than
the window.

### Justified thumbnail rows

A folder whose rows are all photographs does not go into equal cards: a 16:9 card
shows the middle of a tall picture and nothing else of it, and three or four of
every ten cells in a folder of portraits are that crop. Those rows are packed at
their own proportions instead — variable widths and a height of its own per
line.

- **Which shape a listing gets is derived, not chosen.** `deriveListMeta` answers
  it from the rows that are loaded: `justifyThumbnails` is true when at least 90%
  of them are images with stored dimensions.
- **Video folders stay on equal cards.** A justified cell carries no meta row —
  unequal widths mean a caption never lines up into a column — and in a folder of
  videos the relative date is the one column still distinguishing anything.
- **Flexbox does the arithmetic; nothing measures.** `flex-grow: <ratio>` with
  `flex-basis: calc(<ratio> * var(--jg-row-h))` makes each line resolve to the
  container width wherever the line's grow factors sum to at least one. Where
  they do not — a line holding one cell whose ratio is under 1 — the cells stop
  short of the edge; the last line stops short by design.
- **The last line does not stretch**, because the absorber's grow factor
  *dominates*: `flex-grow: 9999`, three orders above the largest total a line can
  present, with height `0` so the row `gap` opens no empty line.
- **Row height: a line starts at 120px under 40rem, 200px at or above it**,
  switched with a container query on the grid's own width. These cells hold
  `<img>` and nothing else, so a containment context is safe here (see *Which
  mechanism depends on what is inside*).
- **`--jg-row-h` is the height a line is laid out *from*, not the height it ends
  at**: it is the basis every cell's width is measured against, so it decides how
  many cells a line holds. A line can also come out *shorter* than the basis,
  when a cell whose basis is wider than the whole line shrinks to fit it.
- **The cell is shaped by its ratio, not by the row.** `flex-grow` shares free
  space along the main axis only, so a cell with a pinned height would be at the
  wrong proportions by exactly the line's stretch factor and `object-fit: cover`
  would cut into the picture. The cell therefore has no height of its own:
  `aspect-ratio: var(--jg-ratio)` takes it from the width flex has resolved, and
  cells on one line share that factor, so they land on one height.
- **Ratio stops: 0.5× and 3×.** A 10:1 panorama would be wider than the row on
  its own; a 1:10 strip would be a hairline. Both are cropped by `object-fit:
  cover` instead. A row with no stored dimensions is drawn square.
- **No cell is laid out outside the stops.** Both paths that measure a picture —
  the file grid reading stored dimensions, the archive grid reading a decoded
  page's `naturalWidth` — clamp through `clampRatio`; the three constants that
  stand in for a picture are written inside the stops and asserted by a test.
- **The obvious repair, `flex-grow: max(1, var(--jg-ratio))`, is wrong.** It
  decouples the grow factor from the basis, and the whole of this section rests
  on the two being proportional: that is what makes every cell on a line share
  one stretch factor and therefore land on one height. With `max()` in there, a
  line mixing ratios above and below 1 draws its cells at different heights.
- **A line may reach `--jg-max-stretch` (2.5) times the height it started from
  and no further**, via `max-height: calc(var(--jg-row-h) *
  var(--jg-max-stretch))`. Line-breaking is greedy, so a line can hold one narrow
  cell whose width then becomes height. A cell that reaches the ceiling keeps its
  width and gives up its ratio, so the crop returns for exactly those lines.
- **Where the cell's ratio is the picture's, `object-fit: cover` crops back to it
  either way.** A thumbnail stored at the picture's own proportions is already
  the cell's shape; one still letterboxed onto a 320×180 frame has the bars cut
  off again, to within the pixel the pad rounds by. That is what lets the stored
  thumbnails be replaced a drive at a time rather than all at once.
- **Where it is not, a letterboxed thumbnail keeps some of its bars.** Which
  cells those are follows from `justifiedRatio`, not from a list kept here. A
  part-migrated drive is not broken, but it is not uniform; and a picture whose
  stored dimensions are missing stays that way, because the scan replaces a
  thumbnail only where it can predict the size and the prediction is made from
  those dimensions.
- **The filename is a hover/focus band, always visible under `pointer: coarse`.**
- **The cell is named by `aria-label` on the link**, so the accessible name is
  the same string in every branch; the band is deliberately not `aria-hidden`.
- **The 10% that are not photographs get `FileCard`'s answer** — a thumbnail, a
  text preview or a type icon, plus a duration badge for timed media — but not
  the hover video preview, because the grid host is a `container-type` context.
- **The archive listing uses these rows too, with the ratio measured from the
  picture rather than the database.** A zip carries no dimensions, so the browser
  is asked on `load`; until then the cell is drawn at 0.7, a scanned page's usual
  shape. A picture that fails to load goes back to square, because what is drawn
  then is a 32px icon. Folders, text and binaries are square throughout.
- **The archive cell's filename band is over the picture, not under it.** A
  caption in the flex column shortens the image area while the cell's width still
  comes from the picture's ratio, so `cover` crops the difference.
- **Cells carry `min-width: 0`.** A flex item's automatic minimum is its
  min-content width, and the archive puts a `truncate` filename in flow; one long
  name would otherwise become the cell's minimum and the row would stop
  justifying.

### A floor under the canvas viewer

The canvas viewer takes `min-height: max(320px, calc(var(--canvas-h) * 0.7))` —
**70% of the canvas**, not of the viewport. Without it, an archive of seven
entries draws a 200px band with the rest of the canvas empty under it. A floor,
not a ceiling: a long archive still grows past it.

- **`--canvas-h` is measured, not `70cqh`**, and the reason has nothing to do
  with heights. `container-type: size` implies `contain: layout`, which makes the
  element the containing block for every `position: fixed` descendant; the
  archive canvas holds two unportalled fixed elements, and under containment the
  page-turner's `inset-0` resolves to the canvas rather than the screen.
- The lesson generalises: **`container-type` is not only a question about media
  in the subtree.** Check for fixed descendants before establishing one.
- **Archives and PDFs only, and not on a phone.** Which viewers get a floor is a
  named list in `lib/fileDetailShell.ts` (`viewerTakesCanvasFloor`), not a mime
  prefix: a prefix asks "does this look like the family I meant", a list asks "is
  this one I have checked". Images are excluded because `FilePreview` already
  caps them at `70vh`; a phone is excluded because there the canvas *is* the
  screen and the player is `position: sticky`, so a floor would pin 70% of it for
  the whole scroll.

### Sticking below the header

`--app-header-h` is published by `Header` from its measured height (the PWA
safe-area inset changes it, so it is not a constant). Anything sticking under the
header positions itself with it rather than duplicating the header's shape.

The offset depends on the host: a pane that scrolls itself starts at its own top,
while under document scroll the sticky header would cover the element. Hosts
signal which they are; see `.media-detail-companion-inner` in `globals.css`.

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
