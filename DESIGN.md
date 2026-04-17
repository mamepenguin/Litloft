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
| Last updated | 2026-04-14 |

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

### 3.3 Japanese Typography Rules (jp-ui-contracts)

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

### Sidebar

- Background: `bg-bg-sidebar`
- Active link: `bg-bg-elevated rounded-2xl font-medium`
- Section headers: `text-[11px] font-semibold uppercase tracking-wider text-text-muted` — English-only hardcoded strings only

### Context Menus / Dropdowns

- Radius: `rounded-2xl`
- Danger item: `text-danger hover:bg-accent/10`

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

### Don't
- Do not apply `word-break: break-all` globally to body text or UI labels
- Do not use `scale()` hover on cards or buttons — preserve the static weight
- Do not introduce additional brand colors — coral red + warm neutrals is the complete palette
- Do not use `box-shadow` decoratively — depth comes from surface color and radius
- Do not use border-radius below 12px on outer surfaces
- Do not use cool grays — always warm/olive-toned
- Do not use pure black in dark mode — use warm plum dark (`#1a0e10`)
