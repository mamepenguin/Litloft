/**
 * Not `button` alone: an anchor styled as a control, a `[role=button]`, a
 * `<summary>` — all of them are something a reader presses.
 */
export const PRESSABLE = [
  "button",
  "a",
  "input",
  "label",
  "summary",
  "[tabindex]",
  "[role=button]",
  "[role=link]",
  "[role=switch]",
  "[role=tab]",
  "[role=checkbox]",
  "[role=option]",
  // `^=`, not `=`: the toolbar's own menu rows are `menuitemradio`.
  "[role^=menuitem]",
].join(", ");

/**
 * A file input is a mechanism, never the control: `AddButton` keeps two of
 * them hidden and clicks them from a menu row. A styled, *visible* file
 * input used as the control itself would slip past.
 */
export function pressables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(PRESSABLE)].filter(
    (el) => !(el instanceof HTMLInputElement && el.type === "file"),
  );
}
