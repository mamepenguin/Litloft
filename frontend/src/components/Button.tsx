"use client";

import type { ButtonHTMLAttributes, Ref, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "circle";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Hover is `enabled:hover:`, never bare `hover:`: a bare `hover:` repaints a
 * *disabled* button the moment the pointer rests on it.
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
 * label that wraps; one sized by `h-*` clips it.
 */
const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
};

/**
 * **`min-h`, not `h`.** A floor raises a short box and leaves a tall one
 * alone, so a Japanese label that wraps still grows the button instead of
 * being clipped.
 *
 * **Not for `iconOnly`.** That shape reaches the same floor through
 * `COARSE_HIT_AREA`'s overhang instead; a `min-h` as well would grow the box
 * and falsify the arithmetic `ICON_BOX_CLASS` is fixed for.
 */
const TOUCH_FLOOR_CLASS = "pointer-coarse:min-h-11";

/**
 * Icon-only buttons are a fixed 32px square, not padding around whatever glyph
 * was passed: the hit-area arithmetic below depends on the rendered box being
 * 32px, and padding cannot deliver that.
 */
const ICON_BOX_CLASS = "h-8 w-8";

/** Not `disabled:opacity-*`: a translucent control still says what it said, only dimmer. */
const DISABLED_CLASS =
  "disabled:bg-sand disabled:text-warm-silver disabled:cursor-not-allowed";

/**
 * `-inset-1.5` is 6px on each edge: 32 + 12 = 44, which holds because
 * `ICON_BOX_CLASS` fixes the box at 32px.
 *
 * The caller owns the row's `pointer-coarse:min-h-11`: at a shorter pitch,
 * adjacent pseudo-elements overlap and the later one wins the hit test, so
 * repeating `iconOnly` buttons down a list without the row floor leaves every
 * control with less than it appears to have.
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
  ref?: Ref<HTMLButtonElement>;
}

interface LabelledButtonProps extends CommonProps {
  iconOnly?: false;
  children: ReactNode;
}

/**
 * Repeated icon-only controls need an *entity-specific* `aria-label`
 * ("Delete Q1 notes", not "Delete"). A type cannot check that.
 */
interface IconButtonProps extends Omit<CommonProps, "size"> {
  iconOnly: true;
  size?: never;
  "aria-label": string;
  children: ReactNode;
}

export type ButtonProps = LabelledButtonProps | IconButtonProps;

/**
 * The recipe, without the `<button>`, for a destination rather than an action:
 * a call to action that navigates has to be an `<a>`. A control that *does*
 * something is a `Button`.
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
    // CSS `:enabled` never matches an `<a>`, so `enabled:hover:` would leave a
    // link with no hover state at all.
    VARIANT_CLASS[variant].replaceAll("enabled:hover:", "hover:"),
    SIZE_CLASS[size],
    TOUCH_FLOOR_CLASS,
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
    iconOnly ? COARSE_HIT_AREA : TOUCH_FLOOR_CLASS,
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
