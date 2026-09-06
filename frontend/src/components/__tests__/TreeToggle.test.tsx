import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { treeEnabledStore } from "@/lib/treeEnabledStore";
import { treeNarrowOpenStore } from "@/lib/treeNarrowOpenStore";

// jsdom has no `matchMedia`. The toggle asks it whether the tree fits
// beside the content; `setBeside` is how a test moves the window.
let besideMatches = true;
const mediaListeners = new Set<() => void>();
function setBeside(next: boolean) {
  besideMatches = next;
  for (const l of mediaListeners) l();
}
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    get matches() {
      return besideMatches;
    },
    media: query,
    onchange: null,
    addListener: (l: () => void) => mediaListeners.add(l),
    removeListener: (l: () => void) => mediaListeners.delete(l),
    addEventListener: (_: string, l: () => void) => mediaListeners.add(l),
    removeEventListener: (_: string, l: () => void) => mediaListeners.delete(l),
    dispatchEvent: () => true,
  }),
});

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
  treeNarrowOpenStore.reset();
  besideMatches = true;
  mediaListeners.clear();
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
    ["?view=liked", "liked"],
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

  /**
   * NAV-2 rule 3. The tree toggle and the sidebar's hamburger decide which
   * surface names where you are, and only one of them holds that job at a
   * time — so both have to show whether they hold it. This one carried
   * `aria-pressed` and looked identical either way.
   */
  describe("pressed state", () => {
    const activeClasses = ["bg-bg-elevated", "text-text-primary"];

    it("looks pressed when the tree is on", () => {
      treeEnabledStore.set("work", true);
      render(<TreeToggle drive="work" />);
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-pressed", "true");
      const classes = button.className.split(/\s+/);
      for (const c of activeClasses) expect(classes).toContain(c);
    });

    it("does not when it is off", () => {
      treeEnabledStore.set("work", false);
      render(<TreeToggle drive="work" />);
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-pressed", "false");
      const classes = button.className.split(/\s+/);
      // Tokens, not substrings: `hover:bg-bg-elevated` is on the button in
      // both states and contains the resting class as a substring.
      for (const c of activeClasses) expect(classes).not.toContain(c);
      expect(classes).toContain("text-text-muted");
    });

    it("spends no accent on it", () => {
      // The screen's one fill belongs to its one action.
      treeEnabledStore.set("work", true);
      render(<TreeToggle drive="work" />);
      expect(screen.getByRole("button").className).not.toMatch(/(^|[\s:])bg-accent/);
    });
  });

  /**
   * MB-5. Below `md` the tree covers the viewport and the content is
   * hidden, so a stored "on" carried onto a phone is suppressed. The
   * button has to say so: reporting "on" over a tree that is not on
   * screen is the screen lying about itself.
   */
  describe("on a narrow window", () => {
    it("reads unpressed even where the setting says on", () => {
      treeEnabledStore.set("work", true);
      besideMatches = false;
      render(<TreeToggle drive="work" />);
      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-pressed", "false");
      expect(button.className.split(/\s+/)).toContain("text-text-muted");
    });

    it("opens the tree there without touching the stored setting", () => {
      treeEnabledStore.set("work", true);
      besideMatches = false;
      render(<TreeToggle drive="work" />);

      fireEvent.click(screen.getByRole("button"));

      expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
      // Asking for it here is about this screen. The setting a wider
      // window reads is the reader's and is left alone.
      expect(localStorage.getItem("tree:enabled:work")).toBe("true");
      expect(treeNarrowOpenStore.get("work")).toBe(true);
    });

    it("opens it there even when the setting says off", () => {
      treeEnabledStore.set("work", false);
      besideMatches = false;
      render(<TreeToggle drive="work" />);

      fireEvent.click(screen.getByRole("button"));

      expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
      expect(localStorage.getItem("tree:enabled:work")).toBe("false");
    });

    it("goes back to the stored answer when the window widens", () => {
      treeEnabledStore.set("work", true);
      besideMatches = false;
      render(<TreeToggle drive="work" />);
      expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");

      act(() => setBeside(true));

      expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    });
  });
});
