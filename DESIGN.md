# HomeVault Design System

> Pinterest-inspired design system for HomeVault.
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
| Last updated | 2026-04-21 |

---

## 1. Visual Theme

A **warm white canvas** with **coral red** as the single brand accent — flat, minimal, and photography-forward.

Pinterest's design philosophy (warm neutrals, generous border-radius, depth without shadows) is translated into HomeVault's file-browser UI.

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

- `blockquote`, `pre`, `img`, and fenced code blocks all use **12px radius** (matches §4 card radius — they are the same "long-form content block" family).
- `blockquote`: `border-left: 3px solid var(--accent)`, `background: var(--bg-elevated)`, radius `0 12px 12px 0`.
- `.markdown-body > :first-child` / `:last-child` strip outer margins so the first/last block never paints a phantom gutter against its host container.
- `.markdown-segment` variant does the same strip on the **immediate** children only — use it when MarkdownPreview is rendered inside a wrapper that already owns vertical rhythm (e.g. citation-anchored segments).

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

## 4. Border Radius Scale

| Class | Value | Usage |
|---|---|---|
| `rounded-full` | 9999px | Avatars, circle buttons, filter pills |
| `rounded-2xl` | 16px | **Standard** — buttons, inputs, modals, badges |
| `rounded-xl` | 12px | Cards, containers, sub-panels |
| `rounded-lg` | 8px | Small elements inside icon containers only |

- Do not expose less than 12px border-radius on outer surfaces.
- Do not use `scale()` transforms on hover — maintain Pinterest's static weight.

---

## 5. Component Styling

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
- Shadow: none (flat design)
- Hover: surface color change only (e.g. `hover:bg-bg-elevated`) — no `scale()`

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

### Tables ("quiet editorial" style)

Default table aesthetic for MarkdownPreview and any other reading-surface table. The idea: **dividers and font-weight alone carry structure** — no fills, no zebra, no cell grid.

- `border-collapse: separate; border-spacing: 0` (so individual cells can carry their own accent border without colliding with neighbour cells).
- `th`, `td`: `border-bottom: 1px solid var(--bg-border)`, padding `0.6em 0.85em`, `text-align: left`, `vertical-align: top`.
- `thead th`: **no background fill** — the bottom rule + `font-weight: 650` carries the header role.
- No zebra stripes, no cell side-borders.
- **Exception**: vertical-header tables (`tbody th`) may keep a subtle fill on the header column to distinguish the axis.
- Mobile (`max-width: 767px`): trim table `font-size` to `0.93em`. Do not reflow — horizontal scroll is preferred to structure loss.

### Section Header Labels (i18n)

- Do **not** use `tracking-wider` — these render Japanese text
- Use `text-sm font-semibold uppercase text-text-muted` only

---

## 6. Depth & Elevation

| Level | Treatment | Usage |
|---|---|---|
| 0 (Flat) | No shadow | Cards, buttons (default) |
| 1 (Elevated) | `bg-bg-elevated` surface shift | Toolbars, sub-panels |
| 2 (Overlay) | Minimal shadow + `bg-bg-card` | Modals, dropdowns |

**Shadow philosophy**: Depth is expressed through surface color differences and border-radius — not box-shadow. Keep shadows minimal and never decorative.

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
- Do not use `scale()` hover on cards or buttons — preserve the static weight
- Do not introduce additional brand colors — coral red + warm neutrals is the complete palette
- Do not use `box-shadow` decoratively — depth comes from surface color and radius
- Do not use border-radius below 12px on outer surfaces
- Do not use cool grays — always warm/olive-toned
- Do not use pure black in dark mode — use warm plum dark (`#1a0e10`)
- Do not re-introduce the UA default yellow on `<mark>` — it is reset globally so utilities and `--highlight-bg` stay in control
- Do not add zebra stripes or cell grid borders to reading-surface tables
- Do not hard-code `max-width` on MarkdownPreview callers — flip `chrome` instead so the cap stays centralised
