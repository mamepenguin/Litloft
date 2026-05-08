import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TypeFilterChips } from "../TypeFilterChips";

describe("TypeFilterChips", () => {
  it("renders all five options", () => {
    render(<TypeFilterChips filter={null} onChange={vi.fn()} />);
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Markdown")).toBeInTheDocument();
    expect(screen.getByText("Video")).toBeInTheDocument();
    expect(screen.getByText("Image")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("marks active filter with aria-checked", () => {
    render(<TypeFilterChips filter="markdown" onChange={vi.fn()} />);
    const md = screen.getByText("Markdown");
    expect(md).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("All")).toHaveAttribute("aria-checked", "false");
  });

  it("emits null for All", () => {
    const onChange = vi.fn();
    render(<TypeFilterChips filter="markdown" onChange={onChange} />);
    fireEvent.click(screen.getByText("All"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("emits selected filter on click", () => {
    const onChange = vi.fn();
    render(<TypeFilterChips filter={null} onChange={onChange} />);
    fireEvent.click(screen.getByText("Video"));
    expect(onChange).toHaveBeenCalledWith("video");
  });
});
