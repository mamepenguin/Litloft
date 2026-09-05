/**
 * Everything that puts a pressable thing on screen.
 *
 * Not `button` alone. An anchor styled as a control, a `[role=button]`, a
 * `<summary>` — all of them are something a reader presses, and a scan that
 * only knows `<button>` reports a clean toolbar while one of them sits on it
 * unnamed or under the touch floor. Both have now happened here: an `<a>`
 * with an icon and no text was added to the folder toolbar and every test
 * passed, and the folder toolbar's own tag-scope link was 38px tall on a
 * coarse pointer underneath a test titled "gives every control on it the
 * touch floor".
 *
 * Shared between the scans rather than restated in each. It was restated
 * once — `toolbarLabels.test.ts` had this list and `toolbarBarScope.test.ts`
 * had `querySelectorAll("button")` — and the narrower copy is what missed the
 * anchor.
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
  // `^=`, not `=`: the toolbar's own menu rows are `menuitemradio`, and an
  // exact attribute match let seven of eight shapes through — including the
  // one role the code had just started using, while listing the one it had
  // stopped using.
  "[role^=menuitem]",
].join(", ");

/**
 * The pressable things inside `root`, in document order.
 *
 * A file input is a mechanism, never the control: `AddButton` keeps two of
 * them hidden and clicks them from a menu row. The row is what a reader
 * presses and the row is what these scans are about. Widening the selector
 * to `input` surfaced them, which is the scan working — they are excluded
 * here by what they are rather than left to widen each caller's expected
 * list.
 *
 * The predicate this really wants is "rendered and visible", which jsdom
 * cannot answer. A styled, *visible* file input used as the control itself
 * would slip past; nothing in the tree does that today.
 */
export function pressables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(PRESSABLE)].filter(
    (el) => !(el instanceof HTMLInputElement && el.type === "file"),
  );
}
