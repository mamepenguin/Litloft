import { fireEvent } from "@testing-library/react";

import { DISMISS_SCRIM_ATTR } from "@/components/DismissScrim";

/**
 * The open popup's dim, or a failure naming what it found.
 *
 * Searched on `document` rather than a render container because a popup
 * inside the mobile Bottom Sheet draws its scrim in the sheet's own
 * subtree, which is portalled.
 *
 * Exactly one: two scrims up at once means two popups are open, which is
 * a state no screen in this tree has, and a scan that took the first
 * would silently dismiss the wrong one.
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
 * Dismiss the open popup the way a pointer does: press the page outside
 * it, then release.
 *
 * The press is what `DismissScrim` answers, and the `click` after it is
 * the one the component swallows — so both are fired here, and a caller
 * asserting that the page underneath was spared gets the real sequence
 * rather than half of it.
 *
 * `document.body` stands for "somewhere that is not the popup". The scrim
 * itself is `pointer-events: none` and a real pointer never lands on it;
 * what makes this a dismissal is the target being outside the popup, not
 * the box it is over. **jsdom hit-tests nothing**, so nothing here is
 * evidence about which element a real tap would reach — and under this
 * mechanism nothing needs to be: `e2e-layout/popup-dismiss` measures the
 * outcome in Chromium with a real touch, across stacking arrangements.
 */
export function dismissByPressingOutside(): void {
  fireEvent.pointerDown(document.body);
  fireEvent.click(document.body);
}
