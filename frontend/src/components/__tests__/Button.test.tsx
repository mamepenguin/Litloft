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
