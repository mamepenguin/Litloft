"use client";

import { useEffect, useRef } from "react";

/**
 * Takes the page out of reach while an immersive viewer (DESIGN.md §Layering,
 * the `z-[60]` tier) is open, and locks the body scroll behind it.
 *
 * These viewers paint an opaque `fixed inset-0` surface, so the page is only
 * hidden visually: every control behind it stays focusable, and a scroll
 * gesture that the viewer does not consume moves the page underneath. Attach
 * the returned ref to the viewer's root element.
 *
 * The walk goes from that root up to `<body>`, marking every sibling on the
 * way. Inerting the siblings of `<body>` alone would not be enough — a viewer
 * rendered inline sits *inside* the page's own root element, so the page is an
 * ancestor rather than a sibling, and nothing about it would change.
 */
export function useInertBackdrop<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;

    const marked: Element[] = [];
    for (let node: Element = root; node.parentElement; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling === node) continue;
        // Something else already owns this subtree's inertness; leave it be,
        // so that restoring ours does not hand interaction back early.
        if (sibling.hasAttribute("inert")) continue;
        sibling.setAttribute("inert", "");
        marked.push(sibling);
      }
    }

    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    return () => {
      for (const sibling of marked) sibling.removeAttribute("inert");
      body.style.overflow = previousOverflow;
    };
  }, [active]);

  return ref;
}
