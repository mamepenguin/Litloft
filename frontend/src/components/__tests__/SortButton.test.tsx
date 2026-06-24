import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SortButton } from "../SortButton";

describe("SortButton", () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders sort button", () => {
    render(<SortButton sort="created_at" order="desc" onChange={onChange} />);
    expect(screen.getByLabelText("Sort")).toBeInTheDocument();
  });

  it("shows random option in menu", () => {
    render(<SortButton sort="created_at" order="desc" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Sort"));
    expect(screen.getByText("Random")).toBeInTheDocument();
  });

  it("calls onChange with random/desc when random is selected", () => {
    render(<SortButton sort="created_at" order="desc" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Sort"));
    fireEvent.click(screen.getByText("Random"));
    expect(onChange).toHaveBeenCalledWith("random", "desc");
  });

  it("shows check mark next to random when sort is random", () => {
    render(<SortButton sort="random" order="desc" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Sort"));
    const randomItem = screen.getByText("Random").closest("button");
    expect(randomItem).toHaveClass("font-medium");
  });
});
