"use client";

import { useEffect, useRef } from "react";

/**
 * The walk goes from the root up to `<body>`, marking every sibling on the
 * way. Inerting the siblings of `<body>` alone would not be enough — a viewer
 * rendered inline sits *inside* the page's own root element, so the page is an
 * ancestor rather than a sibling.
 *
 * Focus is moved to the viewer and handed back on close. Marking a subtree
 * inert blurs whatever was focused inside it, so without this a keyboard user
 * would land on `<body>` and have to tab through the whole page to get back.
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
