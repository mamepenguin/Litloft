import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Trash2 } from "lucide-react";

import { ContextMenu } from "../ContextMenu";
import { ShortcutsProvider } from "../ShortcutsProvider";
import {
  dismissByPressingOutside,
  openScrim,
} from "@/__tests__/helpers/dismissScrim";

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
