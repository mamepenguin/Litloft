import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { useCompanionMetrics } from "../useCompanionMetrics";

let observed: Element[] = [];

class RecordingResizeObserver {
  constructor(_callback: () => void) {}
  observe(target: Element) {
    observed.push(target);
  }
  unobserve(target: Element) {
    observed = observed.filter((element) => element !== target);
  }
  disconnect() {
    observed = [];
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  observed = [];
});

describe("useCompanionMetrics: the toggle row", () => {
  it("is observed when it already exists at mount, so its height changes re-measure the player budget", () => {
    vi.stubGlobal("ResizeObserver", RecordingResizeObserver);
    const pane = document.createElement("div");
    const row = document.createElement("div");
    row.className = "media-detail-workbench-row";
    pane.appendChild(row);
    document.body.appendChild(pane);

    renderHook(() => useCompanionMetrics("file-1", pane));

    expect(observed).toContain(row);
    pane.remove();
  });
});
