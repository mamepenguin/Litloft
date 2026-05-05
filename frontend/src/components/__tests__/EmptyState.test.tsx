import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("renders no-files variant", () => {
    render(<EmptyState variant="no-files" />);
    expect(screen.getByText("No files")).toBeInTheDocument();
  });

  it("renders no-results variant", () => {
    render(<EmptyState variant="no-results" />);
    expect(screen.getByText("No matching files found")).toBeInTheDocument();
  });

  it("renders needs-scan variant", () => {
    render(<EmptyState variant="needs-scan" />);
    expect(screen.getByText("Scan required")).toBeInTheDocument();
  });

  it("renders action button when provided", () => {
    const onClick = vi.fn();
    render(
      <EmptyState variant="no-results" action={{ label: "Clear", onClick }} />
    );
    const button = screen.getByText("Clear");
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not render button without action", () => {
    render(<EmptyState variant="no-files" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
