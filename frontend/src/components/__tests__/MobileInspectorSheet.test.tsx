import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createPortal } from "react-dom";

import { useDialogPortalTarget } from "@/components/DialogPortal";

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

  it("sits below the modal-dialog tier", async () => {
    // The sheet hosts the same inspector the desktop pane does, `[...]`
    // menu included, so Rename / Move / Trash and any addon dialog open
    // from inside it. Those portal to body at z-50; if the sheet
    // outranked them they would be launched and immediately buried.
    // DESIGN.md §Layering.
    render(
      <MobileInspectorSheet open={true} onClose={() => undefined}>
        <div>inspector</div>
      </MobileInspectorSheet>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mobile-inspector-sheet")).toBeInTheDocument();
    });
    const sheet = screen.getByTestId("mobile-inspector-sheet");
    const overlay = screen.getByTestId("mobile-inspector-overlay");

    for (const el of [sheet, overlay]) {
      const tier = /z-\[(\d+)\]/.exec(el.className)?.[1];
      expect(tier).toBeDefined();
      expect(Number(tier)).toBeLessThan(50);
      expect(Number(tier)).toBeGreaterThan(40);
    }
  });

  it("hosts dialogs opened from inside it, where they stay interactive", async () => {
    // vaul is `modal`: it puts `pointer-events: none` on <body> and
    // `aria-hidden` on every other body child. A dialog portalled beside
    // the sheet is therefore rendered and inert no matter its z-index,
    // which is why the sheet hands out a host inside its own subtree.
    function DialogFromInsideTheSheet() {
      const target = useDialogPortalTarget();
      if (!target) return null;
      return createPortal(
        <div role="dialog" aria-label="launched from the sheet">
          <button>confirm</button>
        </div>,
        target,
      );
    }

    render(
      <MobileInspectorSheet open={true} onClose={() => undefined}>
        <DialogFromInsideTheSheet />
      </MobileInspectorSheet>,
    );

    const dialog = await screen.findByRole("dialog", {
      name: "launched from the sheet",
    });
    expect(dialog.closest("[aria-hidden='true']")).toBeNull();
    expect(dialog.closest("[data-testid='mobile-inspector-sheet']"))
      .not.toBeNull();
    expect(screen.getByRole("button", { name: "confirm" })).toBeInTheDocument();
  });

  it("falls back to document.body outside the sheet", () => {
    function Probe() {
      const target = useDialogPortalTarget();
      return <span data-testid="target">{target === document.body ? "body" : "other"}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId("target")).toHaveTextContent("body");
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
