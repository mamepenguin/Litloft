"use client";

import type { ButtonHTMLAttributes, Ref, ReactNode } from "react";

/**
 * The five variants DESIGN.md §6 "Buttons" already names. This component
 * does not introduce a sixth — it moves the recipes out of 43 hand-written
 * class lists so the disabled treatment can only be written once.
 */
export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "circle";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Hover is `enabled:hover:`, never bare `hover:`.
 *
 * A bare `hover:` repaints a *disabled* button the moment the pointer rests on
 * it, which is the same defect DESIGN.md §6 calls out for
 * `disabled:hover:bg-accent` — the control that will not respond is the one
 * lighting up under the cursor. Writing the guard into the variant makes it
 * impossible for a call site to forget.
 */
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white enabled:hover:bg-accent-hover rounded-2xl",
  secondary: "bg-sand text-text-primary enabled:hover:bg-sand-hover rounded-2xl",
  danger: "text-danger enabled:hover:bg-danger/10 rounded-2xl",
  ghost: "text-text-primary enabled:hover:bg-bg-elevated rounded-2xl",
  circle: "bg-warm-light text-text-primary enabled:hover:bg-sand-hover rounded-full",
};

/**
 * Padding, not height. A button sized by its padding grows with a Japanese
 * label that wraps; one sized by `h-*` clips it (DESIGN.md §6 Primary:
 * "ensure Japanese labels have enough room").
 *
 * The three values are the ones the tree already used, counted before they
 * were named: `md` on nine call sites, `sm` on four, `lg` on four. Exact on
 * padding; on type size, three of the four `lg` sites used `text-sm` and one
 * used `text-base`, which this rounds down. An earlier draft of this file
 * invented `sm` as `px-3 py-1.5 text-xs`, which matched nothing — a scale
 * written without measuring the thing it was meant to replace, which is how
 * five sizes came to exist in the first place.
 */
const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
};

/**
 * Icon-only buttons are a fixed 32px square, not padding around whatever glyph
 * was passed.
 *
 * The hit-area arithmetic below depends on the rendered box being 32px, and
 * padding cannot deliver that: `p-2` around a 16px icon is 32px, but the same
 * class around DESIGN.md's own `<Trash2 size={18} />` example is 34px, around
 * lucide's default 24px it is 40px, and `p-1.5` is 28px whatever it wraps —
 * below the floor before the overhang is even added. Fixing the box makes
 * "the icon stays 32px at every pointer type" true of the button rather than
 * true of one call site that happened to pass the right glyph.
 */
const ICON_BOX_CLASS = "h-8 w-8";

/**
 * The disabled treatment, written once.
 *
 * DESIGN.md §6 "Disabled (every variant)" forbids `disabled:opacity-*`: a
 * translucent control still says what it said, only dimmer, and the contrast
 * loss lands hardest on the label that would have explained why it is off.
 * The whole point of this component is that a caller cannot opt out — it
 * passes `disabled` and gets this.
 */
const DISABLED_CLASS =
  "disabled:bg-sand disabled:text-warm-silver disabled:cursor-not-allowed";

/**
 * Grow the hit area, not the box (DESIGN.md §Row Actions).
 *
 * `pointer-coarse` only: the 44px floor is stated under the mobile sizing
 * rules, so it governs touch input. On a fine pointer the rendered 32px
 * already clears the 24px minimum for repeated icon-only controls
 * (hako `Prwd_iaXmCjWfY24KjFz2`), and the overhang would only overlap
 * neighbours in a dense row.
 *
 * `-inset-1.5` is 6px on each edge: 32 + 12 = 44, which holds because
 * `ICON_BOX_CLASS` fixes the box at 32px.
 *
 * **This is half of the §Row Actions recipe, and the caller owns the other
 * half.** That section reaches the floor *on the row* (`pointer-coarse:min-h-11`)
 * and then grows the control's hit area inside it, and it says why the order
 * matters: at a shorter pitch, adjacent pseudo-elements overlap and the later
 * one wins the hit test, so every control silently keeps less than it appears
 * to have. A single button in a header is fine. Repeating `iconOnly` buttons
 * down a list without giving the row the floor reproduces exactly the defect
 * the recipe was written to prevent.
 */
const COARSE_HIT_AREA =
  "relative pointer-coarse:before:absolute pointer-coarse:before:-inset-1.5 pointer-coarse:before:content-['']";

const BASE_CLASS =
  "inline-flex items-center justify-center gap-1.5 font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "children"
>;

interface CommonProps extends NativeButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Extra utilities for layout only — width, margin, flex. Not colour. */
  className?: string;
  /**
   * Forwarded to the `<button>`. React 19 passes `ref` as an ordinary
   * prop to a function component, so no `forwardRef` is needed — but
   * `ButtonHTMLAttributes` does not declare it, and without this line a
   * caller that needs the element (to return focus to it after closing a
   * menu, say) cannot reach it through this component and would write
   * the recipe out by hand instead.
   */
  ref?: Ref<HTMLButtonElement>;
}

/**
 * A button with a visible label. `children` is the label, so no `aria-label`
 * is required: adding one would replace the text a sighted user reads with a
 * string only some users hear.
 */
interface LabelledButtonProps extends CommonProps {
  iconOnly?: false;
  children: ReactNode;
}

/**
 * A button whose whole content is an icon. `aria-label` is **required by the
 * type**, because a `<button>` holding one `<svg>` has no accessible name at
 * all and nothing at runtime says so.
 *
 * hako `Prwd_iaXmCjWfY24KjFz2` asks for more than a name here — repeated
 * icon-only controls need an *entity-specific* one ("Delete Q1 notes", not
 * "Delete"). A type cannot check that; the review of each call site does.
 */
interface IconButtonProps extends Omit<CommonProps, "size"> {
  iconOnly: true;
  /**
   * Not accepted. The box is a fixed 32px so the hit-area arithmetic holds,
   * which would make `size` a prop that silently does nothing — and a prop
   * that reads as configuration while changing no output is worse than no
   * prop, because the call site looks like it decided something.
   */
  size?: never;
  "aria-label": string;
  children: ReactNode;
}

export type ButtonProps = LabelledButtonProps | IconButtonProps;

/**
 * The recipe, without the `<button>`.
 *
 * For the one case that is a destination rather than an action: a call to
 * action that navigates has to be an `<a>`, or it loses the things a link
 * is — a middle click, a copied address, the browser's own "open in new
 * tab". `EmptyState` is that case. Nothing else should reach for this;
 * a control that does something is a `Button`.
 */
export function buttonClass({
  variant = "secondary",
  size = "md",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return [
    BASE_CLASS,
    // `enabled:hover:` is button-only, and this is not a button.
    //
    // CSS `:enabled` matches `button`, `input`, `select`, `textarea`,
    // `optgroup`, `option` and `fieldset` — never an `<a>`. Wearing the
    // recipe unaltered gave the three link call-to-actions no hover state
    // at all, beside `Button`s that light up: identical to the eye, dead
    // under the pointer. The `disabled:` half is likewise unreachable
    // markup on an anchor, so it is dropped rather than carried.
    //
    // §6's guard was written against a *disabled button* repainting under
    // the cursor. The condition it guards cannot arise here.
    VARIANT_CLASS[variant].replaceAll("enabled:hover:", "hover:"),
    SIZE_CLASS[size],
    // A link is a row action too. `Button` gives its icon-only shape an
    // overhang and its labelled shape the padding; an anchor gets neither
    // unless it is asked, and these sit where a finger goes.
    "pointer-coarse:min-h-11",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button(props: ButtonProps) {
  const {
    variant = "secondary",
    size = "md",
    className = "",
    iconOnly = false,
    children,
    type = "button",
    ...rest
  } = props as CommonProps & { iconOnly?: boolean; children: ReactNode };

  const classes = [
    BASE_CLASS,
    VARIANT_CLASS[variant],
    iconOnly ? ICON_BOX_CLASS : SIZE_CLASS[size],
    iconOnly ? COARSE_HIT_AREA : "",
    DISABLED_CLASS,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button {...rest} type={type} className={classes}>
      {children}
    </button>
  );
}

export default Button;
