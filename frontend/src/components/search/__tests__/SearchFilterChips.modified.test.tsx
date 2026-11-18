/**
 * SPEC-CORE-138 chips: a 「更新日」 chip carries the value as first written, and
 * its ✕ removes every token of its identity.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { SearchFilterChips } from "../SearchFilterChips";

const chips = () =>
  Array.from(screen.getByRole("group", { name: "Filters" }).children) as HTMLElement[];

describe("SPEC-CORE-138 chips the label", () => {
  it("labels a modified chip with the written value", () => {
    render(<SearchFilterChips query="modified:<1y size:>1GB" onRemove={vi.fn()} />);

    expect(chips()[0].textContent).toContain("Modified <1y");
    expect(chips()[1].textContent).toContain("Size >1GB");
  });

  it("shows the NFKC-normalised value without whitespace", () => {
    render(<SearchFilterChips query={'modified:"＜ ２０２４ - ０１"'} onRemove={vi.fn()} />);

    expect(chips()[0].textContent).toContain("Modified <2024-01");
  });

  it("shows the first spelling of an identity once", () => {
    render(
      <SearchFilterChips
        query="modified:<2024/1 modified:<2024-01 modified:<=2023"
        onRemove={vi.fn()}
      />,
    );

    expect(chips()).toHaveLength(2);
    expect(chips()[0].textContent).toContain("Modified <2024/1");
    expect(chips()[1].textContent).toContain("Modified <=2023");
  });

  it("names the ✕ with the chip's value", () => {
    render(<SearchFilterChips query="modified:>=30d" onRemove={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Remove Modified >=30d" })).toBeInTheDocument();
  });
});

describe("SPEC-CORE-138 I12 the ✕ removes exactly its identity", () => {
  it("removes every spelling of the identity and keeps the rest", () => {
    const onRemove = vi.fn();
    render(
      <SearchFilterChips
        query="modified:<2024/1 tag:x modified:<2024-01 modified:<=2023"
        onRemove={onRemove}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove Modified <2024/1" }));

    expect(onRemove).toHaveBeenCalledWith("tag:x modified:<=2023", 0);
  });

  it("removes one side of an impossible range", () => {
    const onRemove = vi.fn();
    render(<SearchFilterChips query="modified:>2024 modified:<2023" onRemove={onRemove} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Modified <2023" }));

    expect(onRemove).toHaveBeenCalledWith("modified:>2024", 1);
  });
});
