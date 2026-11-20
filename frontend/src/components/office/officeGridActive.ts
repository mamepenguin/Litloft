let active = false;
let focusProbe: (() => boolean) | null = null;

/** Set by the Excel adapter while a click inside the grid owns the keys. */
export function setOfficeGridActive(next: boolean): void {
  active = next;
}

/**
 * The library keeps its own `focusing` flag, which a click anywhere sets from
 * whether the target was in the grid. Reading it is what tells an outside
 * click on a non-focusable element apart from one inside.
 */
export function setOfficeGridFocusProbe(probe: (() => boolean) | null): void {
  focusProbe = probe;
}

/** Whether ← / → belong to the Excel grid rather than to file navigation. */
export function officeGridOwnsArrows(): boolean {
  return active && (focusProbe ? focusProbe() : true);
}
