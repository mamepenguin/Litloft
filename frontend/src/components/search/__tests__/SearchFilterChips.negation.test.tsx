/**
 * SPEC-CORE-172 chips: a negated chip and its ✕ are named with "Exclude", the
 * `has:` chips carry their labels, and a ✕ removes only its own polarity.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { SearchFilterChips } from "../SearchFilterChips";

const group = () => screen.getByRole("group", { name: "Filters" });
const chips = () => Array.from(group().children) as HTMLElement[];
const removeButtons = () => within(group()).getAllByRole("button");
const nameOf = (element: Element) =>
  element.getAttribute("aria-label") ?? element.getAttribute("title") ?? element.textContent?.trim() ?? "";

describe("SPEC-CORE-172 chips 1, I16 a negated chip", () => {
  it.each([
    ["-tag:trip", /trip/],
    ["-type:pdf", /PDF/],
    ["-path:Work/old", /Work\/old/],
    ["-in:読了", /読了/],
    ["-is:favorite", /Favorite/i],
    ["-is:liked", /Lik/i],
  ])("%s shows Exclude and its ✕ is named with it", (query, value) => {
    render(<SearchFilterChips query={query} onRemove={vi.fn()} />);

    expect(chips()).toHaveLength(1);
    expect(chips()[0].textContent).toContain("Exclude");
    expect(chips()[0].textContent).toMatch(value);
    const [remove] = removeButtons();
    expect(nameOf(remove)).toContain("Exclude");
    expect(nameOf(remove)).toMatch(value);
  });

  it("puts Exclude before the operator's label", () => {
    render(<SearchFilterChips query="-tag:trip" onRemove={vi.fn()} />);

    const text = chips()[0].textContent ?? "";
    expect(text.indexOf("Exclude")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Exclude")).toBeLessThan(text.indexOf("Tag"));
  });

  it("a positive chip and a negated chip of the same value are two, in query order", () => {
    render(<SearchFilterChips query="tag:trip -tag:trip -tag:Trip" onRemove={vi.fn()} />);

    expect(chips()).toHaveLength(2);
    expect(chips()[0].textContent).not.toContain("Exclude");
    expect(chips()[1].textContent).toContain("Exclude");
    expect(removeButtons().filter((b) => nameOf(b).includes("Exclude"))).toHaveLength(1);
  });
});

describe("SPEC-CORE-172 chips 1 the has: chips are label-only positive chips", () => {
  it.each([
    ["has:tag", "Tagged"],
    ["-has:tag", "Untagged"],
    ["has:collection", "In a collection"],
    ["-has:collection", "In no collection"],
  ])("%s reads %s", (query, label) => {
    render(<SearchFilterChips query={query} onRemove={vi.fn()} />);

    expect(chips()).toHaveLength(1);
    expect(chips()[0].textContent).toContain(label);
    expect(chips()[0].textContent).not.toContain("Exclude");
    expect(nameOf(removeButtons()[0])).toContain(label);
  });
});

describe("SPEC-CORE-172 chips 2, I8 the ✕ removes exactly its own tokens", () => {
  it("the negated ✕ keeps the positive token of the same value", () => {
    const onRemove = vi.fn();
    render(<SearchFilterChips query="tag:x 京都 -tag:x -TAG:X" onRemove={onRemove} />);

    const negated = removeButtons().find((b) => nameOf(b).includes("Exclude"))!;
    fireEvent.click(negated);

    expect(onRemove).toHaveBeenCalledWith("tag:x 京都", 1);
  });

  it("the positive ✕ keeps the negated token of the same value", () => {
    const onRemove = vi.fn();
    render(<SearchFilterChips query="-is:favorite is:favorite 京都" onRemove={onRemove} />);

    const positive = removeButtons().find((b) => !nameOf(b).includes("Exclude"))!;
    fireEvent.click(positive);

    expect(onRemove).toHaveBeenCalledWith("-is:favorite 京都", 1);
  });

  it("the Untagged ✕ keeps has:tag", () => {
    const onRemove = vi.fn();
    render(<SearchFilterChips query="has:tag -has:tag" onRemove={onRemove} />);

    fireEvent.click(removeButtons().find((b) => nameOf(b).includes("Untagged"))!);

    expect(onRemove).toHaveBeenCalledWith("has:tag", 1);
  });
});
