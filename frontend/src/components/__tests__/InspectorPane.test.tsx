import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { InspectorPane } from "../InspectorPane";

describe("the inspector column", () => {
  it("is 384px wide", () => {
    render(<InspectorPane>{null}</InspectorPane>);
    expect(screen.getByTestId("inspector-pane").classList.contains("w-96")).toBe(true);
  });
});
