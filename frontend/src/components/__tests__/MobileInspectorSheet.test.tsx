import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { MobileInspectorSheet } from "@/components/MobileInspectorSheet";

/**
 * 2026-05-11 chrome consolidation: the mobile Bottom Sheet was
 * simplified into a single-section drawer. The previous per-tab
 * indirection (tags / related / AI) was retired alongside the
 * floating Action Bar; the Inspector toggle in the unified chrome
 * now flips a single boolean, and the host passes the same
 * inspector content the desktop pane renders.
 */
describe("MobileInspectorSheet", () => {
  it("does not render the inspector content when open is false", () => {
    render(
      <MobileInspectorSheet open={false} onClose={() => undefined}>
        <div data-testid="inspector-content">tags-content</div>
      </MobileInspectorSheet>,
    );
    expect(screen.queryByTestId("inspector-content")).toBeNull();
  });

  it("renders the inspector content when open is true", async () => {
    render(
      <MobileInspectorSheet open={true} onClose={() => undefined}>
        <div data-testid="inspector-content">tags-content</div>
      </MobileInspectorSheet>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("inspector-content")).toBeInTheDocument();
    });
  });

  it("invokes onClose when ESC is pressed (vaul's keyboard close)", () => {
    // vaul's `<Drawer.Root onOpenChange={(open) => !open && onClose()}>`
    // path is exercised by any close affordance — drag-down, backdrop
    // tap, or ESC. JSDom doesn't simulate pointer drag well, so we
    // cover the wiring through the keyboard handler vaul attaches to
    // `document`.
    const onClose = vi.fn();
    render(
      <MobileInspectorSheet open={true} onClose={onClose}>
        <div>inspector</div>
      </MobileInspectorSheet>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    return waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("renders the inspector title heading", () => {
    render(
      <MobileInspectorSheet open={true} onClose={() => undefined}>
        <div>inspector</div>
      </MobileInspectorSheet>,
    );
    // ja: "プロパティ", en: "Properties"
    expect(
      screen.getByText((text) => /Properties|プロパティ/.test(text)),
    ).toBeInTheDocument();
  });
});
