import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { dismissViaScrim, openScrim } from "@/__tests__/helpers/dismissScrim";
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
    dismissViaScrim();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(pressed).not.toHaveBeenCalled();
  });

  it("does not close on the press, only on the click", async () => {
    // The mechanism, stated so that reverting it fails here: a scrim that
    // unmounts on `pointerdown` is gone before the tap's `click` is
    // dispatched, and the click lands on whatever was underneath.
    render(
      <ShortcutsProvider>
        <FolderPicker drive="recipes" value="" onChange={vi.fn()} />
      </ShortcutsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Save to:/ }));
    expect(await screen.findByText("No subfolders")).toBeInTheDocument();

    const scrim = openScrim();
    fireEvent.pointerDown(scrim);
    fireEvent.mouseDown(scrim);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(scrim);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
