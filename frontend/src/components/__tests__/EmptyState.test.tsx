import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Quote } from "lucide-react";
import { EmptyState, EMPTY_VARIANTS } from "../EmptyState";

describe("EmptyState", () => {
  describe("every variant resolves against the catalogue", () => {
    it("covers the whole table", () => {
      expect(EMPTY_VARIANTS).toHaveLength(10);
    });

    it.each(EMPTY_VARIANTS)("renders real copy for %s", (variant) => {
      const { container } = render(<EmptyState variant={variant} />);
      const text = container.textContent ?? "";
      // next-intl echoes the key path when a message is missing.
      expect(text).not.toContain("empty.");
      expect(text.trim().length).toBeGreaterThan(0);
      expect(
        screen.getByRole("heading", { level: 2 }).textContent?.trim(),
      ).toBeTruthy();
    });

    // The expected values are lucide-react's own class names; a lucide upgrade
    // that renames them calls for updating the expectations, not the component.
    it("gives each variant the icon the table names", () => {
      const icons = Object.fromEntries(
        EMPTY_VARIANTS.map((variant) => {
          const { container } = render(<EmptyState variant={variant} />);
          const svg = container.querySelector("svg")!;
          const name = [...svg.classList].find(
            (c) => c.startsWith("lucide-") && c !== "lucide",
          );
          return [variant, name];
        }),
      );
      expect(icons).toEqual({
        "no-files": "lucide-file",
        "no-results": "lucide-search",
        "needs-scan": "lucide-refresh-cw",
        "no-favorites": "lucide-star",
        "no-liked": "lucide-thumbs-up",
        "no-recent": "lucide-clock",
        "no-recent-profile": "lucide-clock",
        "no-recent-added": "lucide-file-plus",
        "no-tag-matches": "lucide-tag",
        // lucide emits both `lucide-trash2` and `lucide-trash-2`; the first wins.
        "no-trash": "lucide-trash2",
      });
    });
  });

  it("hides the icon from assistive technology", () => {
    const { container } = render(<EmptyState variant="no-files" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("aria-label")).toBeNull();
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

    // Neither branch passes `size`, so the equal height rests on the two
    // emitters picking the same default. The expected tokens are declared
    // rather than compared to each other, which would stay green if both
    // drifted together.
    it("dresses a link action exactly like the button beside it", () => {
      render(
        <EmptyState
          variant="no-files"
          primaryAction={{ label: "Add files", onClick: vi.fn() }}
          secondaryActions={[
            { label: "Open guide", href: "/guide", newTab: true },
          ]}
        />,
      );
      const button = screen.getByRole("button", { name: "Add files" });
      const link = screen.getByRole("link", { name: "Open guide" });

      for (const el of [button, link]) {
        for (const cls of ["px-4", "py-2", "text-sm", "pointer-coarse:min-h-11"]) {
          expect(el.classList.contains(cls)).toBe(true);
        }
        expect([...el.classList].filter((c) => /^px-/.test(c))).toEqual(["px-4"]);
      }

      expect(button.classList.contains("bg-accent")).toBe(true);
      expect(link.classList.contains("bg-accent")).toBe(false);
      expect(link.classList.contains("bg-sand")).toBe(true);
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
