import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Trash2 } from "lucide-react";

import { ContextMenu } from "../ContextMenu";
import { ShortcutsProvider } from "../ShortcutsProvider";
import {
  dismissByPressingOutside,
  openScrim,
} from "@/__tests__/helpers/dismissScrim";

/**
 * How the right-click / long-press menu closes.
 *
 * It is the popup this unit's defect was reported on: the menu closed on
 * `onPointerDown` and left the `click` that press produces to the page, so
 * on a phone the tap that closed the menu also pressed the row underneath.
 * A mouse never showed it, because cancelling `pointerdown` suppresses the
 * compatibility mouse events.
 *
 * It now goes through `DismissScrim`, which answers the press *and* takes
 * that click. What is asserted here is this menu's own share of that: it
 * closes on an outside press, keeps working when its own rows are pressed,
 * and — the behaviour it alone needs — lets a right-press retarget it,
 * which is now the browser's `contextmenu` reaching the row rather than a
 * re-dispatch of one.
 *
 * jsdom hit-tests nothing. The consequence for the row underneath is
 * measured in Chromium by `e2e-layout/popup-dismiss.spec.ts`.
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
  it("closes on a press outside it", () => {
    const onClose = open();
    dismissByPressingOutside();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps its dim, and keeps it out of the way", () => {
    // The scrim is still drawn — this menu wants no tint but does want
    // the box — and it takes no pointer events, which is what lets the
    // `contextmenu` below reach the row at all.
    open();
    expect(openScrim().style.pointerEvents).toBe("none");
  });

  it("lets a right-press retarget it onto the row underneath", () => {
    // This menu is raised by that gesture, so right-pressing a second row
    // must move the menu there. It used to take the `contextmenu` on the
    // scrim, prevent it, and re-dispatch one at the same point a frame
    // later; now the press closes the menu and the browser's own event
    // arrives at the row, which raises it again.
    const onClose = open();
    const row = document.createElement("div");
    const raised = vi.fn((e: Event) => e.preventDefault());
    row.addEventListener("contextmenu", raised);
    document.body.appendChild(row);

    fireEvent.pointerDown(row, { button: 2 });
    fireEvent.contextMenu(row);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(raised).toHaveBeenCalledTimes(1);
    row.remove();
  });

  it("still runs its rows", () => {
    // A press inside the menu is the user working it, not dismissing it,
    // so neither the close nor the swallow may fire — which is exactly
    // what would break if `DismissScrim` were given the wrong subtree as
    // its popup.
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
    const row = screen.getByRole("menuitem", { name: "Only" });
    fireEvent.pointerDown(row);
    fireEvent.click(row);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
