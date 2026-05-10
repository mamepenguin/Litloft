/**
 * Tests for `InspectorStrip` — the 36px collapsed Inspector rail.
 *
 * Spec: `docs/superpowers/specs/2026-05-10-markdown-document-layout.md`
 * §D3 ("折りたたみ" table).
 *
 * Mock: §"inspector-strip" — vertical column of 28x28 icon buttons.
 *
 * Contract:
 * - Renders one button per inspector section (tags / related / AI / similar
 *   / comments). Phase 1: any non-zero count and a click handler is OK.
 * - Clicking any button invokes `onOpen`. Phase 1 does not require
 *   per-section deeplinking — that is Phase 4 (mobile bottom sheet).
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { InspectorStrip } from "../InspectorStrip";

describe("InspectorStrip", () => {
  it("renders the strip container with a recognizable test id", () => {
    render(<InspectorStrip onOpen={vi.fn()} />);
    expect(screen.getByTestId("inspector-strip")).toBeInTheDocument();
  });

  it("renders multiple icon buttons in a vertical stack", () => {
    render(<InspectorStrip onOpen={vi.fn()} />);
    const buttons = screen
      .getByTestId("inspector-strip")
      .querySelectorAll("button");
    // Spec lists 5 sections (tags, related, AI, similar, comments) plus a
    // top "open inspector" chevron. Allow >= 2 to leave the exact icon
    // set as an implementation choice.
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it("invokes onOpen when any icon button is clicked", () => {
    const onOpen = vi.fn();
    render(<InspectorStrip onOpen={onOpen} />);
    const buttons = screen
      .getByTestId("inspector-strip")
      .querySelectorAll("button");
    fireEvent.click(buttons[0]!);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("invokes onOpen each time a different button is clicked", () => {
    const onOpen = vi.fn();
    render(<InspectorStrip onOpen={onOpen} />);
    const buttons = Array.from(
      screen.getByTestId("inspector-strip").querySelectorAll("button"),
    );
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(buttons[0]!);
    fireEvent.click(buttons[1]!);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("each icon button has a non-empty accessible name (title or aria-label)", () => {
    render(<InspectorStrip onOpen={vi.fn()} />);
    const buttons = Array.from(
      screen.getByTestId("inspector-strip").querySelectorAll("button"),
    );
    for (const btn of buttons) {
      const label =
        btn.getAttribute("aria-label") ||
        btn.getAttribute("title") ||
        btn.textContent?.trim();
      expect(label && label.length > 0).toBe(true);
    }
  });
});
