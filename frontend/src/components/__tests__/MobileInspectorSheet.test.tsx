import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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

  it("invokes onClose when the Sheet drags down to dismiss", () => {
    // vaul's <Drawer.Root onOpenChange={(open) => !open && onClose()}>
    // path: when the drawer closes for any reason (drag, backdrop tap,
    // ESC), the host gets notified. We assert the wiring by simulating
    // the close affordance: vaul renders a close button (the backdrop
    // is a separate overlay element). Since vaul's internals are
    // unstable, this test simply confirms the prop reaches the Sheet
    // and an internal close handler exists.
    const onClose = vi.fn();
    render(
      <MobileInspectorSheet
        activeTab="tags"
        onClose={onClose}
        sections={SECTIONS}
      />,
    );
    // Press ESC — vaul's default keyboard handler closes the drawer.
    fireEvent.keyDown(document, { key: "Escape" });
    // Allow the close handler microtask to drain.
    return waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
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
