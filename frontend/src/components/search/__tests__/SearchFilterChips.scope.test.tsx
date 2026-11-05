import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { SearchFilterChips } from "../SearchFilterChips";

describe("SearchFilterChips for a folder and a collection", () => {
  it("labels the chip and its ✕ with the full value", () => {
    render(<SearchFilterChips query='path:"My Photos" in:Trip' onRemove={vi.fn()} />);

    const group = screen.getByRole("group", { name: "Filters" });
    const chips = Array.from(group.children) as HTMLElement[];

    expect(chips[0].textContent).toContain("Folder My Photos");
    expect(chips[0].title).toBe("My Photos");
    expect(chips[1].textContent).toContain("Collection Trip");
    expect(chips[1].title).toBe("Trip");
    expect(
      screen.getByRole("button", { name: "Remove Folder My Photos" }),
    ).toBeInTheDocument();
  });

  it("removes only the folder chip's token", () => {
    const onRemove = vi.fn();
    render(<SearchFilterChips query='path:"My Photos" in:Trip' onRemove={onRemove} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Folder My Photos" }));

    expect(onRemove).toHaveBeenCalledWith("in:Trip", 0);
  });
});
