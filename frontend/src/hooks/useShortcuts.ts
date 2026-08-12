"use client";

import { useEffect, useRef } from "react";
import { useShortcutsContext } from "@/components/ShortcutsProvider";
import type { ShortcutDef, ShortcutContextDef } from "@/lib/shortcuts";

/**
 * Register a keyboard shortcut context for as long as the component is mounted
 * and `enabled` is true.
 *
 * When `enabled` is false (default: true) the context is not pushed to the
 * stack, so it cannot shadow shortcuts from lower contexts (e.g. a closed
 * dialog must not block the video-player shortcuts beneath it).
 *
 * The shortcuts array is held in a ref so that handler closures always reflect
 * the latest state without triggering re-registration (push/pop) on every render.
 *
 * `priority` raises the context above plain push order. Overlays should pass
 * `OVERLAY_PRIORITY` so a context that enables later — an editor whose content
 * finishes loading, say — cannot take a chord away from an open modal.
 */
export function useShortcuts(
  id: string,
  label: string,
  shortcuts: ShortcutDef[],
  enabled: boolean = true,
  priority: number = 0,
): void {
  const { push, pop } = useShortcutsContext();
  const shortcutsRef = useRef<ShortcutDef[]>(shortcuts);

  // Keep ref current on every render without re-registering the context
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  useEffect(() => {
    if (!enabled) return;
    const ctx: ShortcutContextDef = {
      id,
      label,
      priority,
      // Proxy each handler through the ref so callers always invoke the
      // latest closure even after state updates.
      shortcuts: shortcuts.map((s) => ({
        ...s,
        handler: () => {
          const latest = shortcutsRef.current.find((x) => x.key === s.key);
          latest?.handler();
        },
      })),
    };
    push(ctx);
    return () => pop(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, label, push, pop, enabled, priority]);
}
