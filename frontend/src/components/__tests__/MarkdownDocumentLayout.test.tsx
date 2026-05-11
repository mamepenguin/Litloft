/**
 * Tests for `MarkdownDocumentLayout` — the document-centric shell for
 * `.md` file detail with the 2026-05-11 chrome consolidation.
 *
 * Contract:
 *   - Renders a single 36px top chrome containing TreeToggle, save dot,
 *     title, view-mode segmented toggle, and an Inspector toggle.
 *   - Desktop (>=768px): Inspector pane sits beside the canvas when
 *     open. When closed, nothing replaces it (the previous
 *     `InspectorStrip` rail was retired).
 *   - Mobile (<768px): the Inspector toggle opens a single Bottom
 *     Sheet that hosts the same inspector content the desktop pane
 *     would. The legacy floating Action Bar (tags/related/AI tabs) is
 *     gone.
 *   - `Ctrl+\` toggles the inspector on desktop. The binding lives at
 *     the layout root so it survives the pane's unmount when closed
 *     (B6 regression).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ShortcutsProvider } from "@/components/ShortcutsProvider";

// `useSearchParams()` is the new gate for "did the user create this
// file?" — `?edit=1` is carried through `useCreateFile`'s canonical
// redirect, and the layout uses it to decide whether to land the user
// in edit or preview mode. The hoisted mock lets each test set its own
// params before importing.
const searchParamsRef = vi.hoisted(() => ({
  current: new URLSearchParams() as URLSearchParams | null,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsRef.current,
}));

import { MarkdownDocumentLayout } from "../MarkdownDocumentLayout";

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

function renderLayout(drive = "work", title = "my-note.md") {
  return render(
    <ShortcutsProvider>
      <MarkdownDocumentLayout
        drive={drive}
        title={title}
        inspector={<InspectorContent />}
      >
        <CanvasContent />
      </MarkdownDocumentLayout>
    </ShortcutsProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  setViewportWidth(1440);
  searchParamsRef.current = new URLSearchParams();
});

describe("MarkdownDocumentLayout — chrome", () => {
  it("renders the unified top chrome with title, mode toggle and Inspector toggle", () => {
    renderLayout("work", "my-note.md");
    expect(screen.getByTestId("markdown-document-chrome")).toBeInTheDocument();
    expect(screen.getByText("my-note.md")).toBeInTheDocument();
    expect(screen.getByTestId("view-mode-edit")).toBeInTheDocument();
    expect(screen.getByTestId("inspector-toggle")).toBeInTheDocument();
  });

  it("renders a save-state dot (idle by default)", () => {
    renderLayout();
    const dot = screen.getByTestId("save-dot");
    expect(dot.getAttribute("data-state")).toBe("idle");
  });

  it("defaults to preview mode when no ?edit=1 is present", () => {
    renderLayout();
    expect(
      screen.getByTestId("view-mode-preview").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByTestId("view-mode-edit").getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("defaults to edit mode when ?edit=1 is present (new-file signal)", () => {
    searchParamsRef.current = new URLSearchParams("edit=1");
    renderLayout();
    expect(
      screen.getByTestId("view-mode-edit").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByTestId("view-mode-preview").getAttribute("aria-pressed"),
    ).toBe("false");
  });
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
    expect(screen.getByTestId("markdown-document-layout")).toBeInTheDocument();
  });

  it("hides the inspector content (no strip rail) when collapsed by default at narrow widths", () => {
    setViewportWidth(1100); // < 1280 → default closed
    renderLayout();
    expect(screen.queryByTestId("inspector-content")).not.toBeInTheDocument();
    // The InspectorStrip rail was retired in the consolidation.
    expect(screen.queryByTestId("inspector-strip")).not.toBeInTheDocument();
  });

  it("respects persisted localStorage state over viewport default", () => {
    setViewportWidth(1100);
    localStorage.setItem("inspector-open:work", "true");
    renderLayout();
    expect(screen.getByTestId("inspector-content")).toBeInTheDocument();
  });

  it("Inspector toggle button reopens the pane when collapsed", () => {
    setViewportWidth(1100);
    renderLayout();
    expect(screen.queryByTestId("inspector-content")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("inspector-toggle"));
    expect(screen.getByTestId("inspector-content")).toBeInTheDocument();
  });

  it("Ctrl+\\ closes the inspector when it is open", () => {
    setViewportWidth(1440);
    renderLayout();
    expect(screen.getByTestId("inspector-content")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "\\", ctrlKey: true });
    expect(screen.queryByTestId("inspector-content")).not.toBeInTheDocument();
  });

  it("Ctrl+\\ reopens the inspector after it has been collapsed (B6 regression)", () => {
    setViewportWidth(1100);
    renderLayout();
    expect(screen.queryByTestId("inspector-content")).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "\\", ctrlKey: true });
    expect(screen.getByTestId("inspector-content")).toBeInTheDocument();
  });
});

describe("MarkdownDocumentLayout — mobile (< 768px)", () => {
  it("does NOT render the desktop inspector pane on mobile", () => {
    setViewportWidth(420);
    renderLayout();
    expect(screen.queryByTestId("inspector-content")).toBeNull();
  });

  it("opens the Bottom Sheet with the inspector content when the chrome toggle is tapped", async () => {
    setViewportWidth(420);
    renderLayout();
    fireEvent.click(screen.getByTestId("inspector-toggle"));
    expect(await screen.findByTestId("inspector-content")).toBeInTheDocument();
  });

  it("hides the split option in the view-mode toggle on mobile", () => {
    setViewportWidth(420);
    renderLayout();
    expect(screen.queryByTestId("view-mode-split")).toBeNull();
    expect(screen.getByTestId("view-mode-edit")).toBeInTheDocument();
    expect(screen.getByTestId("view-mode-preview")).toBeInTheDocument();
  });

  it("does not render the retired floating Action Bar", () => {
    setViewportWidth(420);
    renderLayout();
    expect(screen.queryByTestId("markdown-action-bar")).toBeNull();
  });

  it("uses `mobileSheet` content in the Sheet when the host provides it", async () => {
    // The host (FileDetailContent) opts into a richer mobile sheet by
    // passing `mobileSheet` that includes the canvas-footer heavy
    // summaries. The desktop pane keeps the lighter `inspector`
    // content; only the Sheet branch picks up the override.
    setViewportWidth(420);
    render(
      <ShortcutsProvider>
        <MarkdownDocumentLayout
          drive="work"
          title="note.md"
          inspector={<div data-testid="inspector-only">inspector only</div>}
          mobileSheet={<div data-testid="sheet-extra">sheet extra</div>}
        >
          <CanvasContent />
        </MarkdownDocumentLayout>
      </ShortcutsProvider>,
    );
    fireEvent.click(screen.getByTestId("inspector-toggle"));
    expect(await screen.findByTestId("sheet-extra")).toBeInTheDocument();
    // The desktop-only inspector content must NOT appear in the
    // sheet when the override is provided.
    expect(screen.queryByTestId("inspector-only")).toBeNull();
  });
});
