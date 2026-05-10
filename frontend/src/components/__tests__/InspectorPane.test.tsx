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
 *
 * The `Cmd+\` toggle shortcut is registered by the parent
 * `MarkdownDocumentLayout` (which survives both open and collapsed
 * states), so this component no longer owns the binding. See
 * `MarkdownDocumentLayout.test.tsx` for the keyboard contract.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { InspectorPane } from "../InspectorPane";

describe("InspectorPane", () => {
  it("renders provided children", () => {
    render(
      <InspectorPane onClose={vi.fn()}>
        <div data-testid="tags-section">tags</div>
        <div data-testid="related-section">related</div>
      </InspectorPane>,
    );
    expect(screen.getByTestId("tags-section")).toBeInTheDocument();
    expect(screen.getByTestId("related-section")).toBeInTheDocument();
  });

  it("calls onClose when the collapse button is clicked", () => {
    const onClose = vi.fn();
    render(
      <InspectorPane onClose={onClose}>
        <div>content</div>
      </InspectorPane>,
    );
    const button = screen.getByRole("button", { name: /collapse|close/i });
    fireEvent.click(button);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("exposes the pane with a recognizable test id for layout assertions", () => {
    render(
      <InspectorPane onClose={vi.fn()}>
        <div>content</div>
      </InspectorPane>,
    );
    expect(screen.getByTestId("inspector-pane")).toBeInTheDocument();
  });
});
