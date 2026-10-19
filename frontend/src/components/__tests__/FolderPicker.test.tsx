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
    // Pressed from inside the picker's own filter field, not at `document`:
    // a press at `document` has no `HTMLElement` target, so the provider
    // would read it as "not editing".
    const filter = screen.getByRole("textbox");
    filter.focus();
    fireEvent.keyDown(filter, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(await screen.findByText("No subfolders")).toBeInTheDocument();

    // The press that closes the picker must not also press the button
    // behind it.
    const outside = screen.getByRole("button", { name: "Outside" });
    const pressed = vi.fn();
    outside.addEventListener("click", pressed);
    dismissByPressingOutside();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(pressed).not.toHaveBeenCalled();
  });

  it("stays open while its own panel is being worked", async () => {
    // A press inside the panel is the user picking a folder, and closing on
    // it would also swallow the click that does the picking.
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
