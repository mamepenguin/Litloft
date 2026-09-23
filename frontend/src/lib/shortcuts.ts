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
  /**
   * For something that covers the page: every context of a lower priority is
   * out of reach while this one is open, so a key never acts on what the
   * reader cannot see.
   */
  blocksLower?: boolean
}

/** Tier for modals and other overlays that must win their chords outright. */
export const OVERLAY_PRIORITY = 100

/**
 * Tier for something opened on top of an overlay. A tier rather than a
 * later push, because push order within one component is just hook order.
 */
export const NESTED_OVERLAY_PRIORITY = 200

export function orderContexts(
  stack: ShortcutContextDef[],
): ShortcutContextDef[] {
  const ordered = stack
    .map((ctx, index) => ({ ctx, index }))
    .sort(
      (a, b) =>
        (b.ctx.priority ?? 0) - (a.ctx.priority ?? 0) || b.index - a.index,
    )
    .map((entry) => entry.ctx)
  const blocker = ordered.find((ctx) => ctx.blocksLower)
  if (!blocker) return ordered
  const floor = blocker.priority ?? 0
  return ordered.filter((ctx) => (ctx.priority ?? 0) >= floor)
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
 * "ctrl" means Cmd on macOS; a bare Ctrl there does not match, so
 * emacs-style bindings stay free. "shift+" is omitted for Shift+printable,
 * because `e.key` is already the shifted character ("?", not "/").
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
