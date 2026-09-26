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

This document holds the design system: tokens, the rules for using them, and
the reasons behind those rules. It changes when a new kind of UI arrives or the
design is renewed. How a component implements a rule is the code's business and
is not written here.

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

Tokens are exposed as Tailwind utility classes via `@theme inline` (e.g.
`bg-accent`, `text-text-muted`).

`--danger-bg` and `--kbd-shadow` are used only by rules inside the stylesheet and
have no utility. Tailwind v4 emits nothing for an unknown utility, silently, so
for an error surface in markup use `bg-danger/15`.

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
| `--player-indicator` | `var(--accent)` | Player progress indicator (played range and knob) |
| `--player-indicator-track` | `rgba(112,112,112,0.85)` | Grey behind the indicator where no scrim carries it |
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
| `--player-indicator` | `#ffffff` | White rather than coral: the indicator is read against the picture |
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

There is no `[data-theme="system"]`. A stored `system` is resolved to `light` or
`dark` before first paint (§8); only those two are ever written.

### 2.2 Color Usage Rules

- **`--accent`**: primary CTAs and brand highlights only.
- **One accent *fill* per screen.** At rest, at most one control carries
  `bg-accent` (or `bg-accent-cta`) as a background. Which action gets it depends
  on what the screen is for — Add on a folder, Play on a collection; a screen
  with no such action spends none. Every other control is `secondary`, `ghost`,
  or bordered. Only fills count: `bg-accent/10` behind a hovered row, a hover
  state and a `border-accent` selected state do not.
- **`--sand`**: secondary button backgrounds, tags, mid-tone surfaces.
- **`--accent-teal`**: success / accepted state (e.g. a confirmed tag).
- **`--accent-amber`**: AI-generated / suggestion-pending state. Pair with a
  dashed border. Not a brand accent.
- **`--danger`**: errors, deletions, destructive actions. Not `--accent` red.
- **`--text-muted`**: keep contrast readable; do not reduce opacity beyond
  legibility.
- Never rely on colour alone to convey state — pair with an icon or text.
- **`<mark>`'s UA default is reset globally** so utilities apply to it; inside
  `.markdown-body`, `--highlight-bg` wins. The reset lives in `@layer base`: an
  unlayered rule beats every utility regardless of specificity.
- **A persistent highlight outside `.markdown-body` uses `bg-highlight-bg`.**

### 2.3 Wiki-link classes

Three classes for `[[X]]`-style wiki-links, each reusing an existing token.

| Class | Element | Color token | Usage |
|---|---|---|---|
| `wiki-link wiki-resolved` | `<a>` | `--accent` (canonical in-app prose link red) | Resolved to a single note. Hover `--accent-hover`. |
| `wiki-link wiki-unresolved` | `<span>` | `--text-muted` | Target not found. A dashed underline says "could become a link". |
| `wiki-link wiki-ambiguous` | `<span>` | `--accent-amber` | Matched more than one note; `title` carries the candidate count. |

Always pair the class with the marker icon or underline, so the state survives for
readers with colour-vision deficiencies.

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
- Out-of-scale buckets use `--text-muted`, not a 7th hue.
- Selection / focus / search-match highlight is `--accent`, independent of this
  scale.
- This scale is §9's sole sanctioned exception to "no additional brand colors".

### 2.5 Description timestamp links

Timestamps in a media description are inline buttons that seek the player. They
reuse §2.3's prose-link `--accent`.

| State | Color token | Usage |
|---|---|---|
| default | `--accent`, hover `--accent-hover` | A timestamp the player can seek to. |
| disabled | inherits the paragraph | No player to seek. |

- **Do not dim the disabled state.** A timestamp that will never do anything must
  read as the prose it sits in.
- The button carries no font utility, so it inherits the paragraph's size.

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
defaults.

### 3.2 Type Scale

| Role | Size | Weight | Line Height | Notes |
|---|---|---|---|---|
| Body | inherited (16px base) | 400 | 1.6 | Body default |
| H1 | `text-2xl` (24px) | 700 | 1.35 (`:lang(ja)`) | The page's subject. One per page — see §6 "Page Header" |
| H2 | `text-lg` (18px) | 700 | 1.40 (`:lang(ja)`) | A region within the page |
| H3 | `text-sm` (14px) | 600–700 | 1.45 (`:lang(ja)`) | A label inside a region |
| Caption / Label | 11–12px | 400–500 | — | Nav auxiliary labels |
| Section header | 11px | 600 | — | See §6 "Section Header Labels" |

This is the scale for **chrome** — headings that name regions of the interface.
Long-form prose has its own scale in §3.3, in `em`, which is why H3 here is smaller
than body text while `.markdown-body h3` is larger: one labels a box, the other is
a heading inside a text.

### 3.3 Long-form Prose (MarkdownPreview / "reading-A")

Applies wherever `.markdown-body` renders. Keep these values identical across
those surfaces.

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
  card radius — one "long-form content block" family).
- **The code viewer's line numbers are generated content**, never text. The
  block reserves a `--code-gutter` column in its left padding and each line's
  `::before` is pulled back into it by a negative margin of the same width, so
  a wrapped line continues under the code rather than under its own number.
  Text, not a number, is what a selection and a citation search may read out of
  that block; a number written as a text node would land in both.
- `blockquote`: `border-left: 3px solid var(--accent)`, `background:
  var(--bg-elevated)`, radius `0 12px 12px 0`.
- The first and last block drop their outer margins, so they never paint a gutter
  against their host.
- **Consecutive images form a row**: images with no blank line between them sit in
  one wrapping row at a fixed height (200px desktop, 120px on mobile). A single
  image keeps the plain `img` rule.

### 3.4 Reading Measure

Long-form prose on a reading surface is capped at **860px**. Embedded prose drops
the cap and takes its parent's width. Do not hard-code a max-width at a call site.

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

- `uppercase tracking-wider` on hardcoded English-only labels.
- `break-anywhere` on machine-like strings.

### 3.6 List row measure

A listing row's **contents** are capped at `60rem` (960px), `max-w-list-row`.

- **The cap is on the contents, not on the row.** The hover band and click target
  still span the listing.
- **Why**: on a wide screen the title and the right-pinned size and date sit far
  enough apart that the eye has to travel to pair them.
- It is not §3.4's reading measure and not §8.5's thresholds; each answers a
  different question. Do not merge them.

### 3.7 Fitted page measure

A page image fitted to width or to page is capped at **900px** before the reader's
own zoom. The cap decides where fitting stops, not how large a page the reader may
ask for. It does not apply to actual size, whose whole promise is the page's real
size.

### 3.8 Page column measure

A page's header and content share one column, capped at one of four widths:

| Token | Cap | For |
|---|---|---|
| `full` | none | grids and listings that use the whole pane |
| `max-w-wide` | `72rem` | card rails and browsers that stop reading well wider |
| `max-w-list-row` | `60rem` | a column of list rows (§3.6) |
| `max-w-reading` | `48rem` | prose and a conversation |

- **Header and content take the same cap.** A header wider than its content puts
  the title away from what it names.

---

## 4. Depth & Elevation

| Level | Treatment | Usage |
|---|---|---|
| 0 (Flat) | No shadow | Buttons, inline chrome, dense list rows |
| 1 (Card resting) | `shadow-card` token only | Media cards, mini-player, mid-page floating affordances |
| 2 (Elevated surface) | `bg-bg-elevated` surface shift | Toolbars, sub-panels, banners |
| 3 (Overlay) | `shadow-lg` + `bg-bg-card` | Modals, dropdowns, context menus, command bars |

Depth comes first from surface colour and border-radius. Shadow is allowed only
as a **single resting elevation** on media-bearing cards (Level 1) and as a
**minimal overlay shadow** on dialogs and dropdowns (Level 3).

**Forbidden:**

- **Hover-shadow expansion** — hover changes the surface colour, never the
  shadow.
- **Decorative large-offset shadows** — `shadow-2xl`, custom
  `shadow-[0_8px_40px_*]`, or any shadow with blur ≥ 24px / opacity ≥ 0.2.
- **Stacked shadow + ring** to fake depth.
- **Shadows on flat-surface components** — sidebars, properties panels, markdown
  blocks, inline chips and ghost buttons stay Level 0.

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

**Exception — mobile media frames**: the primary playback frame renders
edge-to-edge with **0px radius on mobile** (`<md`) to maximize the viewable frame;
desktop keeps `rounded-xl`. Not thumbnails or cards listing media.

---

## 6. Component Styling

### Buttons

| Variant | Background | Text | Hover | Radius |
|---|---|---|---|---|
| Primary (CTA) | `bg-accent` | `text-white` | `bg-accent-hover` | `rounded-2xl` |
| Secondary (Sand) | `bg-sand` | `text-text-primary` | `bg-sand-hover` | `rounded-2xl` |
| Danger | transparent | `text-danger` | `bg-danger/10` | `rounded-2xl` |
| Ghost | transparent | inherited | — | `rounded-2xl` |
| Circle Action | `bg-warm-light` | inherited | — | `rounded-full` |
| **Disabled (every variant)** | `bg-sand` | `text-warm-silver` | `cursor-not-allowed` | — |

- Padding is at least `px-4 py-2` — Japanese labels need the room.
- **The default variant is secondary**, so leaving it unspecified never spends the
  screen's one accent fill (§2.2).
- **A disabled button drops its enabled background rather than fading it.** A
  disabled control still wearing `bg-accent` reads as the page's call to action.
  Do not use `disabled:opacity-*`: transparency dims a control without changing
  what it says, and the contrast loss lands on the label.
- **Hover never repaints a disabled button.**
- **A labelled button is sized by padding, never by a fixed height**, so a wrapping
  Japanese label grows it instead of being clipped. An icon-only button is a fixed
  32px square and must carry an entity-specific accessible name ("Delete Q1
  notes", not "Delete").
- **Every button reaches a 44px touch target on a coarse pointer** (§Row Actions).
  On a fine pointer each keeps its own size.
- **A destination is a link; only an action is a button.** A link may wear the
  button look.

### Page Header

One header for every screen with a subject, in up to three rows:

| Row | Holds |
|---|---|
| Trail | a small navigation control at the leading edge, and the breadcrumb |
| Subject | icon, title (`<h1>` at the §3.2 size), scope line, actions |
| Tabs | the screen's tabs, if any |

- **The subject is named once**: by the breadcrumb's last segment or by a title,
  never both.
- **The scope line** (counts, duration, state, drive name) sits under the title;
  with no title it joins the trail.
- The leading control stays in the same place across the screen's modes.
- **The title does not move between screens a sidebar row opens.** The same space
  sits above every header, and such a screen's top level has no trail.
- **Controls that change the layout belong to the app toolbar, not the page
  header.** The tree toggle sits beside the menu button, the same size at the same
  height, so it stays put whichever page or file is open.
- **The header is as wide as the content under it** (§3.8), and starts at the
  content's left edge.
- **The icon and title are the sidebar row's.** The icon sits in a tile beside the
  title and the scope line.
- **The scope line is the drive and the screen's count.** An unknown count shows
  the drive alone, never `0`.
- **The primary action ends the subject row.**

### Tabs

**Underline tabs, and only underline tabs.** Selected `border-accent font-semibold
text-text-primary`; unselected `border-transparent text-text-muted`. Both carry
`border-b-2`, so selection moves nothing.

- **A row that navigates is not a tablist.** Links get `aria-current="page"`; a
  tablist gets `aria-selected`. Never both.
- Tabs reach the 44px floor on a coarse pointer.

### Selected-state controls (segmented toggles, tabs)

A control that says **which of N equal options you are in** marks the selected one
with a **border in the accent colour**, never a fill.

- A fill would spend §2.2's one accent on a state indicator.
- **No surface token can carry this selection**: `--bg-card` and `--bg-primary`
  are both white in the light theme. The accent border clears WCAG 1.4.11's 3 : 1.
- **Unselected controls carry `border-transparent`**, so nothing shifts on
  selection.
- **On a crowded bar, prefer a labelled menu** (`View: List view`). A border says
  which option is on but not what the options are.

### Cards

- Radius `rounded-xl` (12px); background `bg-bg-card`.
- `shadow-card` resting only on media-bearing cards; dense list rows and inline
  cards stay flat.
- Hover changes the surface colour only. **Never expand or darken the shadow on
  hover, and never use `scale()`.**
- **A card's name clamps to two lines where it clamps at all.** A one-line
  `truncate` is also fine; a third number is not.
- **A text file's stand-in thumbnail** — its title over a shrunken cast of the
  body — is sized by the media box, not by the name rule.
- `line-clamp-*` needs `display: -webkit-box`; any other `display` utility on the
  same element silently cancels the clamp.

### The first fact under a file's name

What a card, a list row and the file page say first about a file is one rule,
asked of the file's kind: *what has this surface not already said that would tell
this file from the one beside it?*

| Kind | First metadatum |
|---|---|
| video, audio | none |
| image | its dimensions, `1920 × 1080` |
| everything else | its size |

- **Every surface that draws a file's name with a fact under it follows this
  table**, including viewers.
- **The size is not a neutral default.** For a reference to external media it is
  the reference's size, not the media's — false, not just redundant.
- **The length goes where the surface has room for it**: on a thumbnail badge or a
  transport bar if it has one, otherwise at the head of the metadata line.
- **One answer per kind.** An image with unknown dimensions does not fall back to
  its size.
- **Nothing known, nothing drawn** — no empty line.
- It covers facts about one file, not quantities such as disk usage or a
  duplicate group's wasted bytes.

### Inputs

- Radius `rounded-2xl`; border `border border-bg-border` or
  `border border-warm-silver/40`; focus ring `var(--focus-ring)`.
- Line-height comes from the `:lang(ja)` rules (1.5).

### Modals / Dialogs

- Radius `rounded-2xl`, background `bg-bg-card`.
- Button order: Cancel (`bg-sand`) then Confirm (`bg-accent`).

### Header

- Height `h-14` (56px), `sticky top-0 z-20`.
- No menu button of its own; see §Sidebar.

### Sidebar

- Background `bg-bg-sidebar`; active row `bg-bg-elevated rounded-2xl font-medium`;
  `fixed`, full height, `w-60`.
- Composition, top to bottom: **the row the menu and tree buttons sit on →
  current drive → views → addons → reorderable sections → Lock.** No logo: that
  row belongs to the two buttons, which stay put whether the sidebar is open,
  over the page or beside it. The current drive is one row that opens the
  others, so the sidebar reads as a place before a menu. Views carry no heading;
  the user-ordered sections keep theirs.
- **Two modes.** Inline on wide screens (≥ 1200px), pushing the layout, with the
  open/closed choice remembered. Overlay below that, and on the file detail page
  at any width, with
  a dimmed backdrop, closing on backdrop click and Escape, not remembered.
  Leaving overlay mode restores the remembered choice.
- A navigation click keeps an inline sidebar open and closes an overlay one.
- The menu button sits outside the sidebar and is visible in every state.
- **"Is it open", "is it lending its place to the folder tree" and "is the drive
  list unfolded" are separate questions.** Collapsing any two makes one answer
  unreachable; in particular, the folder tree borrowing the space must not
  overwrite the remembered open state.
- Thresholds are per question: the folder tree uses `md` (768px), the sidebar
  1200px.

### Inspector tab strip

The tabs under the inspector's fixed header. What it contains is decided by the
file, not the layout.

- **One tab is no strip.**
- **A tab with nothing to show is not a tab**, and it appears the moment it has
  something. An addon tab that says nothing is assumed available.
- Composition: core tabs before addon tabs.
- Button `px-3 py-2 text-xs font-medium`, `border-b-2` as the selected indicator.
- **One tab stop for the strip**; `←` / `→` move within it.
- **Scrolls, never wraps.**
- **Every panel stays mounted; only the selected one is shown**, so a tab keeps
  its data and scroll position.
- Touch floor per §Row Actions.

### Context Menus / Dropdowns

Radius `rounded-2xl`; danger item `text-danger hover:bg-accent/10`.

- **An anchored popup chooses its direction from the room it actually has**, on
  both axes: below and to one side by default, flipping only when the other side
  is better. The room is what is both unclipped and on screen — an on-screen
  keyboard counts. Not a breakpoint.
- **Everything anchored to the same control uses the same direction**, including
  an error message shown after the menu closes.
- **Below `sm`, a toolbar menu is a bottom sheet**, and a sheet does not flip.
- **A popup is dismissed by a press outside it, and the click that press produces
  is swallowed**, so dismissing a menu never also activates what is underneath.
  The same holds for the press that opened a popup (a long press).
- **The dim behind a popup is appearance only.** It never decides dismissal.
- A modal dialog is a different pattern and keeps its own backdrop.
- **Inside the mobile Bottom Sheet, a popup is anchored, never `fixed`.** The
  sheet is transformed, so `fixed` there resolves against the sheet, not the
  screen.
- Exception: an inline rename commits on an outside press and lets the click
  through, so clicking another row both commits and selects.

### Layering

Stacking is tiered. Pick the tier by what the element *is*, not by one number
higher than whatever it currently sits under.

| Tier | `z` | What belongs here |
|---|---|---|
| In-flow chrome | `z-10` – `z-30` | Sticky bars, the header (`z-20`), an inspector covering the canvas (`z-20`), the raised mobile Bottom Sheet (`z-[25]`), anchored popovers, the sidebar backdrop (`z-30`) |
| Floating surfaces | `z-40` | Overlay sidebar, mini-player, upload progress, bottom-anchored mobile menus, the Bottom Sheet's resting strip |
| Modal dialogs | `z-50` | Confirm / Rename / Move and anything that interrupts to ask, including addon dialogs |
| Immersive viewers | `z-[60]` | Full-screen image gallery and archive viewer, which replace the page; a phone player's frame pinned to fill the screen |
| Always on top | `z-[100]` | Shortcut cheat sheet, quick note, file save, toasts |

- **Within a tier, do not build behaviour on the number.** Document order and
  stacking contexts decide ties; nothing that must be *correct* may depend on
  who is on top.
- **A panel that has run out of room is still in-flow chrome.**
- **An immersive viewer takes the page out of reach, not just out of sight**: the
  rest of the page is `inert` and body scroll is locked until it closes.
- **The raised Bottom Sheet sits between the page's chrome and the sidebar's
  backdrop.** It is not modal, so the overlay sidebar can be opened over it.

**The Bottom Sheet rests; it does not close.** Three states:

| State | What is on screen |
|---|---|
| peek | The file's name, like, favourite and `⋮`, above the home indicator |
| half | The top of the inspector. On a page with a player, the sheet's top edge meets the player's bottom edge, so the video stays whole; elsewhere a fixed fraction of the window |
| full | Most of the inspector column, with room to read a tab |

- **`half` is where the player ends, derived rather than offset**, and only while
  that gives more room than the fixed fraction. `full` never depends on the
  player.
- **Two gestures, each moving one thing.** The handle moves the sheet between
  states; a pull on the content can only collapse it to `peek`. A pull that
  starts inside the scrolled content belongs to the scroller, and reaches the
  sheet only if the finger keeps pushing after the content is back at its top —
  so a fling that coasts to the top never drags the sheet.
- **Not modal at `half` and `full`.** No backdrop, nothing made inert and no
  focus trap: the page scrolls and the player can be paused while the sheet is
  up, and a press outside the sheet does not move it.
- **A dismiss gesture** — Escape, swipe down — collapses to `peek`.
- **Addon buttons are not on the resting strip.** They are in the raised sheet's
  own row, with the labels, trust and Cast.
- **A dialog opened from inside the sheet portals to the page**, never into the
  sheet: the sheet is transformed, so a `fixed` box inside it lands below the
  screen.
- **At rest the drawer is not mounted.** An open drawer is a dialog layer that
  takes every Escape on the page and lifts itself over the keyboard for any
  focused field.
- **On a phone the sheet is one scroller.** The inspector's header scrolls away
  with the content; only the tab strip sticks.
- **The player is never moved into or re-parented by the sheet**; re-parenting
  restarts playback. At `full` it stays behind the sheet.
- **Nothing goes inside the player's box but the player and the controls that act
  on it**, and nothing wraps it: the sheet protects and the phone pins everything
  in that box.
- **The resting strip owns the bottom edge of a file page, home indicator
  included.** Anything anchoring to the bottom goes above it.
- **A toolbar menu's bottom sheet is lifted by `--resting-strip`**, which the
  strip publishes while it is shown. A menu whose trigger is inside the player
  box — a sticky stacking context on a phone — also passes `portalOnPhone`, or
  its sheet ranks under the strip and under a raised inspector sheet. It is
  opt-in because a portalled panel leaves its container, and container-query
  classes on its rows stop applying.

### Over-video chrome (player controls, mini-player buttons, full-screen viewers)

Chrome **on top of a video frame** deliberately ignores the theme tokens: its
backdrop is the picture, near-black in practice, so theme surfaces would draw pale
controls on a black frame in light mode. The seek indicator below is the one
exception. Full-screen image and archive viewers follow the same rules.

- Foreground `text-white`; secondary `text-white/70`; dividers and inert marks
  `text-white/50`.
- Buttons transparent at rest, `hover:bg-white/15`; standalone circular buttons
  `bg-black/70 hover:bg-black/90`.
- Sizes `h-11 w-11` (44px) in a control bar; a standalone transport button on
  touch steps up to 64px with a **lighter** disc (`bg-black/50 hover:bg-black/70`),
  because an opacity that reads as a backing at 32px reads as a blob at 64px.
- Control-bar backdrop `bg-gradient-to-t from-black/80 via-black/50
  to-transparent` — legibility, not decoration, and not subject to §4.
- **Over an embedded player** the scrim is stronger (`from-black/95 to-black/60`
  with a slight blur, masked so it has no seam), because the embed draws its own
  chrome in the same strip. Use the plain scrim while the embed owns the frame
  (ad, end screen).
- Track fills `bg-white/25` empty and `bg-white/40` buffered; the volume
  slider's played range is `bg-accent`.
- **The seek indicator follows the theme**: `--player-indicator` — coral in
  light, white in dark — fills the played range and the knob alike, in the
  control bar and in the hairline that stays behind once the bar fades. Dark
  mode takes white because the mark reads against the picture, not against a
  surface. The hairline has no scrim under it, so its empty track is
  `--player-indicator-track` rather than `bg-white/25`.
- **The bar sits as low as the knob allows** in the touch and compact layouts:
  the knob is taller than the track and centred on it, so the track stops 8px
  short of the frame's bottom edge and the knob clears it by 4px. Only the
  hairline is on the edge itself. The pointer layout centres the bar in its own
  row above the buttons instead.
- **Full screen on a phone leaves nothing behind**: there the frame is the whole
  screen, so a line across it reads as a mark on the picture rather than as
  chrome, and the touch layout drops the hairline. In the page it keeps it.
- Focus rings still use `ring-focus-ring`; radius follows §5.
- **Transient gesture feedback**: a half-disc `bg-white/15`, icon plus label,
  fading, `aria-hidden` — the same operation must also be a real button or
  shortcut.
- **Transient state pills**: `bg-black/70 rounded-2xl`, top centre.
- **Player settings are one panel** (`bg-black/85`) inside the frame: a bottom
  sheet on touch, a `w-64 rounded-2xl` popover on mouse. No bare native controls
  in the bar.
- **Chrome withdraws after 2 seconds idle** and returns on pointer movement, a
  key, or focus — not on a press, which would cancel the centre tap that toggles
  it. Withdrawn chrome is `inert`, not just transparent.
- **A panel open over the frame holds the chrome open** and owns Escape.

Everything **outside** the frame uses the themed tokens.

### Tables ("quiet editorial" style)

Default for reading surfaces: **dividers and font-weight alone carry structure** —
no fills, no zebra, no cell grid.

- `border-collapse: separate; border-spacing: 0`.
- `th`, `td`: `border-bottom: 1px solid var(--bg-border)`, padding
  `0.6em 0.85em`, `text-align: left`, `vertical-align: top`.
- `thead th`: **no background fill** — the rule plus `font-weight: 650` carries
  the header role.
- **Exception**: vertical-header tables (`tbody th`) may keep a subtle fill on the
  header column.
- Mobile: `font-size: 0.93em`. Do not reflow — horizontal scroll is preferred to
  structure loss.

### A control table: say each explanation once, and keep the headings

A settings table repeats harder than a listing: each row multiplies everything
written in it.

- **A sentence that does not change from row to row goes once, below the table.**
  The row keeps its control and its name. A warning shown only for some rows is
  still the same words on each; show it once when any row is in that state.
- **Explain only controls that are on screen.**
- **Column headings stick inside a bounded scroller** (capped at `70vh`), `sticky`
  on the `th`, with their own background. A sticky head in an unbounded scroller
  sticks to nothing. On a short screen the cap means a nested scroller; the
  headings are worth it.

### Search result timestamp pills

- **`text-text-muted`** with `hover:bg-accent/10` — not `text-accent`: in a result
  row the timestamp is third-rank information under an unaccented title.
- At most three per hit, one per second, with a quiet `+N` for the rest.
- **A match in a book is a section pill** in the same style, labelled with the
  chapter title and never with a page. The title is truncated at `max-w-[12rem]`,
  the cap a tag chip stops at, with the full title in `title=`; a section with no
  title shows its number.

### Match badges and their legend

- **One definition of the badges** feeds every surface that draws them and the
  legend, so the legend can neither describe a missing badge nor omit one.
- **The explanation is not on the badge** — no `title`, which doubles the spoken
  name and never shows on touch.
- **The legend is asked for, never volunteered**: a footer entry in the search
  popup. It replaces the list rather than opening a second modal, and Escape
  closes the legend alone.

### Search Snippet (MatchOverlay excerpt row)

The one-line excerpt showing *where* a hit matched. It deliberately does **not**
reuse §3.3's `blockquote` — a fill reads as a nested card and merges with the
row's hover state.

- Marker `border-l-2 border-bg-border pl-2` — a rule, never a fill.
- Text `text-[11px] leading-relaxed text-text-muted`, `line-clamp-2`.
- **One snippet per hit.**
- Row actions follow §Row Actions, and revealing them never reflows the excerpt.

### Row Actions

A control repeated on every row — a capture button on a snippet, a `⋮` on a list
row.

- **Trailing edge of the row**, in flow, sized so revealing it reflows nothing.
- **Hidden by default, revealed by the row** on hover or focus within the row, so
  focusing the row's primary control reveals the secondary one.
- **`opacity-0`, never `hidden` / `invisible`**, which would take it out of the
  tab order.
- **Always visible on a coarse pointer**, which has no hover.
- **The row's identity is in the accessible name.** Do not repeat it in `title`.
- **Touch targets: 44px on a coarse pointer, 32px on a fine one.** 32px clears the
  24px minimum for repeated controls; 44px everywhere costs height long
  transcripts cannot spare.
- **Every control in the row reaches the floor**, or the finger still lands on the
  small one.
- **Several controls together are one group.** On a coarse pointer they sit with
  no gap, because each 44px target already carries its own space; the row's gap
  and trailing padding are not added again. On a fine pointer the normal gap and
  padding return.
- **Down a column, grow the hit area, not the icon**: the 44px row pitch keeps
  neighbouring hit areas from overlapping. **Along a row, grow the boxes**, since
  overhanging hit areas side by side overlap.

### Section Header Labels (i18n)

The label above a group of rows — an admin section, a sidebar section.

- `font-semibold text-text-muted`.
- No `tracking-wider` — these render Japanese (§3.5).
- No `uppercase` — it does nothing to Japanese, so in a mixed column it becomes one
  more way the headings differ.

| Surface | Size |
|---|---|
| Admin / setup sections | `text-sm` |
| Sidebar sections | `text-[11px]` |

The sidebar's heading is smaller than its `text-sm` rows so the two read as two
levels.

This governs headings. A field label in §Properties Panel and a machine string on a
row are not headings and may keep `uppercase`.

### Properties Panel (Obsidian-style frontmatter display)

A note's frontmatter, above the rendered body, as a label-value table.

- **Container** `rounded-xl overflow-hidden border border-bg-border
  bg-bg-elevated` — the same as a code block, its sibling in §3.3's content-block
  family.
- **No row dividers**: `py-2.5` padding alone separates rows.
- **Row**: a label column (`text-xs uppercase tracking-wide text-text-muted`) and a
  value column (`text-sm text-text-primary break-anywhere`), `gap-x-4 px-4`.
- **Empty frontmatter renders nothing.** Known keys get typed renderers; unknown
  keys are plain text.
- **Truncate values, never the Panel.**
- **Origin badge** `rounded-full`: web clip `--accent`, generated summary
  `--accent-teal`, manual the muted elevated fill.
- **Internal radius**: Panel `rounded-xl`, inner chips and cards `rounded-lg`, tag
  and origin chips `rounded-full`.
- **Hover** uses warm neutrals (`hover:border-warm-silver/60`), never
  `hover:border-accent`.

### Editable Tag Chips (EditableTagChips)

The tag row in edit mode.

- **Chip** `rounded-full bg-accent-teal/15 text-accent-teal px-2 py-0.5 text-xs` —
  identical to the read-only pill, so switching modes shifts nothing.
- **Remove**: a trailing small `×` in a round button, `hover:bg-bg-elevated`. No
  danger hover; removal is undone by re-adding.
- **"Add tag"** is a muted chip, told apart by the absence of the teal fill.
- **Input** `rounded-full bg-bg-card px-2 py-0.5 text-xs`, `focus:ring-2
  focus:ring-accent`, in the same row.
- **Suggestions**: a small popover under the input, current drive only, at most 5
  rows. The highlighted suggestion is `bg-accent text-white` — it follows a
  specific user action, so it counts as a CTA under §2.2.
- **Keyboard**: Enter commits, arrows navigate, Backspace on an empty input drops
  the last chip, Escape cancels.
- **Validation error** `mt-1 text-xs text-danger`, only once triggered.
- **Saving is silent.** No saving/saved state in the chip row; only failures are
  shown.

---

## 7. Animation

| Utility | Motion | Used on |
|---|---|---|
| `animate-fade-in` | 200ms fade | General element appearance |
| `animate-fade-in-scale` | 200ms fade + scale 0.95→1 | Modals, dialogs |
| `animate-slide-up` | 250ms slide (center-anchored) | Toasts |
| `animate-slide-up-bar` | 300ms cubic-bezier slide | Selection bar |
| `animate-pop` | 250ms scale 1→1.25→1 | Heart / favorite icons |

A box returning to where it belongs — a released pull on the Bottom Sheet, a
listing cell moving — travels over **200ms `ease-out`**.

All animation is disabled under `prefers-reduced-motion: reduce`, including
transitions set from JavaScript.

### A change to a list's contents is carried, not cut to

When the set of cells in a listing changes, cells that were already there travel
from their old position rather than jumping.

- **A cell with nowhere to come from fades in.** A change where no cell survives
  is a different listing and is not animated.
- **A listing whose own width changed snaps.** Following a resize frame by frame
  reads as weight.
- **Reduced motion moves nothing at all.**

---

## 8. Display preferences applied before first paint

The theme and the media layout preference are applied to `<html>` before the
first paint, so neither flashes the other value for a frame, and both are then
acted on in CSS.

- **Theme**: `light` and `dark` apply their own rules; `system`, or nothing
  stored, follows `prefers-color-scheme`.
- **Media layout**: see §8.5.
- A browser that blocks site data still gets the system theme and the default
  layout.

---

## 8.5 Layout

### File detail: one shell, two canvases

Every kind of file gets the same page row, the same inspector header and the same
Info tab. Only the canvas differs, and there are two:

| Canvas | Kinds | What is in it |
|---|---|---|
| **Document** | a Markdown note, and HTML shown the same way | the editor, with the note's own controls in the page row |
| **Viewer** | **everything else** | the viewer, and what belongs to that viewer alone — a media file's description, its long summary, and the transcript when placed below the player |

- **The viewer has the column to itself**, rather than getting whatever height
  metadata leaves over.
- **"Everything else" is the rule, not a list.** A kind nobody has looked at yet
  still gets the shell.
- **A kind with no viewer is not an exception**: the canvas shows "cannot be
  shown" with a download, and the inspector is still worth having.

### Inspector column (document layout)

| Token | Value | Meaning |
|---|---|---|
| inspector width | `24rem` (384px) | Fixed. Where the row cannot hold it beside the canvas it covers the canvas at the same width rather than narrowing — at 320px Japanese wraps at 12–14 characters a line. |
| canvas padding | `2rem` (32px) | Around the canvas contents; part of the sum below because the player is inside it. |
| beside threshold | player minimum + canvas padding + inspector width | Measured on the row that holds both — never on the canvas, whose width is what is being decided. |

The companion rail below has the same width for the same reason, not by sharing a
value; a change to one is not a change to the other.

### The Related tab

A core inspector tab after Info and the other core tabs, before addon tabs. It is
listed when the file has a relation or when any addon publishes to
`file-relations`; the Info tab draws no relations.

- **Sections, in order, each omitted when empty**: links from this file
  (`origin = markdown`, outgoing), links to this file (`origin = markdown`,
  incoming), related files (every other relation, either direction), then the
  `file-relations` slot. A counterpart appears once per section.
- Section label `text-xs font-medium text-text-muted`, the count beside it at
  `font-normal`; no card and no glyph. Addon entries in the slot use the same
  weight: the members may live in different repositories, and these weights are
  the contract.
- Row: `rounded-xl px-2.5 py-2`, hover `bg-bg-elevated`, opening the counterpart's
  canonical file URL. Title `text-sm`, two lines at most; folder under it
  `text-xs text-text-muted`, or the drive root label.
- Leading mark: a 16px file-type icon, or for video, audio and images with a
  thumbnail a `56×32` thumbnail (`rounded-lg`, `object-cover`) carrying the
  duration when the file has one.
- A missing counterpart stays in the list at `opacity-60` with the "missing" label.
- **The rows take a second column at `45rem` of the list's own width**, never the
  window's: the same list appears in the narrow rail and in the collection stack.
  `45rem` is where each of two columns is at least as wide as the rail's single
  column.
- On the collection route, which has no inspector, the same sections sit under one
  `Related` heading.

### Companion region (media file detail)

Chapters and the transcript. It belongs to a **player** — a PDF has a viewer but no
playback clock, so it has no companion region.

| Surface | "Beside" means | "Below" means |
|---|---|---|
| File page | a tab in the inspector | a bounded box in the canvas, under the description |
| Collection playback | a second column beside the player | the same box, under the player |

**The companion is moved, never duplicated**: it holds a fetch, a playback clock
and a scroll position.

| Token | Value | Meaning |
|---|---|---|
| rail width | `24rem` (384px) | Fixed. 320px wrapped Japanese at 12–14 characters a line. |
| box height | `60%` of the scroll container | The bounded box below the player. |
| below: index column | `12.5rem`–`22rem` | The chapter list beside the transcript; wider than about 350px, timestamps compete with what they index. |
| below: body column | `68ch` | The reading measure, as both base and cap. |
| player minimum | `34.5rem` (552px) | Narrower and a 16:9 video stops being watchable. |
| gap | `1.5rem` (24px) | The standard section gap. |
| switch threshold | rail width + player minimum + gap | A sum, not a feel. |

**Four questions, four thresholds. Do not merge them.**

| Question | Measured against |
|---|---|
| Can a rail sit beside the player? | The host's own width |
| Can the inspector sit beside the canvas, or must it cover it? | The width of the row holding both |
| Does the inspector *start* open? | The viewport (1120px). A default only; the reader's choice outranks it |
| Is the inspector a pane or a Bottom Sheet? | The viewport (768px) |

Placement is a fact about the space, so it is measured on the container; whether
to start open is a default, so it may use the viewport. Keying placement to the
viewport puts a tiny video on screen inside the two-pane layout, where a sidebar
and a folder tree have already taken space the viewport does not know about.

- **The host holds the height.** An occupant cannot tell which form it is in and
  must never bound itself.
- **Lead and fill, not equal shares**: a short index sizes to its content under a
  cap, and the long body takes the rest. The index does not shrink.

### Measure against the container, not the viewport

Any layout that can appear both full-width and inside a pane switches on the width
**it actually has**, never on a viewport breakpoint. A breakpoint fires on the
window and splits a pane at widths where two columns do not fit.

- **No media in the subtree** → a container query.
- **Media reachable in the subtree** (video, audio, cross-origin iframe, including
  a hover preview) → measure the width in script and publish an attribute for CSS.
  On iOS Safari a containment context around media renders it rotated and
  spinning.
- **A containment context also captures `position: fixed` descendants.** Check for
  both before establishing one.
- Keep thresholds in `rem`, so scaled text still gets the layout the numbers were
  chosen for.
- **Put the container where its width is the laid-out element's width**, not on a
  section whose padding changes with context.

**Card grids.** Equal cards measure their own width.

**Card minimum width: `16rem`. Minimum column count: 2.** A single column on a
phone shows less per screen than the list view. **Column gap: `gap-3`**,
everywhere, so a folder row and the file grid beneath it line up. Do not write a
breakpoint column count or `repeat(auto-fill, …)` into a card grid.

### Justified thumbnail rows

A folder that is almost all photographs is packed at the pictures' own
proportions instead of equal 16:9 cards, which would show only the middle of every
portrait.

- **The shape is derived, not chosen**: justified when at least 90% of the loaded
  rows are images with known dimensions.
- **Video folders stay on cards**, whose date line is what still tells videos
  apart.
- **Row height: 120px under `40rem` of grid width, 200px at or above.** A line may
  stretch up to 2.5× that and no further.
- **The last line does not stretch.**
- **Aspect ratios are clamped to 0.5×–3×**; beyond that the picture is cropped.
  Unknown dimensions are drawn square.
- **The filename is a band over the picture** on hover or focus, always visible on
  a coarse pointer. The cell's accessible name is the filename in every state.
- **Non-photographs in such a folder** get the card's thumbnail, text preview or
  type icon, plus a duration badge.
- **Archive listings use these rows too**, with each picture's ratio read once it
  loads.

### A floor under the canvas viewer

Archive and PDF viewers are at least **70% of the canvas height** (never less than
320px), so a short archive does not draw a thin band over an empty canvas. A
floor, not a ceiling. Not on a phone, where the canvas is the screen.

### Sticking below the header

The header's height is published as `--app-header-h` because it varies (safe-area
inset). Anything sticking under the header uses it rather than a copy of the
number. A pane that scrolls itself sticks to its own top instead.

---

## 9. Do's and Don'ts

### Do
- Use warm neutrals (`--sand`, `--warm-light`, `--warm-silver`) — olive/sand tone is the identity
- Reserve `--accent` for CTAs and brand highlights only, one fill per screen
- Use `rounded-2xl` (16px) for buttons and inputs, `rounded-xl` (12px) for cards
- Separate line-height rules for headings, body, and forms (jp-ui-contracts)
- Avoid `tracking-wider` on any element that may render Japanese text
- Use the `break-anywhere` utility for long words and URLs — not `break-all`
- Use plum black (`#211922` / `#f5e6e8`) for primary text
- Apply 12px radius uniformly to long-form content blocks (`blockquote`, `pre`, `img`, fenced code)
- Let tables carry structure via `border-bottom` + `font-weight` only — no zebra, no fills
- Measure layout against the container a component actually has

### Don't
- Do not apply `word-break: break-all` globally to body text or UI labels
- Do not use `scale()` hover or active on cards / buttons — preserve the static weight
- Do not introduce additional brand colors — coral red + warm neutrals is the complete palette (the `--graph-cat-*` chart-only scale in §2.4 is the sole sanctioned exception, and only on chart surfaces)
- Do not grow / darken `box-shadow` on hover. Resting `shadow-card` stays constant; hover changes surface color only
- Do not handroll arbitrary `shadow-[0_*]` values, or stack `shadow-2xl` with `ring-*` — use the `shadow-card` (Level 1) or `shadow-lg` (Level 3) tokens. The one exception is not depth: a zero-blur shadow in the ground's own colour that extends a sticky strip's background a pixel upward (the inspector tab strip), because some engines round a stuck strip down and show a row of the content beneath
- Do not use border-radius below 12px on outer surfaces
- Do not use cool grays — always warm/olive-toned
- Do not use pure black in dark mode — use warm plum dark (`#1a0e10`)
- Do not re-introduce the UA default yellow on `<mark>`
- Do not add zebra stripes or cell grid borders to reading-surface tables
- Do not hard-code `max-width` on prose callers — the reading measure lives in one place
- Do not fade a disabled button with opacity
