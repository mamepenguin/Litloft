import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Quote } from "lucide-react";
import { EmptyState, EMPTY_VARIANTS } from "../EmptyState";

describe("EmptyState", () => {
  // Every variant, not a sample of them.
  //
  // Three of the ten used to be rendered here, and the other seven were never
  // drawn by any test in the repository: `FolderContent.test.tsx` stubs this
  // component down to a `data-testid`, and `i18n-keys.test.ts` compares the ja
  // and en catalogues to each other without ever asking whether a key the
  // source requests exists in either. A key renamed in `variantConfig` and not
  // in the catalogue therefore reached `develop` with all three layers green,
  // and put the literal string "empty.noRecentNoProfileTitle" on the screen of
  // anyone opening ?view=recent without a profile set.
  //
  // Sampling a table is the same defect as asserting `>=` on a count: what was
  // not looked at cannot fail. So the list is exported, the count is exact, and
  // every row is drawn.
  describe("every variant resolves against the catalogue", () => {
    it("covers the whole table", () => {
      expect(EMPTY_VARIANTS).toHaveLength(10);
    });

    it.each(EMPTY_VARIANTS)("renders real copy for %s", (variant) => {
      const { container } = render(<EmptyState variant={variant} />);
      const text = container.textContent ?? "";
      // next-intl echoes the key path when a message is missing, so a raw
      // "empty." in the output *is* the failure this test exists for.
      expect(text).not.toContain("empty.");
      expect(text.trim().length).toBeGreaterThan(0);
      expect(
        screen.getByRole("heading", { level: 2 }).textContent?.trim(),
      ).toBeTruthy();
    });

    // The icon is part of the table, so a table flattened to one icon is the
    // same class of error as a table flattened to one key.
    //
    // Spelled out per variant rather than counted. A count is a summary, and a
    // summary of a table is the sampling problem again in miniature: two rows
    // could swap icons and the total would not move. (Written after guessing
    // the total and getting it wrong, which is its own argument.)
    // The expected values are lucide-react's own class names, because jsdom
    // offers no other handle on which glyph was drawn. A lucide upgrade that
    // renames them turns this red for a reason that is not a defect: updating
    // the expectations is then the correct response, not suspecting the
    // component.
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
        // Shares Clock with no-recent: same absence, different reason for it.
        "no-recent-profile": "lucide-clock",
        "no-recent-added": "lucide-file-plus",
        "no-tag-matches": "lucide-tag",
        // lucide emits both `lucide-trash2` and `lucide-trash-2`; the first wins.
        "no-trash": "lucide-trash2",
      });
    });
  });

  // The icon is outside the `<h2>`, so the heading's accessible name cannot
  // see it and `aria-hidden` is the only guard. Asserted directly, which also
  // pins lucide-react's default — deliberate, and stated so.
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

    // DESIGN.md §6's sentence, in code: "a link and a button standing next to
    // each other are the same height". `renderAction` is two branches of one
    // function — `<Button variant>` and `buttonClass({ variant })` — and
    // **neither passes `size`**, so the sentence rests entirely on the two
    // emitters picking the same default. Nothing else in the tree exercises
    // that: the only other `buttonClass()` caller passes `size` explicitly.
    //
    // The expected tokens are declared here, not read from either render.
    // Comparing the two observations to each other stays green when both
    // drift together (detector rule 5) — and both defaults living in one file
    // is exactly how they would.
    //
    // jsdom lays nothing out, so this is a claim about the classes the two
    // branches emit, not about a measured height. The height those classes
    // produce is measured in `e2e-layout/button-touch-floor.spec.ts`.
    //
    // `newTab` picks the plain-anchor branch rather than `next/link`; the
    // `className` is the same variable in both.
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

      // md, on both: the size neither branch asks for.
      for (const el of [button, link]) {
        for (const cls of ["px-4", "py-2", "text-sm", "pointer-coarse:min-h-11"]) {
          expect(el.classList.contains(cls)).toBe(true);
        }
        expect([...el.classList].filter((c) => /^px-/.test(c))).toEqual(["px-4"]);
      }

      // Principle 2 (§2.2) on the axis the case above cannot reach: a
      // secondary *link* arriving in the accent fill would spend the screen's
      // one call to action a second time.
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
