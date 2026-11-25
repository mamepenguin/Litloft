/**
 * A pointer press leaves focus on the control it pressed, and the first key
 * press after it turns that focus into :focus-visible, which holds the
 * control bar on screen. Controls drop focus after a pointer press; one
 * reached from the keyboard keeps it.
 */
export function releasePointerFocus(el: HTMLElement): void {
  if (document.activeElement === el) el.blur();
}
