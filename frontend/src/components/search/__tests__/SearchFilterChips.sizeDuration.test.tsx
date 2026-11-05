/**
 * SPEC-CORE-044 chips 1/2: the size and length chips carry the value as first
 * written, and their ✕ names it and removes exactly that comparison.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { SearchFilterChips } from "../SearchFilterChips";

const chips = () =>
  Array.from(screen.getByRole("group", { name: "Filters" }).children) as HTMLElement[];

describe("SPEC-CORE-044 chips 1 the chip label and its title", () => {
  it("labels a size chip and a length chip with the written value", () => {
    render(<SearchFilterChips query="size:>1GB duration:<5m" onRemove={vi.fn()} />);

    expect(chips()[0].textContent).toContain("Size >1GB");
    expect(chips()[0].title).toBe(">1GB");
    expect(chips()[1].textContent).toContain("Length <5m");
    expect(chips()[1].title).toBe("<5m");
  });

  it("shows the NFKC-normalised value as first written", () => {
    render(<SearchFilterChips query="size:＞１ＧＢ" onRemove={vi.fn()} />);

    expect(chips()[0].textContent).toContain("Size >1GB");
    expect(chips()[0].title).toBe(">1GB");
  });

  it("drops whitespace inside a quoted value", () => {
    render(<SearchFilterChips query={'size:"> 1 GB"'} onRemove={vi.fn()} />);

    expect(chips()[0].textContent).toContain("Size >1GB");
    expect(chips()[0].title).toBe(">1GB");
  });

  it("names the ✕ with the chip's value", () => {
    render(<SearchFilterChips query="size:>1GB duration:<5m" onRemove={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Remove Size >1GB" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Length <5m" }),
    ).toBeInTheDocument();
  });

  it("shows one chip per distinct comparison", () => {
    render(
      <SearchFilterChips
        query="size:>1GB size:>1024MB size:>=1GB"
        onRemove={vi.fn()}
      />,
    );

    expect(chips().map((chip) => chip.title)).toEqual([">1GB", ">=1GB"]);
  });
});

describe("SPEC-CORE-044 chips 2 the ✕ removes exactly that comparison", () => {
  it("removes every token whose comparison equals the size chip's", () => {
    const onRemove = vi.fn();
    render(
      <SearchFilterChips query="size:>1GB size:>1024MB duration:<5m" onRemove={onRemove} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove Size >1GB" }));

    expect(onRemove).toHaveBeenCalledWith("duration:<5m", 0);
  });

  it("removes only the length chip's tokens", () => {
    const onRemove = vi.fn();
    render(
      <SearchFilterChips query="size:>1GB duration:<5m" onRemove={onRemove} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove Length <5m" }));

    expect(onRemove).toHaveBeenCalledWith("size:>1GB", 1);
  });

  it("removes one side of an impossible range and keeps the other", () => {
    const onRemove = vi.fn();
    render(<SearchFilterChips query="size:>1GB size:<500MB" onRemove={onRemove} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Size >1GB" }));

    expect(onRemove).toHaveBeenCalledWith("size:<500MB", 0);
  });
});
