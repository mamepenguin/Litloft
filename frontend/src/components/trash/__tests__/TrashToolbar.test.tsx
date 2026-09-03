import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { TrashToolbar } from "../TrashToolbar";

vi.mock("@/components/SortButton", () => ({
  SortButton: () => <button data-testid="sort-button">Sort</button>,
}));

const defaultProps = {
  sort: "created_at" as const,
  order: "desc" as const,
  typeFilter: null,
  total: 12,
  selectable: false,
  onSortChange: vi.fn(),
  onTypeFilterChange: vi.fn(),
  onViewChange: vi.fn(),
  onToggleSelectable: vi.fn(),
};

/** The seven type pills, as the desktop row draws them. */
const pills = () =>
  screen.queryAllByRole("button", {
    name: /^(All|Video|Image|Audio|Document|Archive|Other)$/,
  });

describe("TrashToolbar", () => {
  it("offers the full set of controls when there is something in the trash", () => {
    render(<TrashToolbar {...defaultProps} />);
    expect(screen.getByTestId("sort-button")).toBeInTheDocument();
    expect(screen.getByLabelText("Grid view")).toBeInTheDocument();
    // Seven on desktop, seven again inside the mobile popover's trigger
    // menu — the trigger itself is what matters here.
    expect(pills().length).toBeGreaterThan(0);
    expect(screen.getByLabelText("File type")).toBeInTheDocument();
  });

  it("puts every arranging control away when the trash is empty", () => {
    // An empty bin has nothing to sort, nothing to lay out, and nothing
    // to filter by kind. All that is left worth saying is "0 items".
    render(<TrashToolbar {...defaultProps} total={0} />);
    expect(screen.queryByTestId("sort-button")).toBeNull();
    expect(screen.queryByLabelText("Grid view")).toBeNull();
    expect(screen.queryByLabelText("List view")).toBeNull();
    expect(pills()).toHaveLength(0);
    expect(screen.queryByLabelText("File type")).toBeNull();
    expect(screen.queryByLabelText("Selection mode")).toBeNull();
  });

  it("keeps the count when the trash is empty", () => {
    render(<TrashToolbar {...defaultProps} total={0} />);
    expect(screen.getByText(/0/)).toBeInTheDocument();
  });

  it("keeps everything when a type filter is what emptied the view", () => {
    // The pill that produced the empty result is the way back out of it.
    render(<TrashToolbar {...defaultProps} total={0} typeFilter="audio" />);
    expect(screen.getByTestId("sort-button")).toBeInTheDocument();
    expect(pills().length).toBeGreaterThan(0);
  });
});
