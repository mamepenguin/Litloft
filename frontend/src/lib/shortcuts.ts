export interface ShortcutDef {
  key: string
  label: string
  handler: () => void
  hidden?: boolean
  // editingOnly partitions shortcuts by focus state:
  //   true      → fires ONLY when an input/textarea/select/contenteditable has focus
  //   false     → fires REGARDLESS of focus state (use for shortcuts that
  //               should work everywhere, like cycling a view mode)
  //   undefined → fires ONLY when no editing element has focus
  editingOnly?: boolean
}

export interface ShortcutContextDef {
  id: string
  label: string
  shortcuts: ShortcutDef[]
  // Push order alone is not enough for overlays: a context that enables later
  // lands on top of an already-open modal.
  priority?: number
}

/** Tier for modals and other overlays that must win their chords outright. */
export const OVERLAY_PRIORITY = 100

/**
 * Tier for something opened *on top of* an overlay, which takes Escape
 * before the overlay under it does — so closing it leaves that overlay
 * where the reader left it.
 *
 * A tier rather than a later push at `OVERLAY_PRIORITY`: within a tier the
 * order is "most recently pushed", which for two contexts in one component
 * is hook order — true, but not a rule a reader can see or a later edit
 * can be trusted to preserve.
 */
export const NESTED_OVERLAY_PRIORITY = 200

export function orderContexts(
  stack: ShortcutContextDef[],
): ShortcutContextDef[] {
  return stack
    .map((ctx, index) => ({ ctx, index }))
    .sort(
      (a, b) =>
        (b.ctx.priority ?? 0) - (a.ctx.priority ?? 0) || b.index - a.index,
    )
    .map((entry) => entry.ctx)
}

function isMacPlatform(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform)
  )
}

export function formatShortcutPart(part: string): string {
  const mac = isMacPlatform()
  if (part === "ctrl") return mac ? "⌘" : "Ctrl"
  if (part === "shift") return mac ? "⇧" : "Shift"
  if (part === "alt") return mac ? "⌥" : "Alt"
  if (part === "space") return "Space"
  if (part === "escape") return "Esc"
  if (part === "arrowleft") return "←"
  if (part === "arrowright") return "→"
  if (part === "arrowup") return "↑"
  if (part === "arrowdown") return "↓"
  return part.toUpperCase()
}

/** A chord as one string, in the form macOS or everything else writes it. */
export function formatShortcut(key: string): string {
  return key
    .split("+")
    .map(formatShortcutPart)
    .join(isMacPlatform() ? "" : "+")
}

/**
 * Shortcuts are declared with the canonical "ctrl+X" form regardless of
 * platform. The actual hardware modifier required depends on the OS:
 *
 *   - macOS:        Cmd (metaKey) is the primary modifier.
 *                   A bare Ctrl press does NOT match a "ctrl+X" shortcut —
 *                   that follows the platform convention (Mac apps use Cmd
 *                   for shortcuts; Ctrl is the OS literal Control key for
 *                   emacs-style cursor moves and chorded keys we shouldn't
 *                   shadow).
 *   - Windows/Linux: Ctrl (ctrlKey) is the primary modifier. Meta (Win/Super
 *                   key) is OS-reserved and won't fire our shortcuts.
 *
 * Rule for Shift: include "shift+" only when another modifier (the platform
 * primary or Alt) is also held, OR when the key is a named key (length > 1,
 * e.g. ArrowLeft). For plain Shift+printable (Shift+/ → "?"), e.key already
 * returns the final character, so prepending "shift+" would break matching
 * against shortcut definitions like { key: "?" }.
 */
export function normalizeKey(e: KeyboardEvent): string {
  const parts: string[] = []
  const primaryMod = isMacPlatform() ? e.metaKey : e.ctrlKey
  const hasOtherModifier = primaryMod || e.altKey

  if (primaryMod) parts.push("ctrl")
  if (e.altKey) parts.push("alt")
  if (e.shiftKey && (hasOtherModifier || e.key.length > 1)) parts.push("shift")

  const key = e.key === " " ? "space" : e.key.toLowerCase()
  parts.push(key)

  return parts.join("+")
}
