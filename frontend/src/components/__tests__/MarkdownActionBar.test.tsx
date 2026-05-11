import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarkdownActionBar } from "@/components/MarkdownActionBar";

// Phase 4 spec 2026-05-10 §D5 / hako sFXCwZDluTPZZkbYuozwJ:
// the mobile Markdown layout exposes a 5-tab bottom action bar
// (本文 / タグ / 関連 / AI / 会話). The "main" tab represents the
// closed-sheet state; the other four open the Bottom Sheet at the
// corresponding section.

const TABS = ["tags", "related", "ai"] as const;

describe("MarkdownActionBar", () => {
  it("renders 3 visible tabs (body / comments excluded by design)", () => {
    render(
      <MarkdownActionBar
        activeTab="main"
        onTabSelect={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /^Tags$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Related/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^AI/i })).toBeInTheDocument();
    // Body button removed in the 3rd PWA pass — closing is via
    // active-tab re-tap, backdrop tap, or drag-down.
    expect(screen.queryByRole("button", { name: /Body/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Comments/i })).toBeNull();
  });

  it("marks the active tab with aria-pressed=true and others false", () => {
    const { rerender } = render(
      <MarkdownActionBar
        activeTab="tags"
        onTabSelect={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /^Tags$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Related/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    rerender(
      <MarkdownActionBar activeTab="ai" onTabSelect={() => undefined} />,
    );
    expect(screen.getByRole("button", { name: /^AI/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /^Tags$/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("renders no tabs as active when activeTab='main' (Sheet closed state)", () => {
    render(
      <MarkdownActionBar activeTab="main" onTabSelect={() => undefined} />,
    );
    for (const tab of TABS) {
      const labelRe = new RegExp(
        tab === "tags" ? "^Tags$" : tab === "related" ? "Related" : "^AI",
        "i",
      );
      expect(
        screen.getByRole("button", { name: labelRe }),
      ).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("calls onTabSelect with the chosen tab key on click", () => {
    const handler = vi.fn();
    render(<MarkdownActionBar activeTab="main" onTabSelect={handler} />);
    for (const tab of TABS) {
      handler.mockClear();
      const labelRe = new RegExp(
        tab === "tags" ? "^Tags$" : tab === "related" ? "Related" : "^AI",
        "i",
      );
      fireEvent.click(screen.getByRole("button", { name: labelRe }));
      expect(handler).toHaveBeenCalledWith(tab);
    }
  });

  it("hides the bar when hidden=true (Phase 4: textarea focus)", () => {
    const { container, rerender } = render(
      <MarkdownActionBar activeTab="main" onTabSelect={() => undefined} />,
    );
    // Visible by default: the root element is in the document.
    const bar = container.querySelector('[data-testid="markdown-action-bar"]');
    expect(bar).not.toBeNull();
    expect(bar!.classList.contains("hidden")).toBe(false);

    rerender(
      <MarkdownActionBar
        activeTab="main"
        onTabSelect={() => undefined}
        hidden
      />,
    );
    const barAfter = container.querySelector(
      '[data-testid="markdown-action-bar"]',
    );
    expect(barAfter).not.toBeNull();
    expect(barAfter!.classList.contains("hidden")).toBe(true);
  });

  it("floats above the viewport bottom (Reachability-safe) with safe-area offset", () => {
    // Spec §D5 says "画面下端固定" but the iOS Reachability gesture
    // and home-bar swipe fire on touches very close to the bottom
    // edge in PWA mode. The bar is therefore rendered as a floating
    // pill: position fixed but offset from the bottom by
    // safe-area-inset-bottom + 8px breathing room.
    const { container } = render(
      <MarkdownActionBar activeTab="main" onTabSelect={() => undefined} />,
    );
    const bar = container.querySelector(
      '[data-testid="markdown-action-bar"]',
    ) as HTMLElement | null;
    expect(bar).not.toBeNull();
    expect(bar!.className).toContain("fixed");
    // Floating pill: horizontal insets + rounded corners + an inline
    // `bottom` that includes the safe-area inset.
    expect(bar!.className).toContain("rounded-full");
    expect(bar!.style.bottom).toMatch(/safe-area-inset-bottom/);
  });
});
