import { fireEvent } from "@testing-library/react";

import { DISMISS_SCRIM_ATTR } from "@/components/DismissScrim";

/**
 * Searched on `document` rather than a render container because a popup
 * inside the mobile Bottom Sheet draws its scrim in a portalled subtree.
 */
export function openScrim(): HTMLElement {
  const found = document.querySelectorAll<HTMLElement>(`[${DISMISS_SCRIM_ATTR}]`);
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one open ${DISMISS_SCRIM_ATTR}, found ${found.length}`,
    );
  }
  return found[0];
}

/**
 * The press is what `DismissScrim` answers and the `click` after it is the
 * one it swallows, so both are fired. The target is `document.body`, not the
 * scrim: the scrim is `pointer-events: none`.
 */
export function dismissByPressingOutside(): void {
  fireEvent.pointerDown(document.body);
  fireEvent.click(document.body);
}
