export interface ShortcutDef {
  key: string
  label: string
  handler: () => void
  hidden?: boolean
  // editingOnly partitions shortcuts by focus state:
  //   true      → fires ONLY when an input/textarea/select/contenteditable has focus
  //   undefined → fires ONLY when no editing element has focus (legacy default)
  // This lets the same key be bound to different handlers in editor vs non-editor
  // contexts (e.g. Cmd+K = link insert in textarea, switcher elsewhere).
  editingOnly?: boolean
}

export interface ShortcutContextDef {
  id: string
  label: string
  shortcuts: ShortcutDef[]
}

/**
 * Normalize a KeyboardEvent into a canonical key string.
 * Examples:
 *   Ctrl+C        → 'ctrl+c'
 *   Space         → 'space'
 *   ArrowLeft     → 'arrowleft'
 *   Shift+/       → '?'          (e.key already encodes the shift)
 *   Ctrl+Shift+F  → 'ctrl+shift+f'
 *   Meta+Shift+F  → 'ctrl+shift+f'  (metaKey treated as ctrlKey)
 *
 * Rule for Shift: include "shift+" only when another modifier (Ctrl/Meta/Alt)
 * is also held, OR when the key is a named key (length > 1, e.g. ArrowLeft).
 * For plain Shift+printable (Shift+/ → "?"), e.key already returns the final
 * character, so prepending "shift+" would break matching against shortcut
 * definitions like { key: "?" }.
 */
export function normalizeKey(e: KeyboardEvent): string {
  const parts: string[] = []
  const hasOtherModifier = e.ctrlKey || e.metaKey || e.altKey

  if (e.ctrlKey || e.metaKey) parts.push("ctrl")
  if (e.altKey) parts.push("alt")
  if (e.shiftKey && (hasOtherModifier || e.key.length > 1)) parts.push("shift")

  const key = e.key === " " ? "space" : e.key.toLowerCase()
  parts.push(key)

  return parts.join("+")
}
