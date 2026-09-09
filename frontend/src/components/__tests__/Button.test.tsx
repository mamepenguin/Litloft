import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Trash2 } from "lucide-react";
import { Button, buttonClass, type ButtonSize, type ButtonVariant } from "../Button";

const VARIANTS: ButtonVariant[] = [
  "primary",
  "secondary",
  "danger",
  "ghost",
  "circle",
];

describe("Button", () => {
  it("renders its label and fires onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("defaults to type=button so it cannot submit a surrounding form", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("lets a caller ask for a submit button", () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("submit");
  });

  describe("the disabled treatment closes over every variant", () => {
    // DESIGN.md §6 "Disabled (every variant)". The whole reason this component
    // exists is that a call site cannot opt out, so every variant is asserted
    // rather than a representative one — the fill that reads as the page's call
    // to action is exactly the one a hand-written class list got wrong.
    it.each(VARIANTS)("drops the background rather than fading it (%s)", (variant) => {
      render(
        <Button variant={variant} disabled>
          Save
        </Button>,
      );
      const button = screen.getByRole("button");
      expect(button.classList.contains("disabled:bg-sand")).toBe(true);
      expect(button.classList.contains("disabled:text-warm-silver")).toBe(true);
      expect(button.classList.contains("disabled:cursor-not-allowed")).toBe(true);
    });

    it.each(VARIANTS)("never carries disabled:opacity-* (%s)", (variant) => {
      render(<Button variant={variant}>Save</Button>);
      const faded = [...screen.getByRole("button").classList].filter((c) =>
        /^disabled:opacity-/.test(c),
      );
      expect(faded).toEqual([]);
    });

    // A bare `hover:` repaints a disabled control the moment the pointer rests
    // on it — the same defect DESIGN.md §6 names for `disabled:hover:bg-accent`.
    it.each(VARIANTS)("guards every hover with enabled: (%s)", (variant) => {
      render(<Button variant={variant}>Save</Button>);
      const unguarded = [...screen.getByRole("button").classList].filter((c) =>
        c.startsWith("hover:"),
      );
      expect(unguarded).toEqual([]);
    });

    // "Closes over every variant" was asserted across the five variants and
    // only ever with a labelled button, so the claim held along one axis and
    // was untested along the other. Removing the treatment from icon-only
    // buttons alone left the suite green — and icon-only is exactly where a
    // future "square buttons need their own class list" edit would land.
    it.each(VARIANTS)("keeps the disabled treatment on icon-only too (%s)", (variant) => {
      render(
        <Button variant={variant} iconOnly aria-label="Delete Q1 notes" disabled>
          <Trash2 size={18} />
        </Button>,
      );
      const button = screen.getByRole("button", { name: "Delete Q1 notes" });
      expect(button.classList.contains("disabled:bg-sand")).toBe(true);
      expect(button.classList.contains("disabled:text-warm-silver")).toBe(true);
      expect(button.classList.contains("disabled:cursor-not-allowed")).toBe(true);
      expect(
        [...button.classList].filter((c) => /^disabled:opacity-/.test(c)),
      ).toEqual([]);
    });

    it("is actually disabled, not merely styled as such", () => {
      const onClick = vi.fn();
      render(
        <Button disabled onClick={onClick}>
          Save
        </Button>,
      );
      const button = screen.getByRole("button") as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  // DESIGN.md §6 gives each variant a radius outright — `rounded-2xl` for
  // four of them and `rounded-full` for Circle Action. Stated values with
  // nothing measuring them are how §3.2's heading rows came to be blank.
  it.each([
    ["primary", "rounded-2xl"],
    ["secondary", "rounded-2xl"],
    ["danger", "rounded-2xl"],
    ["ghost", "rounded-2xl"],
    ["circle", "rounded-full"],
  ] as const)("gives %s the radius DESIGN.md states", (variant, radius) => {
    render(<Button variant={variant}>Add</Button>);
    expect(screen.getByRole("button").classList.contains(radius)).toBe(true);
  });

  // The conversion sweep deleted `flex items-center gap-2` from call sites and
  // left the layout to this class, so nothing in the app draws its own row any
  // more — and nothing was checking it. Every one of these could be removed
  // with 4314 tests still green, while a dialog's button silently stopped
  // centring its spinner against its label.
  describe("the layout every call site now depends on", () => {
    it.each(["inline-flex", "items-center", "justify-center", "gap-1.5", "font-medium"])(
      "carries %s",
      (cls) => {
        render(<Button>Save</Button>);
        expect(screen.getByRole("button").classList.contains(cls)).toBe(true);
      },
    );

    it("centres an icon against its label", () => {
      render(
        <Button>
          <Trash2 size={16} />
          Delete
        </Button>,
      );
      const button = screen.getByRole("button");
      // A block button would stack them; the row is what the call sites gave up.
      expect(button.classList.contains("inline-flex")).toBe(true);
      expect(button.classList.contains("block")).toBe(false);
    });
  });

  // The scale is stated in DESIGN.md §6, and it was derived from the call
  // sites rather than invented: the first draft's `sm` matched none of them.
  it.each([
    ["sm", "px-3", "py-1.5", "text-sm"],
    ["md", "px-4", "py-2", "text-sm"],
    ["lg", "px-5", "py-2.5", "text-sm"],
  ] as const)("sizes %s the way DESIGN.md states", (size, px, py, text) => {
    render(<Button size={size}>Save</Button>);
    const button = screen.getByRole("button");
    for (const cls of [px, py, text]) {
      expect(button.classList.contains(cls)).toBe(true);
    }
    // Padding, not height: a fixed height clips a wrapped Japanese label.
    expect([...button.classList].filter((c) => /^h-\d/.test(c))).toEqual([]);
  });

  it("defaults to md", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button");
    expect(button.classList.contains("px-4")).toBe(true);
    expect(button.classList.contains("py-2")).toBe(true);
  });

  describe("accent fill", () => {
    it("fills primary with the accent", () => {
      render(<Button variant="primary">Add</Button>);
      expect(screen.getByRole("button").classList.contains("bg-accent")).toBe(true);
    });

    // Principle 2: one accent fill per screen. A default of `primary` would
    // spend it every time a caller omitted the prop.
    it("does not fill by default", () => {
      render(<Button>Add</Button>);
      expect(screen.getByRole("button").classList.contains("bg-accent")).toBe(false);
    });

    it.each(["secondary", "danger", "ghost", "circle"] as ButtonVariant[])(
      "does not fill %s with the accent",
      (variant) => {
        render(<Button variant={variant}>Add</Button>);
        expect(screen.getByRole("button").classList.contains("bg-accent")).toBe(
          false,
        );
      },
    );
  });

  describe("icon-only touch target", () => {
    it("grows the hit area on a coarse pointer", () => {
      render(
        <Button iconOnly aria-label="Delete Q1 notes">
          <Trash2 size={18} />
        </Button>,
      );
      const button = screen.getByRole("button", { name: "Delete Q1 notes" });
      // `classList.contains` rather than a substring match: "before:-inset-1.5"
      // is a substring of "pointer-coarse:before:-inset-1.5", so `toContain`
      // would pass on an ungated overhang — which is the defect, not the fix.
      expect(button.classList.contains("relative")).toBe(true);
      expect(
        button.classList.contains("pointer-coarse:before:absolute"),
      ).toBe(true);
      expect(
        button.classList.contains("pointer-coarse:before:-inset-1.5"),
      ).toBe(true);
    });

    // DESIGN.md §Row Actions: the 44px floor is stated under the mobile sizing
    // rules, so it governs touch. Ungated, the overhang would overlap
    // neighbours in a dense desktop row and the later element would win the
    // hit test — every control silently keeping less than it looks like it has.
    it("leaves the hit area alone on a fine pointer", () => {
      render(
        <Button iconOnly aria-label="Delete Q1 notes">
          <Trash2 size={18} />
        </Button>,
      );
      const ungated = [...screen.getByRole("button").classList].filter(
        (c) => c.startsWith("before:") && !c.startsWith("pointer-coarse:"),
      );
      expect(ungated).toEqual([]);
    });

    // The arithmetic in the component's comment ("32 + 12 = 44") is only true
    // if the box really is 32px. Padding could not promise that: `p-2` is 32px
    // around a 16px glyph, 34px around the `size={18}` icon DESIGN.md itself
    // uses as the example, and 40px around lucide's 24px default. So the box
    // is fixed and asserted, rather than left to whatever the caller passes.
    it("renders a fixed 32px box whatever glyph it is given", () => {
      for (const glyph of [12, 18, 24]) {
        const { unmount } = render(
          <Button iconOnly aria-label={`Delete ${glyph}`}>
            <Trash2 size={glyph} />
          </Button>,
        );
        const button = screen.getByRole("button", { name: `Delete ${glyph}` });
        expect(button.classList.contains("h-8")).toBe(true);
        expect(button.classList.contains("w-8")).toBe(true);
        // Padding would make the box depend on the glyph again.
        expect([...button.classList].filter((c) => /^p-/.test(c))).toEqual([]);
        unmount();
      }
    });

    it("does not grow a labelled button's hit area", () => {
      render(<Button>Save</Button>);
      const overhang = [...screen.getByRole("button").classList].filter((c) =>
        c.includes("before:-inset"),
      );
      expect(overhang).toEqual([]);
    });

    it("carries the accessible name the caller gave it", () => {
      render(
        <Button iconOnly aria-label="Delete Q1 notes">
          <Trash2 size={18} />
        </Button>,
      );
      expect(screen.getByRole("button").getAttribute("aria-label")).toBe(
        "Delete Q1 notes",
      );
    });
  });

  it("passes layout classes through without dropping its own", () => {
    render(
      <Button variant="primary" className="w-full">
        Add
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button.classList.contains("w-full")).toBe(true);
    expect(button.classList.contains("bg-accent")).toBe(true);
  });

  // The type-level promises, asserted in the suite rather than left to a
  // reader. `tsc --noEmit` runs in CI, but it only catches a violated
  // constraint if some call site violates it — loosening `size?: never` or
  // making `aria-label` optional passed both the suite and `tsc`, because
  // nothing in the tree happened to exercise them. `@ts-expect-error` is the
  // call site that does.
  describe("what the types refuse", () => {
    it("refuses an icon-only button with no accessible name", () => {
      // @ts-expect-error - `aria-label` is required when `iconOnly` is set.
      const bad = <Button iconOnly><Trash2 size={16} /></Button>;
      expect(bad).toBeTruthy();
    });

    it("refuses a size on an icon-only button", () => {
      const bad = (
        // @ts-expect-error - the box is fixed, so `size` would do nothing.
        <Button iconOnly size="lg" aria-label="Delete Q1 notes">
          <Trash2 size={16} />
        </Button>
      );
      expect(bad).toBeTruthy();
    });

    it("refuses a size outside the scale", () => {
      // @ts-expect-error - only sm | md | lg exist.
      const bad = <Button size="xl">Save</Button>;
      expect(bad).toBeTruthy();
    });

    it("refuses a variant outside the five", () => {
      // @ts-expect-error - DESIGN.md §6 names five.
      const bad = <Button variant="tertiary">Save</Button>;
      expect(bad).toBeTruthy();
    });
  });

  /**
   * The 44px touch floor, and the parity of the two emitters that carry it.
   *
   * `Button` and `buttonClass()` are two implementations of one recipe — one
   * builds a `<button>`'s class list, the other returns a string for an `<a>`
   * — and they disagreed: the anchor recipe carried the floor and the
   * component did not. Six call sites had written the class out by hand and
   * every other labelled button was under the floor on a touch screen. The
   * *disagreement* is the defect, so both emitters are asserted, neither is
   * read from the other, and the expected class is a literal here rather than
   * imported from the module under test.
   *
   * **What this cannot hold.** jsdom lays nothing out
   * (`.claude/rules/review-workflow.md`, "What a test here cannot hold"), so
   * every `getBoundingClientRect()` is zeros and nothing below is evidence
   * about a rendered height. It pins the class the two emitters produce, which
   * is a decision, not a geometry. The 44px itself was measured in Chrome
   * against the running stack's own stylesheet at 375x667 with a real coarse
   * pointer; those numbers are in the PR body, where they are dated, and not
   * in this file or in a source comment.
   */
  describe("the touch floor, on both emitters", () => {
    // Written out rather than imported: a test that reads the value it is
    // checking cannot disagree with it (detector rule 5).
    const FLOOR = "pointer-coarse:min-h-11";
    const SIZES: ButtonSize[] = ["sm", "md", "lg"];
    const CASES = VARIANTS.flatMap((variant) =>
      SIZES.map((size) => [variant, size] as const),
    );

    // The population is declared, not derived from what the render produced.
    // On its own this only catches either list being walked back — it is the
    // test's own literal. What ties the list to the component is the case
    // below it: `buttonClass` reads `VARIANT_CLASS[variant]` and calls a
    // string method on it, so a variant this list names and the component has
    // dropped throws there instead of passing quietly.
    it("covers every variant against every size", () => {
      expect(CASES.length).toBe(15);
    });

    it.each(VARIANTS)("names a variant the component still defines (%s)", (variant) => {
      expect(buttonClass({ variant })).toContain("rounded-");
    });

    it.each(CASES)("a labelled Button takes it (%s, %s)", (variant, size) => {
      render(
        <Button variant={variant} size={size}>
          Save
        </Button>,
      );
      expect(screen.getByRole("button").classList.contains(FLOOR)).toBe(true);
    });

    it.each(CASES)("a link on buttonClass takes it (%s, %s)", (variant, size) => {
      expect(buttonClass({ variant, size }).split(" ")).toContain(FLOOR);
    });

    // Gated, on both. An ungated `min-h-11` would raise the box on a mouse
    // too, which is the half of §Row Actions that says 32px on `fine` — and
    // it would still satisfy a substring search for the floor's name.
    it.each(CASES)("does not raise a Button's box on a fine pointer (%s, %s)", (variant, size) => {
      render(
        <Button variant={variant} size={size}>
          Save
        </Button>,
      );
      const ungated = [...screen.getByRole("button").classList].filter(
        (c) => /^min-h-/.test(c) || /^h-\d/.test(c),
      );
      expect(ungated).toEqual([]);
    });

    it.each(CASES)("does not raise a link's box on a fine pointer (%s, %s)", (variant, size) => {
      const ungated = buttonClass({ variant, size })
        .split(" ")
        .filter((c) => /^min-h-/.test(c) || /^h-\d/.test(c));
      expect(ungated).toEqual([]);
    });

    // The icon-only shape reaches the same floor by the other mechanism, and
    // must not take this one: a `min-h` would grow the box `ICON_BOX_CLASS`
    // fixes at 32px, and the overhang's 32 + 12 = 44 stops being true of the
    // thing on screen.
    it.each(VARIANTS)("leaves the icon-only box to the overhang (%s)", (variant) => {
      render(
        <Button variant={variant} iconOnly aria-label="Delete Q1 notes">
          <Trash2 size={18} />
        </Button>,
      );
      const button = screen.getByRole("button", { name: "Delete Q1 notes" });
      expect(button.classList.contains(FLOOR)).toBe(false);
      expect(button.classList.contains("h-8")).toBe(true);
      expect(
        button.classList.contains("pointer-coarse:before:-inset-1.5"),
      ).toBe(true);
    });
  });
});
