import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import {
  DISMISS_SCRIM_ATTR,
  DismissScrim,
  MENU_SCRIM,
} from "../DismissScrim";
import { openScrim } from "@/__tests__/helpers/dismissScrim";

/**
 * Which event dismisses a popup, and which ones must not.
 *
 * The component's whole content is that answer, so this drives it
 * directly rather than through one of the fifteen popups that mount it.
 *
 * **jsdom lays nothing out and hit-tests nothing.** Every case here fires
 * an event *at* the scrim, which says nothing about the scrim being what a
 * real tap reaches, nor about the control underneath being spared — the
 * two properties the defect was actually made of.
 * `e2e-layout/popup-dismiss.spec.ts` measures both in Chromium with a real
 * touch, and the parity test there pins its fixture against this
 * component's class list.
 */
describe("DismissScrim", () => {
  it("closes on the click", () => {
    const onDismiss = vi.fn();
    render(<DismissScrim onDismiss={onDismiss} />);

    fireEvent.click(openScrim());

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it.each(["pointerDown", "mouseDown", "touchStart", "pointerUp", "mouseUp"] as const)(
    "does not close on %s",
    (event) => {
      // Each of these fires before the `click` a tap produces. A scrim
      // that answered any of them would have unmounted by the time the
      // click is dispatched, and the click would hit-test to whatever the
      // popup was drawn over — which is the defect, in all three of the
      // shapes the tree had.
      const onDismiss = vi.fn();
      render(<DismissScrim onDismiss={onDismiss} />);

      fireEvent[event](openScrim());

      expect(onDismiss).not.toHaveBeenCalled();
    },
  );

  it("takes the menu surface's box unless given one", () => {
    const { rerender } = render(<DismissScrim onDismiss={vi.fn()} />);
    expect(openScrim().className).toBe(MENU_SCRIM);

    rerender(<DismissScrim onDismiss={vi.fn()} className="fixed inset-0 z-49" />);
    expect(openScrim().className).toBe("fixed inset-0 z-49");
  });

  it("covers the whole of its containing block", () => {
    // `inset-0` is the property; the tint and the tier are not. Asserted
    // against the exported default rather than a copy of the string, so a
    // caller passing its own band cannot be checked here — which is why
    // every caller's own class list is read by `popup-dismissal.test.ts`.
    expect(MENU_SCRIM.split(" ")).toContain("inset-0");
    expect(MENU_SCRIM.split(" ")).toContain("fixed");
  });

  it("is inert to assistive technology unless it is named", () => {
    const { rerender } = render(<DismissScrim onDismiss={vi.fn()} />);
    expect(openScrim().tagName).toBe("DIV");
    expect(openScrim()).toHaveAttribute("aria-hidden", "true");

    // Named: the over-frame settings panel, where there is no page edge
    // to say where the panel stops, so the area that dismisses it is a
    // control rather than dead space.
    rerender(<DismissScrim onDismiss={vi.fn()} label="Close settings" />);
    expect(openScrim().tagName).toBe("BUTTON");
    expect(screen.getByRole("button", { name: "Close settings" })).toBe(
      openScrim(),
    );
  });

  it("leaves the browser's own menu alone unless asked to absorb it", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<DismissScrim onDismiss={onDismiss} />);

    const plain = fireEvent.contextMenu(openScrim());
    expect(onDismiss).not.toHaveBeenCalled();
    // `fireEvent` returns false when a handler called `preventDefault`.
    expect(plain).toBe(true);

    rerender(<DismissScrim onDismiss={onDismiss} dismissOnContextMenu />);
    const absorbed = fireEvent.contextMenu(openScrim());
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // `ContextMenu` was raised by this very gesture. Letting the default
    // through would open the browser's menu over the app's.
    expect(absorbed).toBe(false);
  });

  it("marks itself so a popup's dismissal surface is findable", () => {
    render(<DismissScrim onDismiss={vi.fn()} data-testid="probe" />);
    const scrim = screen.getByTestId("probe");
    expect(scrim).toHaveAttribute(DISMISS_SCRIM_ATTR);
  });
});
