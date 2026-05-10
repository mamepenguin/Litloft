/**
 * Tests for `InspectorPane` — the open/expanded Inspector column.
 *
 * Spec: `docs/superpowers/specs/2026-05-10-markdown-document-layout.md`
 * §D3.
 *
 * Contract:
 * - Renders arbitrary child sections (children prop).
 * - Has a header with a collapse/close button. Clicking it invokes the
 *   `onClose` prop.
 * - `Cmd+\` (== `ctrl+\` on macOS via the shortcuts normalizer) toggles
 *   the inspector. The pane invokes `onToggle` for the keyboard event.
 *
 * The Inspector internally relies on the host's `ShortcutsProvider`
 * stack, so tests wrap it accordingly.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { InspectorPane } from "../InspectorPane";

describe("InspectorPane", () => {
  it("renders provided children", () => {
    render(
      <ShortcutsProvider>
        <InspectorPane onClose={vi.fn()} onToggle={vi.fn()}>
          <div data-testid="tags-section">tags</div>
          <div data-testid="related-section">related</div>
        </InspectorPane>
      </ShortcutsProvider>,
    );
    expect(screen.getByTestId("tags-section")).toBeInTheDocument();
    expect(screen.getByTestId("related-section")).toBeInTheDocument();
  });

  it("calls onClose when the collapse button is clicked", () => {
    const onClose = vi.fn();
    render(
      <ShortcutsProvider>
        <InspectorPane onClose={onClose} onToggle={vi.fn()}>
          <div>content</div>
        </InspectorPane>
      </ShortcutsProvider>,
    );
    const button = screen.getByRole("button", { name: /collapse|close/i });
    fireEvent.click(button);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("invokes onToggle when Cmd+\\ is pressed", () => {
    const onToggle = vi.fn();
    render(
      <ShortcutsProvider>
        <InspectorPane onClose={vi.fn()} onToggle={onToggle}>
          <div>content</div>
        </InspectorPane>
      </ShortcutsProvider>,
    );
    // The shortcuts library normalizes Cmd → ctrl on Mac. Use ctrlKey to
    // exercise the cross-platform path; on Mac the lib remaps metaKey →
    // ctrl, on Win/Linux ctrlKey is the literal modifier.
    fireEvent.keyDown(document, { key: "\\", ctrlKey: true });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not invoke onToggle for an unrelated key", () => {
    const onToggle = vi.fn();
    render(
      <ShortcutsProvider>
        <InspectorPane onClose={vi.fn()} onToggle={onToggle}>
          <div>content</div>
        </InspectorPane>
      </ShortcutsProvider>,
    );
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("exposes the pane with a recognizable test id for layout assertions", () => {
    render(
      <ShortcutsProvider>
        <InspectorPane onClose={vi.fn()} onToggle={vi.fn()}>
          <div>content</div>
        </InspectorPane>
      </ShortcutsProvider>,
    );
    expect(screen.getByTestId("inspector-pane")).toBeInTheDocument();
  });
});
