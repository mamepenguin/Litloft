/**
 * Tests for `InspectorPane` — the open/expanded Inspector column.
 *
 * 2026-05-11 chrome consolidation: the pane no longer owns its own
 * header / close button — the unified top chrome in
 * `MarkdownDocumentLayout` exposes the toggle instead. The pane is now
 * a thin scrollable wrapper around the section stack.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { InspectorPane } from "../InspectorPane";

describe("InspectorPane", () => {
  it("renders provided children", () => {
    render(
      <InspectorPane>
        <div data-testid="tags-section">tags</div>
        <div data-testid="related-section">related</div>
      </InspectorPane>,
    );
    expect(screen.getByTestId("tags-section")).toBeInTheDocument();
    expect(screen.getByTestId("related-section")).toBeInTheDocument();
  });

  it("exposes the pane with a recognizable test id for layout assertions", () => {
    render(
      <InspectorPane>
        <div>content</div>
      </InspectorPane>,
    );
    expect(screen.getByTestId("inspector-pane")).toBeInTheDocument();
  });

  it("does not render its own header / close button (chrome owns the toggle)", () => {
    render(
      <InspectorPane>
        <div>content</div>
      </InspectorPane>,
    );
    expect(
      screen.queryByRole("button", { name: /close|collapse/i }),
    ).not.toBeInTheDocument();
  });
});
