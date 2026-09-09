import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { dismissByPressingOutside } from "@/__tests__/helpers/dismissScrim";
import { getFolders, getFolderTree } from "@/lib/api";
import { FolderPicker } from "../FolderPicker";
import { ShortcutsProvider } from "../ShortcutsProvider";

vi.mock("@/lib/api", () => ({
  getFolders: vi.fn(),
  getFolderTree: vi.fn(),
}));

describe("FolderPicker", () => {
  beforeEach(() => {
    vi.mocked(getFolders).mockResolvedValue([]);
    vi.mocked(getFolderTree).mockResolvedValue([]);
  });

  it("opens its panel as an overlay without changing document flow", async () => {
    render(
      <ShortcutsProvider>
        <FolderPicker drive="recipes" value="" onChange={vi.fn()} />
      </ShortcutsProvider>,
    );

    const trigger = screen.getByRole("button", { name: /Save to:/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog")).toHaveClass(
      "absolute",
      "top-full",
      "z-50",
    );
    expect(await screen.findByText("No subfolders")).toBeInTheDocument();
  });

  it("closes from Escape and an outside pointer interaction", async () => {
    // Wrapped as the app wraps it: Escape reaches the picker through
    // the shortcut stack, which AppShell mounts around everything.
    render(
      <ShortcutsProvider>
        <FolderPicker drive="recipes" value="" onChange={vi.fn()} />
        <button type="button">Outside</button>
      </ShortcutsProvider>,
    );

    const trigger = screen.getByRole("button", { name: /Save to:/ });
    fireEvent.click(trigger);
    expect(await screen.findByText("No subfolders")).toBeInTheDocument();
    // Pressed from inside the picker's own filter field, not at
    // `document`. A press at `document` has no `HTMLElement` target, so
    // the provider reads it as "not editing" and the test passes even
    // with `editingOnly: false` removed — which is the whole claim the
    // picker's comment makes.
    const filter = screen.getByRole("textbox");
    filter.focus();
    fireEvent.keyDown(filter, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(await screen.findByText("No subfolders")).toBeInTheDocument();

    // The scrim, not the button behind it. That button is what the picker
    // used to close on — a `pointerdown` anywhere outside — and the press
    // that closed it also pressed the button, which is the defect
    // `DismissScrim` exists to end. Whether the scrim really is what a tap
    // reaches is a hit test jsdom does not run; `e2e-layout` measures it.
    const outside = screen.getByRole("button", { name: "Outside" });
    const pressed = vi.fn();
    outside.addEventListener("click", pressed);
    dismissByPressingOutside();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(pressed).not.toHaveBeenCalled();
  });

  it("stays open while its own panel is being worked", async () => {
    // The other half of the mechanism, stated so that giving
    // `DismissScrim` the wrong subtree fails here: a press inside the
    // panel is the user picking a folder, and closing on it would also
    // swallow the click that does the picking.
    render(
      <ShortcutsProvider>
        <FolderPicker drive="recipes" value="" onChange={vi.fn()} />
      </ShortcutsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Save to:/ }));
    expect(await screen.findByText("No subfolders")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("dialog"));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
