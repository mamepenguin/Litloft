"use client";

import { useEffect, useRef } from "react";

/**
 * Takes the page out of reach while an immersive viewer (DESIGN.md §Layering,
 * the `z-[60]` tier) is open, and locks the body scroll behind it.
 *
 * These viewers paint an opaque `fixed inset-0` surface, so the page is only
 * hidden visually: every control behind it stays focusable, and a scroll
 * gesture the viewer does not consume moves the page underneath. Attach the
 * returned ref to the viewer's root element.
 *
 * The walk goes from that root up to `<body>`, marking every sibling on the
 * way. Inerting the siblings of `<body>` alone would not be enough — a viewer
 * rendered inline sits *inside* the page's own root element, so the page is an
 * ancestor rather than a sibling, and nothing about it would change.
 *
 * Focus is moved to the viewer and handed back on close. Marking a subtree
 * inert blurs whatever was focused inside it, so without this a keyboard user
 * who opened image #147 from its thumbnail would land on `<body>` and have to
 * tab through the whole page to get back — the viewer would fix one keyboard
 * defect by introducing another.
 */
export function useInertBackdrop<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

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

    // The root carries no focusable control of its own until the chrome
    // renders, so it takes focus itself and becomes the anchor for Tab.
    const ownsTabIndex = !root.hasAttribute("tabindex");
    if (ownsTabIndex) root.setAttribute("tabindex", "-1");
    root.focus({ preventScroll: true });

    return () => {
      for (const sibling of marked) sibling.removeAttribute("inert");
      // Both current viewers unmount their root, but the hook is written to be
      // reusable, and a root that merely goes inactive should not keep an
      // attribute it did not arrive with.
      if (ownsTabIndex) root.removeAttribute("tabindex");
      body.style.overflow = previousOverflow;
      // Only if it is still in the document: the element that opened the
      // viewer may not have survived the render that closed it.
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [active]);

  return ref;
}
