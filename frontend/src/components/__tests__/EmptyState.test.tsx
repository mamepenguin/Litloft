import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Quote } from "lucide-react";
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

  it("does not render a button when no action is given", () => {
    render(<EmptyState variant="no-files" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  describe("actions", () => {
    it("renders and fires the primary action", () => {
      const onClick = vi.fn();
      render(
        <EmptyState
          variant="no-results"
          primaryAction={{ label: "Clear", onClick }}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Clear" }));
      expect(onClick).toHaveBeenCalledOnce();
    });

    it("renders and fires each secondary action", () => {
      const first = vi.fn();
      const second = vi.fn();
      render(
        <EmptyState
          variant="no-files"
          secondaryActions={[
            { label: "One", onClick: first },
            { label: "Two", onClick: second },
          ]}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Two" }));
      expect(second).toHaveBeenCalledOnce();
      expect(first).not.toHaveBeenCalled();
    });

    // Principle 2 (DESIGN.md §2.2): one accent fill per screen. The type makes
    // a second primary unrepresentable, so what is left to check is that the
    // one that *is* representable actually renders as the accent — and that
    // the secondaries beside it do not.
    it("fills only the primary action with the accent", () => {
      render(
        <EmptyState
          variant="no-files"
          primaryAction={{ label: "Add files", onClick: vi.fn() }}
          secondaryActions={[{ label: "New note", onClick: vi.fn() }]}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Add files" }).classList.contains("bg-accent"),
      ).toBe(true);
      expect(
        screen.getByRole("button", { name: "New note" }).classList.contains("bg-accent"),
      ).toBe(false);
    });

    it("puts the primary action before the secondaries", () => {
      render(
        <EmptyState
          variant="no-files"
          primaryAction={{ label: "Add files", onClick: vi.fn() }}
          secondaryActions={[{ label: "New note", onClick: vi.fn() }]}
        />,
      );
      const labels = screen.getAllByRole("button").map((b) => b.textContent);
      expect(labels).toEqual(["Add files", "New note"]);
    });
  });

  // An addon cannot use a `variant`: its copy lives in its own catalogue, and
  // a variant per addon would put the addon's vocabulary into core.
  describe("direct copy (addon form)", () => {
    it("renders the given icon, title and description", () => {
      render(
        <EmptyState
          icon={Quote}
          title="Nothing quoted yet"
          description="Press the mark on a line to collect it."
        />,
      );
      expect(screen.getByText("Nothing quoted yet")).toBeInTheDocument();
      expect(
        screen.getByText("Press the mark on a line to collect it."),
      ).toBeInTheDocument();
    });

    it("omits the description paragraph when none is given", () => {
      const { container } = render(
        <EmptyState icon={Quote} title="Nothing quoted yet" />,
      );
      expect(container.querySelectorAll("p")).toHaveLength(0);
    });

    it("does not fall back to core copy for a direct title", () => {
      render(<EmptyState icon={Quote} title="Nothing quoted yet" />);
      expect(screen.queryByText("No files")).toBeNull();
    });
  });
});
