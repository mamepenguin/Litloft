import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getFolders, getFolderTree } from "@/lib/api";
import { FolderPicker } from "../FolderPicker";

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
      <FolderPicker drive="recipes" value="" onChange={vi.fn()} />,
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
    render(
      <div>
        <FolderPicker drive="recipes" value="" onChange={vi.fn()} />
        <button type="button">Outside</button>
      </div>,
    );

    const trigger = screen.getByRole("button", { name: /Save to:/ });
    fireEvent.click(trigger);
    expect(await screen.findByText("No subfolders")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(await screen.findByText("No subfolders")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
