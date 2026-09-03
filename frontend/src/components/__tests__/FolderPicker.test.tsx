import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
