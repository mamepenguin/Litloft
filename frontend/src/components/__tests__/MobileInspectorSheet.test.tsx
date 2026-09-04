import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createPortal } from "react-dom";

import { useDialogPortalTarget } from "@/components/DialogPortal";
import {
  MobileInspectorSheet,
  SHEET_PEEK_PX,
  SHEET_SNAP_FULL,
  SHEET_SNAP_HALF,
  SHEET_SNAP_PEEK,
  isSheetExpanded,
} from "@/components/MobileInspectorSheet";

/**
 * The sheet rests, it does not close.
 *
 * Three states as of 2026-09: a 56px `peek` carrying the file's name
 * and the controls that act on it, and `half` / `full` bringing the
 * rest of the inspector up over the page. The state it does not have is
 * "gone" — on a phone the per-file actions used to be somewhere in a
 * column the reader had to find, and the point of the strip is that
 * they are in the same place on every file.
 */
function renderSheet(
  snap: number | string = SHEET_SNAP_PEEK,
  onSnapChange = vi.fn(),
) {
  const utils = render(
    <MobileInspectorSheet
      snap={snap}
      onSnapChange={onSnapChange}
      peek={<div data-testid="peek-content">title and actions</div>}
    >
      <div data-testid="inspector-content">tags-content</div>
    </MobileInspectorSheet>,
  );
  return { ...utils, onSnapChange };
}

describe("MobileInspectorSheet", () => {
  it("shows the peek row at rest", () => {
    renderSheet();
    expect(screen.getByTestId("peek-content")).toBeInTheDocument();
  });

  it("gives the peek row exactly the height the design names", () => {
    // The 56px is what the reader gets at rest, so it is the row's own
    // height and not a minimum the content can push past.
    renderSheet();
    const row = screen.getByTestId("mobile-inspector-peek");
    expect(row.style.height).toBe(`${SHEET_PEEK_PX}px`);
  });

  it("mounts no dialog at rest, so the page is not hidden from a reader", () => {
    // The reason the strip is drawn outside vaul. vaul hands Radix's
    // `Dialog.Root` only `open` / `defaultOpen` / `onOpenChange` — its
    // own `modal` never arrives — so Radix defaults to modal and calls
    // `hideOthers()` on every other body child. A drawer mounted at
    // rest puts `aria-hidden="true"` on the whole application, on every
    // file page a phone opens, permanently. Nothing looks wrong; the
    // page is simply gone for anyone using a screen reader.
    const page = document.createElement("div");
    page.setAttribute("data-testid", "the-page");
    document.body.appendChild(page);
    try {
      renderSheet(SHEET_SNAP_PEEK);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(page.getAttribute("aria-hidden")).toBeNull();
    } finally {
      page.remove();
    }
  });

  it("does not draw the rest of the inspector at rest", () => {
    renderSheet(SHEET_SNAP_PEEK);
    expect(screen.queryByTestId("inspector-content")).toBeNull();
  });

  it("dims the page at half, the state the toggle opens", async () => {
    // vaul fades its overlay from the *last* snap point by default,
    // which would leave half covering the page with no dim to say so —
    // a tap outside would then collapse the sheet with nothing on
    // screen having explained why.
    renderSheet(SHEET_SNAP_HALF);
    const overlay = await screen.findByTestId("mobile-inspector-overlay");
    expect(overlay.dataset.vaulSnapPointsOverlay).toBe("true");
  });

  it("collapses to peek on a dismiss gesture instead of closing", async () => {
    // There is no closed state to dismiss to. Refusing the gesture
    // outright would leave a reader who tapped the dim with nothing
    // happening at all.
    const { onSnapChange } = renderSheet(SHEET_SNAP_HALF);
    await screen.findByTestId("mobile-inspector-sheet");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(onSnapChange).toHaveBeenCalledWith(SHEET_SNAP_PEEK);
    });
  });

  it("sits below the modal-dialog tier", async () => {
    // The sheet hosts the same inspector the desktop pane does, `[...]`
    // menu included, so Rename / Move / Trash and any addon dialog open
    // from inside it. Those portal at z-50; if the sheet outranked them
    // they would be launched and immediately buried. DESIGN.md §Layering.
    renderSheet(SHEET_SNAP_FULL);
    const sheet = await screen.findByTestId("mobile-inspector-sheet");
    const overlay = screen.getByTestId("mobile-inspector-overlay");

    for (const el of [sheet, overlay]) {
      const tier = /z-\[(\d+)\]/.exec(el.className)?.[1];
      expect(tier).toBeDefined();
      expect(Number(tier)).toBeLessThan(50);
      expect(Number(tier)).toBeGreaterThan(40);
    }
  });

  it("hosts dialogs opened from inside it, where they stay interactive", async () => {
    // vaul is `modal` while expanded: `pointer-events: none` on <body>
    // and `aria-hidden` on every other body child. A dialog portalled
    // beside the sheet is rendered and inert no matter its z-index,
    // which is why the sheet hands out a host in its own subtree.
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
      <MobileInspectorSheet
        snap={SHEET_SNAP_FULL}
        onSnapChange={() => undefined}
        peek={<div />}
      >
        <DialogFromInsideTheSheet />
      </MobileInspectorSheet>,
    );

    const dialog = await screen.findByRole("dialog", {
      name: "launched from the sheet",
    });
    expect(dialog.closest("[aria-hidden='true']")).toBeNull();
    expect(
      dialog.closest("[data-testid='mobile-inspector-sheet']"),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "confirm" })).toBeInTheDocument();
  });

  it("falls back to document.body outside the sheet", () => {
    function Probe() {
      const target = useDialogPortalTarget();
      return (
        <span data-testid="target">
          {target === document.body ? "body" : "other"}
        </span>
      );
    }
    render(<Probe />);
    expect(screen.getByTestId("target")).toHaveTextContent("body");
  });
});

describe("isSheetExpanded", () => {
  it("calls only the resting state unexpanded", () => {
    expect(isSheetExpanded(SHEET_SNAP_PEEK)).toBe(false);
    expect(isSheetExpanded(SHEET_SNAP_HALF)).toBe(true);
    expect(isSheetExpanded(SHEET_SNAP_FULL)).toBe(true);
  });
});
