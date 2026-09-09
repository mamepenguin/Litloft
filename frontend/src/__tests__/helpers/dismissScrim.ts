import { fireEvent } from "@testing-library/react";

import { DISMISS_SCRIM_ATTR } from "@/components/DismissScrim";

/**
 * The open popup's dismissal surface, or a failure naming what it found.
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
 * Dismiss the open popup the way a pointer does.
 *
 * `click`, because that is the event `DismissScrim` answers and the whole
 * point of the component is that it answers no earlier one. **jsdom does
 * not hit-test**, so this only proves the scrim closes the popup — it says
 * nothing about the scrim being the element a real tap would land on, nor
 * about the element underneath being spared. `e2e-layout/popup-dismiss`
 * measures both of those in Chromium, with a real touch.
 */
export function dismissViaScrim(): void {
  fireEvent.click(openScrim());
}
