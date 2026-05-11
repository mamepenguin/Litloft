import { describe, it, expect, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";

import { MobileInspectorSheet } from "@/components/MobileInspectorSheet";
import type { MarkdownActionTab } from "@/components/MarkdownActionBar";

// Phase 4 spec §D5 / hako sFXCwZDluTPZZkbYuozwJ: the mobile Bottom
// Sheet hosts the four content sections (tags / related / AI /
// comments). The host (MarkdownDocumentLayout) controls the active
// tab; the Sheet renders the matching child and reports drag-close /
// backdrop-tap via onClose.

const SECTIONS = {
  tags: <div data-testid="section-tags">tags-content</div>,
  related: <div data-testid="section-related">related-content</div>,
  ai: <div data-testid="section-ai">ai-content</div>,
};

describe("MobileInspectorSheet", () => {
  it("does not render the Sheet when activeTab is 'main'", () => {
    render(
      <MobileInspectorSheet
        activeTab="main"
        onClose={() => undefined}
        sections={SECTIONS}
      />,
    );
    // None of the section testids appear when the Sheet is closed.
    expect(screen.queryByTestId("section-tags")).toBeNull();
    expect(screen.queryByTestId("section-related")).toBeNull();
    expect(screen.queryByTestId("section-ai")).toBeNull();
  });

  it("renders the matching section when activeTab is set", async () => {
    const tabs: MarkdownActionTab[] = ["tags", "related", "ai"];
    for (const tab of tabs) {
      const { unmount } = render(
        <MobileInspectorSheet
          activeTab={tab}
          onClose={() => undefined}
          sections={SECTIONS}
        />,
      );
      await waitFor(() => {
        expect(screen.getByTestId(`section-${tab}`)).toBeInTheDocument();
      });
      // Other sections are not in the DOM (mounted only the active
      // one — saves re-renders, prevents stale state across switches).
      for (const other of tabs) {
        if (other !== tab) {
          expect(screen.queryByTestId(`section-${other}`)).toBeNull();
        }
      }
      unmount();
    }
  });

  it("invokes onClose when ESC is pressed (vaul's default keyboard close)", () => {
    // vaul's `<Drawer.Root onOpenChange={(open) => !open && onClose()}>`
    // path is exercised by any close affordance — drag-down, backdrop
    // tap, or ESC. JSDom doesn't simulate pointer drag well, so we
    // cover the wiring through the keyboard handler vaul attaches to
    // `document`. (The drag-to-dismiss path is exercised in real-
    // device QA, not here.)
    const onClose = vi.fn();
    render(
      <MobileInspectorSheet
        activeTab="tags"
        onClose={onClose}
        sections={SECTIONS}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    return waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("pins the displayed section during the close animation (L2)", async () => {
    // Phase 4 review L2 / hako 5rtHKXzQd9VJY7WNU5Deg: vaul keeps
    // Drawer.Content mounted while the slide-down animation plays. If
    // we cleared the child the instant `activeTab` flips to "main",
    // the user would see an empty drawer slide away. The Sheet pins
    // the last non-main tab to `displayedTab` and only clears it
    // ~350ms later so the section content stays visible through the
    // close. This test asserts that contract.
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <MobileInspectorSheet
          activeTab="related"
          onClose={() => undefined}
          sections={SECTIONS}
        />,
      );
      expect(screen.getByTestId("section-related")).toBeInTheDocument();

      // Flip to "main" — the related section must still be mounted so
      // the close animation has something to fade out.
      rerender(
        <MobileInspectorSheet
          activeTab="main"
          onClose={() => undefined}
          sections={SECTIONS}
        />,
      );
      expect(screen.getByTestId("section-related")).toBeInTheDocument();

      // Advance past the 350ms pinning window — the section unmounts.
      await act(async () => {
        vi.advanceTimersByTime(360);
      });
      expect(screen.queryByTestId("section-related")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders a heading matching the active tab", () => {
    // The Sheet labels the visible section so the user knows which
    // tab is open even if the Action Bar is partially obscured.
    render(
      <MobileInspectorSheet
        activeTab="related"
        onClose={() => undefined}
        sections={SECTIONS}
      />,
    );
    // The localised heading text for related = "Related files" (en).
    expect(screen.getByText(/Related files/i)).toBeInTheDocument();
  });
});
