import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { treeEnabledStore } from "@/lib/treeEnabledStore";

// The toggle auto-hides on cross-folder routes (favorites / search / …)
// so the route hooks must return a folder-style pathname. Each test
// can override the pathname / searchParams to exercise the auto-hide.
let mockPathname = "/drive/work";
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

import { TreeToggle } from "../TreeToggle";

beforeEach(() => {
  localStorage.clear();
  treeEnabledStore.reset();
  mockPathname = "/drive/work";
  mockSearchParams = new URLSearchParams();
});

afterEach(() => {
  localStorage.clear();
  treeEnabledStore.reset();
});

describe("TreeToggle", () => {
  it("renders an unpressed button when tree is off", () => {
    render(<TreeToggle drive="work" />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn).toHaveAttribute("aria-label", "Show tree");
  });

  it("renders a pressed button when tree is on", () => {
    treeEnabledStore.set("work", true);
    render(<TreeToggle drive="work" />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn).toHaveAttribute("aria-label", "Hide tree");
  });

  it("clicking toggles the tree state", () => {
    render(<TreeToggle drive="work" />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(treeEnabledStore.get("work")).toBe(true);
    expect(btn).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(btn);
    expect(treeEnabledStore.get("work")).toBe(false);
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("renders nothing when visible=false", () => {
    const { container } = render(<TreeToggle drive="work" visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("each drive's tree state is independent", () => {
    treeEnabledStore.set("photos", true);
    render(<TreeToggle drive="work" />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it.each([
    ["?view=favorites", "favorites"],
    ["?view=recent-added", "recent-added"],
    ["?view=popular", "popular"],
    ["?view=all", "all"],
    ["?view=recent", "recent"],
  ])("auto-hides on cross-folder view %s", (_label, view) => {
    mockSearchParams = new URLSearchParams(`view=${view}`);
    const { container } = render(<TreeToggle drive="work" />);
    expect(container.firstChild).toBeNull();
  });

  it("auto-hides on the search route (smart folders)", () => {
    mockPathname = "/drive/work/search";
    mockSearchParams = new URLSearchParams("q=foo");
    const { container } = render(<TreeToggle drive="work" />);
    expect(container.firstChild).toBeNull();
  });
});
