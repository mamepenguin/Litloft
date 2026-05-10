/**
 * Tests for `MarkdownDocumentLayout` — the 3-column document-centric
 * shell for `.md` file detail.
 *
 * Spec: `docs/superpowers/specs/2026-05-10-markdown-document-layout.md`
 * §3 / §D3 / §6 (Phase 1).
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
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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

beforeEach(() => {
  localStorage.clear();
  setViewportWidth(1440);
});

describe("MarkdownDocumentLayout — desktop (>= 768px)", () => {
  it("renders the canvas children inside the layout", () => {
    setViewportWidth(1440);
    render(
      <MarkdownDocumentLayout drive="work" inspector={<InspectorContent />}>
        <CanvasContent />
      </MarkdownDocumentLayout>,
    );
    expect(screen.getByTestId("canvas-content")).toBeInTheDocument();
  });

  it("renders the inspector slot when open (wide viewport default)", () => {
    setViewportWidth(1440);
    render(
      <MarkdownDocumentLayout drive="work" inspector={<InspectorContent />}>
        <CanvasContent />
      </MarkdownDocumentLayout>,
    );
    expect(screen.getByTestId("inspector-content")).toBeInTheDocument();
  });

  it("exposes a layout root with a recognizable test id", () => {
    setViewportWidth(1440);
    render(
      <MarkdownDocumentLayout drive="work" inspector={<InspectorContent />}>
        <CanvasContent />
      </MarkdownDocumentLayout>,
    );
    // The root is the only element responsible for column geometry; tag
    // it for inspection so visual-regression-style assertions can hook.
    expect(screen.getByTestId("markdown-document-layout")).toBeInTheDocument();
  });

  it("shows the InspectorStrip (not full inspector) when narrow viewport defaults to closed", () => {
    setViewportWidth(1100); // < 1280 → default closed
    render(
      <MarkdownDocumentLayout drive="work" inspector={<InspectorContent />}>
        <CanvasContent />
      </MarkdownDocumentLayout>,
    );
    expect(screen.queryByTestId("inspector-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("inspector-strip")).toBeInTheDocument();
  });

  it("respects persisted localStorage state over viewport default", () => {
    setViewportWidth(1100); // narrow → would default closed
    localStorage.setItem("inspector-open:work", "true");
    render(
      <MarkdownDocumentLayout drive="work" inspector={<InspectorContent />}>
        <CanvasContent />
      </MarkdownDocumentLayout>,
    );
    expect(screen.getByTestId("inspector-content")).toBeInTheDocument();
    expect(screen.queryByTestId("inspector-strip")).not.toBeInTheDocument();
  });

  it("clicking the strip toggles the inspector open", () => {
    setViewportWidth(1100); // narrow → closed by default
    render(
      <MarkdownDocumentLayout drive="work" inspector={<InspectorContent />}>
        <CanvasContent />
      </MarkdownDocumentLayout>,
    );
    expect(screen.queryByTestId("inspector-content")).not.toBeInTheDocument();

    // Any of the strip's icon buttons should reopen the inspector.
    const stripButton = screen
      .getByTestId("inspector-strip")
      .querySelector("button");
    expect(stripButton).not.toBeNull();
    fireEvent.click(stripButton!);

    expect(screen.getByTestId("inspector-content")).toBeInTheDocument();
  });
});

describe("MarkdownDocumentLayout — mobile (< 768px graceful degradation)", () => {
  it("renders the canvas only; inspector slot is omitted on mobile", () => {
    setViewportWidth(420);
    render(
      <MarkdownDocumentLayout drive="work" inspector={<InspectorContent />}>
        <CanvasContent />
      </MarkdownDocumentLayout>,
    );
    expect(screen.getByTestId("canvas-content")).toBeInTheDocument();
    // Phase 1: mobile is not handled — Inspector content and strip both
    // hidden, single-column degrade.
    expect(screen.queryByTestId("inspector-content")).not.toBeInTheDocument();
    expect(screen.queryByTestId("inspector-strip")).not.toBeInTheDocument();
  });
});
