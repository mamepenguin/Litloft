import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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

  it("leaves the browser's own menu alone unless asked to take it", () => {
    const onDismiss = vi.fn();
    render(<DismissScrim onDismiss={onDismiss} />);

    const plain = fireEvent.contextMenu(openScrim());
    expect(onDismiss).not.toHaveBeenCalled();
    // `fireEvent` returns false when a handler called `preventDefault`.
    expect(plain).toBe(true);
  });

  it("refuses the native menu and re-aims the gesture at what is under it", async () => {
    // The regression this component shipped with: it dismissed and
    // swallowed, so right-clicking a second row closed the menu instead of
    // moving it there, and a second right-click was needed. What the
    // click-swallowing is for is a control pressed by accident; re-aiming
    // a context menu is the gesture working.
    //
    // jsdom hit-tests nothing and `elementFromPoint` is not implemented in
    // it, so the element beneath is stubbed and what is asserted is the
    // component's own behaviour: prevent the default, dismiss, then
    // re-dispatch a bubbling `contextmenu` at the same point.
    const onDismiss = vi.fn();
    const beneath = document.createElement("div");
    document.body.appendChild(beneath);
    const retargeted = vi.fn();
    beneath.addEventListener("contextmenu", retargeted);
    // Assigned, not spied: jsdom does not implement `elementFromPoint`
    // at all, so there is no property to wrap. That absence is the reason
    // the component calls it optionally, and the last case here is what
    // pins that.
    const elementFromPoint = vi.fn(() => beneath);
    (document as unknown as { elementFromPoint: unknown }).elementFromPoint =
      elementFromPoint;

    render(<DismissScrim onDismiss={onDismiss} retargetOnContextMenu />);
    const taken = fireEvent.contextMenu(openScrim(), {
      clientX: 120,
      clientY: 340,
    });

    expect(taken).toBe(false);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // Not in the same tick: the scrim is still what the point hit-tests
    // to until React has committed the unmount.
    expect(retargeted).not.toHaveBeenCalled();

    await waitFor(() => expect(retargeted).toHaveBeenCalledTimes(1));
    expect(elementFromPoint).toHaveBeenCalledWith(120, 340);
    const event = retargeted.mock.calls[0][0] as MouseEvent;
    expect(event.bubbles).toBe(true);
    expect([event.clientX, event.clientY]).toEqual([120, 340]);

    delete (document as unknown as { elementFromPoint?: unknown })
      .elementFromPoint;
    beneath.remove();
  });

  it.each([
    ["the point is over nothing", () => null],
    ["the environment has no elementFromPoint", undefined],
  ])("re-aims nothing when %s", async (_label, impl) => {
    // Two ways the lookup yields nothing, and a re-dispatch onto either
    // would throw inside a `requestAnimationFrame`, where nothing catches
    // it. The second is not hypothetical — it is jsdom, which implements
    // no hit testing at all, so every other test in this file runs in an
    // environment where the optional call is the only thing standing
    // between the component and a TypeError.
    const doc = document as unknown as { elementFromPoint?: unknown };
    if (impl) doc.elementFromPoint = impl;
    else delete doc.elementFromPoint;

    const onDismiss = vi.fn();
    render(<DismissScrim onDismiss={onDismiss} retargetOnContextMenu />);
    fireEvent.contextMenu(openScrim(), { clientX: 1, clientY: 1 });
    expect(onDismiss).toHaveBeenCalledTimes(1);

    // The throw would land in the frame, not in the call above, so the
    // assertion has to outlive it.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await new Promise((resolve) => setTimeout(resolve, 0));
    delete doc.elementFromPoint;
  });

  it("marks itself so a popup's dismissal surface is findable", () => {
    render(<DismissScrim onDismiss={vi.fn()} data-testid="probe" />);
    const scrim = screen.getByTestId("probe");
    expect(scrim).toHaveAttribute(DISMISS_SCRIM_ATTR);
  });
});
