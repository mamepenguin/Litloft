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
| Last updated | 2026-04-23 |

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

#### System mode (`[data-theme="system"]`)

Applies light or dark values via `@media (prefers-color-scheme: light/dark)`.

### 2.2 Color Usage Rules

- **`--accent`**: Use only for primary CTAs and brand highlights. Do not overuse.
- **`--sand`**: Use for secondary button backgrounds, tags, and mid-tone surfaces.
- **`--accent-teal`**: Semantic status color for success / accepted state (e.g. confirmed tag).
- **`--accent-amber`**: Semantic status color for AI-generated / suggestion-pending state (e.g. AI-suggested tag awaiting user approval). Pair with a dashed border to convey "pending". Do not use as a brand accent.
- **`--danger`**: Use only for errors, deletions, and destructive actions. Do not confuse with `--accent` red.
- **`--text-muted`**: Keep contrast readable. Do not reduce opacity beyond legibility.
- Never rely on color alone to convey state — pair with icons or text.
- **`<mark>` UA default is reset globally** (`background: transparent; color: inherit`) so Tailwind utilities (e.g. `bg-accent-teal/20`) apply wherever `<mark>` is used outside the Markdown pipeline. Inside `.markdown-body`, `--highlight-bg` wins via specificity. Do not re-introduce the browser-default yellow.

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
- `uppercase tracking-wider` on hardcoded English-only labels (e.g. "Drives", "Tags") — these are unaffected.
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
- Section headers: `text-[11px] font-semibold uppercase tracking-wider text-text-muted` — English-only hardcoded strings only
- Position: **always `position: fixed top-0 left-0 h-dvh z-40 w-60`**. Does not scroll with page content, independent of breakpoint.
- Two display modes (derived state, `isOverlay = routeOverlay || narrowViewport`):
  - **Inline** (viewport ≥ 1200px, non-overlay routes): no backdrop. The outer layout adds `min-[1200px]:pl-60` to reserve space so content sits beside the sidebar. Toggling persists to `localStorage["sidebar-open"]`.
  - **Overlay** (viewport < 1200px, **or** file detail / knowledge addon at any width): slides over content with a `z-30 bg-black/50` backdrop. Closes on backdrop click and `ESC`. Body scroll is locked while open. State is ephemeral — not persisted.
- Transitioning into overlay mode forces closed initial state; transitioning out restores the persisted global preference.
- Nav-item click behavior: **inline mode keeps the sidebar open** across navigations; **overlay mode closes it** before the route change so the backdrop is gone on arrival. The hamburger, backdrop click, and `ESC` always close regardless of mode. Overlay mode and inline mode share the same sidebar layout — no empty top bar; the first visible row is the logo.
- Menu (hamburger) button lives outside the sidebar as a `fixed top-3 left-3 z-50` floating control, visible in all states (sidebar open or closed, inline or overlay). The sidebar's logo row uses `pl-12` so the button visually sits in the sidebar's top-left without overlap.
- Transform transition: `duration-150 ease-out`. Layout padding transition: `duration-150 ease-out`.

### Context Menus / Dropdowns

- Radius: `rounded-2xl`
- Danger item: `text-danger hover:bg-accent/10`

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
- Text: `text-[11px] leading-relaxed text-text-secondary`, clamped with `line-clamp-2`. The excerpt is truncated in the data layer too, so a long source never ships into the card's DOM.
- **One snippet per hit.** Do not stack a row per match — the badges and timestamp pills above already enumerate the evidence, and repeating a timestamp as a text row shows the same fact twice.
- Row actions (e.g. the Knowledge capture action in `search-result-actions`) sit at the row's trailing edge, revealed by `group-hover` / `focus-within`, and are always visible under `pointer-coarse`. Keep the action's box in flow at `opacity-0` so revealing it never reflows the excerpt.

### Section Header Labels (i18n)

- Do **not** use `tracking-wider` — these render Japanese text
- Use `text-sm font-semibold uppercase text-text-muted` only

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

## 8. Theme Switching

An inline script in `<head>` reads `localStorage('theme-preference')` and sets `data-theme` on `<html>` before first paint to prevent flash of unstyled content.

- `'light'` → applies `[data-theme="light"]` rules
- `'dark'` → applies `[data-theme="dark"]` rules
- `'system'` → defers to `@media (prefers-color-scheme: *)` rules

---

## 8.5 Layout

### Companion rail (media file detail)

A media file's detail page may put a companion column beside the
player — chapters and the transcript. Widths:

| Token | Value | Meaning |
|---|---|---|
| rail width | `24rem` (384px) | Fixed. 320px was tried first and Japanese wrapped at 12–14 characters a line, which reads as cramped. |
| stacked height | `20rem` (320px) | The bounded box the companion becomes when it cannot sit beside the player. |
| player minimum | `34.5rem` (552px) | Narrower than this and a 16:9 video stops being watchable. |
| gap | `1.5rem` (24px) | The standard section gap. |
| switch threshold | `60rem` (960px) | The sum of the first, third and fourth. |
| lead cap, stacked | `12rem` (192px) | Most a short index may take of the 20rem box, leaving the body it indexes readable. |
| lead cap, rail | `22rem` (352px) | The same index where there is room for it. |

The threshold is a **sum, not a feel**. Change either minimum and
recompute it; do not nudge it to make a particular window look right.
Widening the rail from 320px to 384px moved the threshold from 56rem to
60rem for exactly this reason.

**The host holds the height, in both forms.** Which form is in use is a
container-width question answered in CSS, while an occupant is handed
its props in JS — so an occupant cannot know which form it is in and
must never be the one bounding itself.

**Lead and fill, not equal shares.** The region takes two kinds of
occupant: a *lead* that sizes to its own content under a cap (a short
index, such as chapters) and a *fill* that takes whatever remains (the
long body, such as the transcript). Giving both an equal share is wrong
for either. Note that `flex-shrink` is distributed by basis, and the
fill's basis is `0` — so without the cap the lead absorbs none of a
shortfall and the fill collapses to nothing.

### Measure against the container, not the viewport

Any layout that can appear both full-width and inside a pane must
switch on a **container query** (`@container`), never on a viewport
breakpoint. The file-detail surface renders in the full-screen route
and in the 2-pane right pane, which is 280px narrower than the window;
a `lg:` rule fires on window size and splits the pane at widths where
two columns do not fit.

This is the general rule, not a note about one component. Before
reaching for `md:` / `lg:`, ask whether the component ever renders
somewhere narrower than the window.

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
