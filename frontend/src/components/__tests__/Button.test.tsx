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
   * read from the other, and every expected class below is a literal here
   * rather than imported from the module under test.
   *
   * **The floor is the one thing here that cannot diverge any more**, because
   * after the fix both emitters read one constant — one table read twice,
   * which is detector rule 2. So the register below does not stop at the
   * floor: it pins the anchor's *whole* class list per `(variant, size)`,
   * which is where the two are genuinely two implementations. Deleting the
   * `enabled:hover:` rewrite, the base class or the size class from
   * `buttonClass()` each left the whole suite green before this existed.
   *
   * **The defaults are pinned separately.** The thirty explicit cases pin the
   * declaration, and every one of them passes `variant` *and* `size`;
   * `EmptyState` — the sentence "a link and a button standing next to each
   * other are the same height", written as two branches of one function —
   * passes `variant` to both emitters and `size` to neither, so on that screen
   * the two heights agree only because the two defaults do. `Button`'s default
   * was pinned by "defaults to md" and `buttonClass()`'s was pinned by
   * nothing; the asymmetry is what the zero-argument case closes, and it takes
   * the default `variant` with it because a default nothing exercises today is
   * how the next caller inherits the wrong one. The pair *beside each other*
   * is held in `EmptyState.test.tsx`.
   *
   * **What this cannot hold.** jsdom lays nothing out
   * (`.claude/rules/review-workflow.md`, "What a test here cannot hold"), so
   * every `getBoundingClientRect()` is zeros and nothing below is evidence
   * about a rendered height. It pins the class the two emitters produce, which
   * is a decision, not a geometry. The heights those classes produce — 32 / 36
   * / 40 on a fine pointer, 44 on a coarse one, and the icon box staying 32 at
   * both — are measured in a real browser by
   * `e2e-layout/button-touch-floor.spec.ts`, which CI runs.
   */
  describe("the touch floor, on both emitters", () => {
    // Written out rather than imported: a test that reads the value it is
    // checking cannot disagree with it (detector rule 5).
    const FLOOR = "pointer-coarse:min-h-11";
    const SIZES: ButtonSize[] = ["sm", "md", "lg"];
    const CASES = VARIANTS.flatMap((variant) =>
      SIZES.map((size) => [variant, size] as const),
    );

    // The anchor's recipe, declared. Same rule as `FLOOR`: these are the
    // strings the component is expected to emit, typed out here, not read
    // back from it.
    //
    // `hover:`, not `enabled:hover:` — CSS `:enabled` never matches an `<a>`,
    // so the guarded spelling gives a link no hover state at all beside a
    // `Button` that lights up. And no `disabled:` half: unreachable markup on
    // an anchor.
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

    // The population is declared, not derived from what the render produced.
    // On its own this only catches either list being walked back — it is the
    // test's own literal. What ties both lists to the component is the whole
    // class list asserted below: a variant this list names and the component
    // has dropped throws in `VARIANT_CLASS[variant].replaceAll(...)`, and a
    // size it has dropped is swallowed by `.filter(Boolean)` and leaves the
    // padding missing from a string compared with `toBe`. (Before that
    // comparison existed the tie held for variants only, and dropping `lg`
    // from `SIZE_CLASS` passed all thirty cases.)
    it("covers every variant against every size", () => {
      expect(CASES.length).toBe(15);
    });

    it.each(VARIANTS)("names a variant the component still defines (%s)", (variant) => {
      expect(buttonClass({ variant })).toContain("rounded-");
    });

    // The whole string, not a token search. `toContain` on a class list is
    // satisfied by everything else in it being gone.
    it.each(CASES)("a link's class list is the whole recipe (%s, %s)", (variant, size) => {
      expect(buttonClass({ variant, size })).toBe(linkRecipe(variant, size));
    });

    // Named separately from the register above even though that pins it
    // too: it is the divergence `buttonClass()` exists for, and a reader
    // scanning failures should see it stated rather than inferred from a
    // long string diff.
    it.each(VARIANTS)("gives a link a hover an anchor can reach (%s)", (variant) => {
      const tokens = buttonClass({ variant }).split(" ");
      expect(tokens.filter((c) => c.startsWith("enabled:"))).toEqual([]);
      expect(tokens.filter((c) => c.startsWith("disabled:"))).toEqual([]);
      expect(tokens.filter((c) => c.startsWith("hover:"))).toHaveLength(1);
    });

    // The dispatch, not the declaration. `EmptyState` is the only caller in
    // the tree that omits `size`, and it renders a `Button` in the other
    // branch of the same function — so this default and `Button`'s "defaults
    // to md" above are one claim in two files.
    //
    // The default `variant` rides along. No caller omits it today, which is
    // the reason to pin it rather than a reason not to: `Button`'s equivalent
    // is pinned by "does not fill by default", and an unpinned `primary` here
    // would spend §2.2's one accent fill on the first caller that leaves the
    // prop off.
    it("emits the md secondary recipe when called with no arguments", () => {
      expect(buttonClass()).toBe(linkRecipe("secondary", "md"));
    });

    /**
     * The other emitter's half of the same claim.
     *
     * `Button`'s default `size` is pinned by "defaults to md" above. Its
     * default `variant` was pinned only by "does not fill by default",
     * which asserts `bg-accent` is *absent* — a negative three of the five
     * variants satisfy. Measured: changing the destructured default to
     * `ghost` passed 429 files / 5,968 tests and `tsc --noEmit`, against
     * DESIGN.md §6's "`variant` defaults to `secondary` — a `primary`
     * default would spend the page's one accent fill (§2.2)". So the
     * register pinned one emitter's default fill and not the other's,
     * which is the divergence this describe block exists to close, on the
     * axis it had not closed.
     *
     * The fill is named rather than negated, and written out rather than
     * read back from `VARIANT_CLASS` — same rule as `FLOOR` and
     * `LINK_VARIANT` above. `bg-sand` with `rounded-2xl` is `secondary`
     * alone: `circle` shares the hover but is `bg-warm-light` and
     * `rounded-full`, and the other three carry no `bg-sand` at all.
     */
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
      // `toContain` is satisfied by a class list that has grown as well as
      // by the right one, so the two fills it must not also carry are named.
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

    // Gated, on both. An ungated `min-h-11` would raise the box on a mouse
    // too, which is the half of §Row Actions that says 32px on `fine` — and
    // it would still satisfy a substring search for the floor's name.
    //
    // Named for what it holds and no more. This is a check on two spellings,
    // not on a height: padding raises the same box and slips it entirely
    // (measured — appending `py-6` to the floor takes the fine box from 36px
    // to 68px with every case in this file green), and so do `md:min-h-14`
    // and `size-11`. There is no bounded list of ways CSS can give a box a
    // height (`.claude/rules/review-workflow.md`, "What a test here cannot
    // hold"). The fine-pointer *geometry* is measured in
    // `e2e-layout/button-touch-floor.spec.ts`.
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
