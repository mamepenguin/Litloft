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

/**
 * Clears what one viewer set, and nothing a viewer mounted after it has set
 * since: the probe only when it is still this viewer's, and the active flag
 * only when this viewer had it.
 */
export function releaseOfficeGrid(probe: () => boolean, wasActive: boolean): void {
  if (focusProbe === probe) focusProbe = null;
  if (wasActive) active = false;
}

/** Whether ← / → belong to the Excel grid rather than to file navigation. */
export function officeGridOwnsArrows(): boolean {
  return active && (focusProbe ? focusProbe() : true);
}
