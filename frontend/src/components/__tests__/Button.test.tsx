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
    // on it.
    it.each(VARIANTS)("guards every hover with enabled: (%s)", (variant) => {
      render(<Button variant={variant}>Save</Button>);
      const unguarded = [...screen.getByRole("button").classList].filter((c) =>
        c.startsWith("hover:"),
      );
      expect(unguarded).toEqual([]);
    });

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
      expect(button.classList.contains("inline-flex")).toBe(true);
      expect(button.classList.contains("block")).toBe(false);
    });
  });

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

    // One accent fill per screen: a default of `primary` would spend it every
    // time a caller omitted the prop.
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
      // is a substring of "pointer-coarse:before:-inset-1.5".
      expect(button.classList.contains("relative")).toBe(true);
      expect(
        button.classList.contains("pointer-coarse:before:absolute"),
      ).toBe(true);
      expect(
        button.classList.contains("pointer-coarse:before:-inset-1.5"),
      ).toBe(true);
    });

    // Ungated, the overhang would overlap neighbours in a dense desktop row and
    // the later element would win the hit test.
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
      // @ts-expect-error - only five variants exist.
      const bad = <Button variant="tertiary">Save</Button>;
      expect(bad).toBeTruthy();
    });
  });

  describe("the touch floor, on both emitters", () => {
    // Written out rather than imported: a test that reads the value it is
    // checking cannot disagree with it.
    const FLOOR = "pointer-coarse:min-h-11";
    const SIZES: ButtonSize[] = ["sm", "md", "lg"];
    const CASES = VARIANTS.flatMap((variant) =>
      SIZES.map((size) => [variant, size] as const),
    );

    // `hover:`, not `enabled:hover:` — CSS `:enabled` never matches an `<a>`,
    // so the guarded spelling gives a link no hover state at all.
    const LINK_BASE =
      "inline-flex items-center justify-center gap-1.5 font-medium transition-colors " +
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
    const LINK_VARIANT: Record<ButtonVariant, string> = {
      primary: "bg-accent text-white hover:bg-accent-hover rounded-2xl",
      secondary: "bg-sand text-text-primary hover:bg-sand-hover rounded-2xl",
      danger: "text-danger hover:bg-danger/10 rounded-2xl",
      ghost: "text-text-primary hover:bg-bg-elevated rounded-2xl",
      circle: "bg-warm-light text-text-primary hover:bg-sand-hover rounded-full",
    };
    const LINK_SIZE: Record<ButtonSize, string> = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2 text-sm",
      lg: "px-5 py-2.5 text-sm",
    };
    const linkRecipe = (variant: ButtonVariant, size: ButtonSize) =>
      [LINK_BASE, LINK_VARIANT[variant], LINK_SIZE[size], FLOOR].join(" ");

    it("covers every variant against every size", () => {
      expect(CASES.length).toBe(15);
    });

    it.each(VARIANTS)("names a variant the component still defines (%s)", (variant) => {
      expect(buttonClass({ variant })).toContain("rounded-");
    });

    it.each(CASES)("a link's class list is the whole recipe (%s, %s)", (variant, size) => {
      expect(buttonClass({ variant, size })).toBe(linkRecipe(variant, size));
    });

    it.each(VARIANTS)("gives a link a hover an anchor can reach (%s)", (variant) => {
      const tokens = buttonClass({ variant }).split(" ");
      expect(tokens.filter((c) => c.startsWith("enabled:"))).toEqual([]);
      expect(tokens.filter((c) => c.startsWith("disabled:"))).toEqual([]);
      expect(tokens.filter((c) => c.startsWith("hover:"))).toHaveLength(1);
    });

    it("emits the md secondary recipe when called with no arguments", () => {
      expect(buttonClass()).toBe(linkRecipe("secondary", "md"));
    });

    it("renders the secondary variant when given no variant", () => {
      render(<Button>Add</Button>);
      const tokens = [...screen.getByRole("button").classList];
      for (const cls of [
        "bg-sand",
        "text-text-primary",
        "enabled:hover:bg-sand-hover",
        "rounded-2xl",
      ]) {
        expect(tokens).toContain(cls);
      }
      expect(tokens).not.toContain("bg-accent");
      expect(tokens).not.toContain("bg-warm-light");
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

    // An ungated `min-h-11` would raise the box on a mouse too, and would still
    // satisfy a substring search for the floor's name.
    it.each(CASES)("emits no ungated min-h-* or h-* on a Button (%s, %s)", (variant, size) => {
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

    it.each(CASES)("emits no ungated min-h-* or h-* on a link (%s, %s)", (variant, size) => {
      const ungated = buttonClass({ variant, size })
        .split(" ")
        .filter((c) => /^min-h-/.test(c) || /^h-\d/.test(c));
      expect(ungated).toEqual([]);
    });

    // A `min-h` would grow the fixed 32px icon box, and the overhang's
    // 32 + 12 = 44 would stop being true.
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
