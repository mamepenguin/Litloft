"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Whether keys pressed now belong to the viewer at `rootRef`.
 *
 * Body counts as inside: a reader who has clicked nothing has focused
 * nothing, and the viewer is what the page is for.
 */
export function useFocusScope(rootRef: RefObject<HTMLElement | null>): boolean {
  const [inScope, setInScope] = useState(true);
  useEffect(() => {
    const update = () => {
      const active = document.activeElement;
      setInScope(
        !active ||
          active === document.body ||
          rootRef.current?.contains(active) === true,
      );
    };
    update();
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, [rootRef]);
  return inScope;
}
