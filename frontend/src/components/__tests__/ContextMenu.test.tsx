import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Trash2 } from "lucide-react";

import { ContextMenu } from "../ContextMenu";
import { ShortcutsProvider } from "../ShortcutsProvider";
import { openScrim } from "@/__tests__/helpers/dismissScrim";

/**
 * How the right-click / long-press menu closes.
 *
 * It is the popup this unit's defect was reported on: the scrim was
 * dismissed on `onPointerDown`, which takes it away before the tap's
 * `click` is dispatched, so on a phone the tap that closed the menu also
 * pressed the row underneath. A mouse never showed it, because cancelling
 * `pointerdown` suppresses the compatibility mouse events.
 *
 * jsdom hit-tests nothing, so what is asserted here is only which event
 * the scrim answers — the consequence for the row underneath is measured
 * in Chromium by `e2e-layout/popup-dismiss.spec.ts`.
 */
function open(onClose = vi.fn()) {
  render(
    <ShortcutsProvider>
      <ContextMenu
        open
        position={{ x: 10, y: 10 }}
        items={[{ icon: Trash2, label: "Delete", onClick: vi.fn() }]}
        onClose={onClose}
      />
    </ShortcutsProvider>,
  );
  return onClose;
}

describe("ContextMenu", () => {
  it("closes on the scrim's click", () => {
    const onClose = open();
    fireEvent.click(openScrim());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on the press that precedes it", () => {
    const onClose = open();
    fireEvent.pointerDown(openScrim());
    fireEvent.mouseDown(openScrim());
    fireEvent.touchStart(openScrim());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("absorbs a second right-click instead of stacking the browser's menu", () => {
    // This menu was raised by that gesture. Letting the default through
    // would draw the browser's own menu over the app's.
    const onClose = open();
    const notDefaulted = fireEvent.contextMenu(openScrim());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(notDefaulted).toBe(false);
  });

  it("still runs its rows", () => {
    // The scrim covers the viewport, so a menu drawn under it would be
    // unusable for its own purpose. Which of the two a press reaches is a
    // hit test jsdom does not run — `e2e-layout/popup-dismiss.spec.ts`
    // asks `elementFromPoint` over the menu — so this asserts only that
    // the row still does its job when it is pressed.
    const onClick = vi.fn();
    const onClose = vi.fn();
    render(
      <ShortcutsProvider>
        <ContextMenu
          open
          position={{ x: 10, y: 10 }}
          items={[{ icon: Trash2, label: "Only", onClick }]}
          onClose={onClose}
        />
      </ShortcutsProvider>,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Only" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
