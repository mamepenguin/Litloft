export interface ShortcutDef {
  key: string
  label: string
  handler: () => void
  hidden?: boolean
  // editingOnly partitions shortcuts by focus state:
  //   true      → fires ONLY when an input/textarea/select/contenteditable has focus
  //   false     → fires REGARDLESS of focus state (use for shortcuts that
  //               should work everywhere, like cycling a view mode)
  //   undefined → fires ONLY when no editing element has focus (legacy default)
  // This lets the same key be bound to different handlers in editor vs non-editor
  // contexts (e.g. Cmd+K = link insert in textarea, switcher elsewhere).
  editingOnly?: boolean
}

export interface ShortcutContextDef {
  id: string
  label: string
  shortcuts: ShortcutDef[]
  // Resolution tier. Contexts are consulted highest tier first, and within a
  // tier most-recently-pushed first. Defaults to 0, which preserves plain
  // push-order semantics for every context that does not opt in.
  //
  // Push order alone is not enough for overlays: a context that enables later
  // lands on top of an already-open modal. Knowledge, for instance, gates its
  // editor shortcuts on the note body having loaded, so opening a modal while
  // a note is still loading would otherwise hand the modal's own chords to the
  // editor underneath it.
  priority?: number
}

/** Tier for modals and other overlays that must win their chords outright. */
export const OVERLAY_PRIORITY = 100

/**
 * Order a shortcut stack for resolution: highest priority tier first, and
 * within a tier the most recently pushed context first.
 */
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

/**
 * Normalize a KeyboardEvent into a canonical key string.
 *
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
 * Examples (rendering as "ctrl+X" regardless of which physical key was held):
 *   Win   Ctrl+C       → 'ctrl+c'
 *   Win   Win+C        → 'c'              (Meta on non-Mac doesn't qualify)
 *   Mac   Cmd+C        → 'ctrl+c'
 *   Mac   Ctrl+C       → 'c'              (Ctrl alone on Mac doesn't qualify)
 *   Both  Space        → 'space'
 *   Both  ArrowLeft    → 'arrowleft'
 *   Both  Shift+/      → '?'              (e.key already encodes the shift)
 *   Both  Ctrl+Shift+F → 'ctrl+shift+f'   (Mac substitutes Cmd here)
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
