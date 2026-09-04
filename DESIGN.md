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
| H1 | — | 700 | 1.35 (`:lang(ja)`) | — |
| H2 | — | 700 | 1.40 (`:lang(ja)`) | — |
| H3 | — | 600–700 | 1.45 (`:lang(ja)`) | — |
| Caption / Label | 11–12px | 400–500 | — | Nav auxiliary labels |
| Section header | 11px | 600 | — | UPPERCASE, English-only hardcoded labels |

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
> way this rule forbids. They are converted with the shared `Button` component
> (UI redesign Phase 3) rather than one at a time, because a converted button
> beside an unconverted sibling — both disabled by the same click — shows two
> different disabled states in one row, which reads worse than either alone.

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
  the list is shown open, because there is no "here" to fold into. The views carry no heading — a
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
- **An addon tab is not content-gated yet**, because core cannot ask
  "will you render anything for this file" without naming the addon.
  Today an addon's tab appears whenever that addon claims the slot on
  this drive, so a video that has never been transcribed still grows an
  empty Transcript tab. The generic fix is a per-file availability
  signal from the entry — the shape `ChaptersPanel.onResolved` already
  uses for core's own occupant — and it is owed.
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
| In-flow chrome | `z-10` – `z-30` | Sticky bars, the header (`z-20`), popovers anchored to a control, the sidebar backdrop (`z-30`) |
| Floating surfaces | `z-40` | Sidebar in overlay mode, mini-player, upload progress, bottom-anchored mobile menus |
| Inspector sheet | `z-[45]` / `z-[46]` | The mobile Bottom Sheet — above every floating surface, below every dialog |
| Modal dialogs | `z-50` | Confirm / Rename / Move and anything else that interrupts to ask a question, including addon dialogs |
| Immersive viewers | `z-[60]` | Full-screen image gallery and archive viewer, which replace the page rather than overlay it |
| Always on top | `z-[100]` | Shortcut cheat sheet, quick note, file save, toasts |

**An immersive viewer takes the page out of reach, not just out of
sight.** Its surface is opaque and covers everything, so nothing signals
that the page is still live underneath — yet every control back there stays
focusable, and a scroll the viewer does not consume moves the page. While
one is open it marks every subtree outside itself `inert` and locks the body
scroll, restoring both on close. `useInertBackdrop` does this; attach its ref
to the viewer's root rather than reaching for `document.body`, which a viewer
rendered inline is itself inside.

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

**Addon surfaces are not there yet.** Nineteen labels across three addons still
carry `uppercase` — most of them `<h2>` / `<h3>` section headings, not the
field labels the first count called them:

| Addon | Count |
|---|---|
| `media_import` | 10 (`SubscriptionDetailPanel`, `Page`, `Composer`, `ActivityFeed`) |
| `knowledge` | 8 (`EmptyState`, `FolderView`, `ClipModal`, `Sidebar`, `graph/GraphControls`) |
| `intelligence` | 1 (`FailedJobsModal`) |

They are the same shape and want the same sweep; it reaches three submodules, so
it is deferred rather than smuggled into the change that wrote this rule.
**New addon headings follow the rule above** — the nineteen are a backlog, not a
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

### Inspector column (document layout)

The Markdown document layout puts an inspector beside the canvas: file
meta, tags, related files, comments and the addon sections that fit a
narrow column.

| Token | Value | Meaning |
|---|---|---|
| inspector width | `24rem` (384px) | Fixed. |

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

### Companion region (media file detail)

Chapters and the transcript. **Where it goes depends on which surface
the file is on**, and the two answers are not variants of one layout:

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

**Three thresholds, three questions. Do not merge any two of them.**

| Threshold | Question | Measured against |
|---|---|---|
| `60rem` = 960px | Can a rail sit beside the player? | The host's **measured width**. Gates the grid's second column, so it applies on the collection route only — on the shell the companion is a tab, and a tab fits at any width. |
| `1120px` (`VIEWPORT_OPEN_THRESHOLD`) | Does the inspector *start* open? | The **viewport**. Not a layout branch: it is how the default is derived when the reader has no stored choice, and any choice they make outranks it. §8.5's "measure the container" rule is about layout branches, so it does not apply. |
| 768px | Is the inspector a pane or a Bottom Sheet? | The **viewport**. |

960 and 1120 sound like the same question and are not: 960 is "can they
be side by side", 1120 is "should they be, by default". The band
between them — where they fit but start closed — is a real state, and
merging them would make it unsayable.

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

**For a grid of equal cards, neither mechanism is needed.**
`repeat(auto-fill, minmax(min(<card-min>, 100%), 1fr))` lets the
container's own width choose the column count, with no query, no
observer, and nothing to keep in sync. Prefer it over breakpoint
column counts wherever the cells are interchangeable.

**Card grid minimum: `16rem`.** Used by the file grid (`FileGrid`) and
the folder grid above it (`FolderContent`), which must agree so the two
rows of cards line up. Both previously used `sm:`/`lg:`/`xl:` column
counts and so mis-counted columns inside the tree pane, which is
280px narrower than the window.

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
