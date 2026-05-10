/**
 * Tests for `MarkdownDocumentLayout` — the 3-column document-centric
 * shell for `.md` file detail.
 *
 * Spec: `docs/superpowers/specs/2026-05-10-markdown-document-layout.md`
 * §3 / §D3 / §6 (Phase 1 + B6 fix-up).
 *
 * Layout (mock §"layout"):
 *   sidebar (56) | tree (280) | canvas (flex-1) | inspector (300 | 36 | 0)
 *
 * Phase 1 scope:
 * - Renders `children` (canvas content) and `inspector` slot.
 * - Inspector open  → 3-column layout, full Inspector visible.
 * - Inspector closed → InspectorStrip (36px) shown instead.
 * - Mobile (< 768px) → graceful degradation: single column, inspector
 *   slot is NOT rendered (Phase 4 lifts it into a Bottom Sheet).
 *
 * B6 fix-up: the `Cmd+\` / `Ctrl+\` toggle shortcut now lives at this
 * layout root (was previously inside `InspectorPane`, which made the
 * binding disappear together with the pane on collapse, breaking the
 * "open it again" path). The shortcut must work both when the pane
 * is open (closes it) and when it is collapsed (reopens it).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { MarkdownDocumentLayout } from "../MarkdownDocumentLayout";

// Avoid pulling in real children: stub the Inspector subcomponents that
// the layout might compose. The contract is that the host passes a
// rendered `inspector` node; the layout's job is positioning, not what
// goes inside.

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const minMatch = query.match(/min-width:\s*(\d+)px/);
    const maxMatch = query.match(/max-width:\s*(\d+)px/);
    let matches = false;
    if (minMatch) matches = width >= Number(minMatch[1]);
    if (maxMatch) matches = width <= Number(maxMatch[1]);
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  }) as unknown as typeof window.matchMedia;
}

const InspectorContent = () => (
  <div data-testid="inspector-content">Inspector body</div>
);

const CanvasContent = () => (
  <div data-testid="canvas-content">Canvas body</div>
);

function renderLayout(drive = "work") {
  return render(
    <ShortcutsProvider>
      <MarkdownDocumentLayout drive={drive} inspector={<InspectorContent />}>
        <CanvasContent />
      </MarkdownDocumentLayout>
    </ShortcutsProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  setViewportWidth(1440);
});

describe("MarkdownDocumentLayout — desktop (>= 768px)", () => {
  it("renders the canvas children inside the layout", () => {
    setViewportWidth(1440);
    renderLayout();
    expect(screen.getByTestId("canvas-content")).toBeInTheDocument();
  });

  it("renders the inspector slot when open (wide viewport default)", () => {
    setViewportWidth(1440);
    renderLayout();
    expect(screen.getByTestId("inspector-content")).toBeInTheDocument();
  });

  it("exposes a layout root with a recognizable test id", () => {
    setViewportWidth(1440);
    renderLayout();
    // The root is the only element responsible for column geometry; tag
    // it for inspection so visual-regression-style assertions can hook.
    expect(screen.getByTestId("markdown-document-layout")).toBeInTheDocument();
  });

  it("shows the InspectorStrip (not full inspector) when narrow viewport defaults to closed", () => {
    setViewportWidth(1100); // < 1280 → default closed
    renderLayout();
    expect(screen.queryByTestId("inspector-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("inspector-strip")).toBeInTheDocument();
  });

  it("respects persisted localStorage state over viewport default", () => {
    setViewportWidth(1100); // narrow → would default closed
    localStorage.setItem("inspector-open:work", "true");
    renderLayout();
    expect(screen.getByTestId("inspector-content")).toBeInTheDocument();
    expect(screen.queryByTestId("inspector-strip")).not.toBeInTheDocument();
  });

  it("clicking the strip toggles the inspector open", () => {
    setViewportWidth(1100); // narrow → closed by default
    renderLayout();
    expect(screen.queryByTestId("inspector-content")).not.toBeInTheDocument();

    // Any of the strip's icon buttons should reopen the inspector.
    const stripButton = screen
      .getByTestId("inspector-strip")
      .querySelector("button");
    expect(stripButton).not.toBeNull();
    fireEvent.click(stripButton!);

    expect(screen.getByTestId("inspector-content")).toBeInTheDocument();
  });

  it("Ctrl+\\ closes the inspector when it is open", () => {
    setViewportWidth(1440); // open by default
    renderLayout();
    expect(screen.getByTestId("inspector-content")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "\\", ctrlKey: true });
    expect(screen.queryByTestId("inspector-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("inspector-strip")).toBeInTheDocument();
  });

  it("Ctrl+\\ reopens the inspector after it has been collapsed (B6 regression)", () => {
    // Start narrow → default closed → strip is shown. Pressing Ctrl+\
    // here exercises the binding when InspectorPane is unmounted, which
    // is exactly the path that used to be broken (the shortcut lived
    // on the pane and therefore vanished with it).
    setViewportWidth(1100);
    renderLayout();
    expect(screen.queryByTestId("inspector-content")).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "\\", ctrlKey: true });
    expect(screen.getByTestId("inspector-content")).toBeInTheDocument();
  });
});

describe("MarkdownDocumentLayout — mobile (< 768px graceful degradation)", () => {
  it("renders the canvas only; inspector slot is omitted on mobile", () => {
    setViewportWidth(420);
    renderLayout();
    expect(screen.getByTestId("canvas-content")).toBeInTheDocument();
    // Phase 1: mobile is not handled — Inspector content and strip both
    // hidden, single-column degrade.
    expect(screen.queryByTestId("inspector-content")).not.toBeInTheDocument();
    expect(screen.queryByTestId("inspector-strip")).not.toBeInTheDocument();
  });
});
