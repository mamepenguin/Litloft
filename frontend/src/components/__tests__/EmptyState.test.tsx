import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("renders no-videos variant", () => {
    render(<EmptyState variant="no-videos" />);
    expect(screen.getByText("動画がありません")).toBeInTheDocument();
  });

  it("renders no-results variant", () => {
    render(<EmptyState variant="no-results" />);
    expect(screen.getByText("一致する動画が見つかりません")).toBeInTheDocument();
  });

  it("renders needs-scan variant", () => {
    render(<EmptyState variant="needs-scan" />);
    expect(screen.getByText("スキャンを実行してください")).toBeInTheDocument();
  });

  it("renders action button when provided", () => {
    const onClick = vi.fn();
    render(
      <EmptyState variant="no-results" action={{ label: "クリア", onClick }} />
    );
    const button = screen.getByText("クリア");
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not render button without action", () => {
    render(<EmptyState variant="no-videos" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
