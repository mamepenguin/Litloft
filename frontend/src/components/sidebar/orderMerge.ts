/**
 * Pure ordering helpers shared by the sidebar reorder hooks.
 *
 * Both section order (global key) and item order (drive-scoped key) persist
 * only a list of stable IDs. At render time the saved list is reconciled with
 * the IDs that actually exist via {@link mergeOrder} (layered fallback): a
 * deleted ID disappears, a brand-new ID lands at its default position. This is
 * what makes the feature forward-compatible (a new addon section, a freshly
 * created pin, a removed collection all "just work").
 */

/**
 * Reconcile a saved order with the IDs that currently exist.
 *
 * - Saved IDs that still exist are kept in their saved order.
 * - IDs not present in the saved order (new ones) are inserted at their
 *   *default position*: immediately after their nearest preceding neighbour
 *   from `currentIds` that is already placed (front if none). `currentIds`
 *   must be supplied in the default order (hardcoded section order / server
 *   item order).
 * - Saved IDs that no longer exist are dropped.
 *
 * The result is always a permutation of `currentIds`.
 */
export function mergeOrder(saved: readonly string[], currentIds: readonly string[]): string[] {
  const currentSet = new Set(currentIds);
  const result = saved.filter((id) => currentSet.has(id));
  const placed = new Set(result);

  currentIds.forEach((id, idx) => {
    if (placed.has(id)) return;

    let anchor = -1;
    for (let i = idx - 1; i >= 0; i--) {
      const pos = result.indexOf(currentIds[i]);
      if (pos !== -1) {
        anchor = pos;
        break;
      }
    }
    result.splice(anchor + 1, 0, id);
    placed.add(id);
  });

  return result;
}

/**
 * Immutably move `fromId` so it sits directly before or after `toId`.
 * Returns a new array; the input is never mutated. Unknown IDs or a no-op
 * move return a shallow copy unchanged.
 */
export function reorder(
  ids: readonly string[],
  fromId: string,
  toId: string,
  position: "before" | "after",
): string[] {
  if (fromId === toId) return [...ids];

  const fromIndex = ids.indexOf(fromId);
  const toIndex = ids.indexOf(toId);
  if (fromIndex === -1 || toIndex === -1) return [...ids];

  const next = ids.filter((id) => id !== fromId);
  const target = next.indexOf(toId);
  const insertAt = position === "before" ? target : target + 1;
  next.splice(insertAt, 0, fromId);
  return next;
}
