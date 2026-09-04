import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Trash2 } from "lucide-react";
import { Button, type ButtonVariant } from "../Button";

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
});
