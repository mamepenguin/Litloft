/**
 * Declare one test per member of a population, and hand back the ids of
 * the tests that were declared.
 *
 * ## The hole this closes, and the two attempts before it
 *
 * A suite that loops over a table and asserts `table.length` has checked
 * nothing about its tests: the assertion reads the literal, not the loop.
 * Walking the loop back — `slice`, `break`, `continue` — leaves the length
 * green and silently drops cases. Five rounds of review in this
 * repository have found five spellings of that.
 *
 * The first repair recorded each id one line *above* its registration.
 * The seam between the two statements was the next hole: a `continue`
 * placed between them shortened neither, and 18 browser cases vanished
 * with the register full and green (measured: 73 tests became 55).
 *
 * The second repair moved that pair inside a helper and had the caller
 * pass a `declare` callback. The seam moved with it — `(item) => { if (x)
 * return; test(…); }` returned an id without registering anything, and
 * the same 73 became 55 again.
 *
 * So the caller no longer registers. `spec(item)` builds a title, an id
 * and a body; **this function calls `register` itself, unconditionally,
 * for every item**, and the id it returns is the id of the test it just
 * declared. There is no per-item callback with a registration inside it
 * to put a condition in front of, and the one remaining skip point — this
 * body — is what `declareEach.test.ts` exists to hold: it passes a fake
 * `register` and fails if the count, the order or the bodies drift.
 *
 * ## What it still does not close
 *
 * Named, because a helper that oversells itself is the defect it exists
 * to prevent.
 *
 * - **A caller that passes a filtering `register`** instead of the
 *   runner's own `test` / `it`. That is not a loop being walked back; it
 *   is a wrapper written on purpose, and it is visible at the call site.
 * - **A condition in this body keyed on a value outside the population
 *   `declareEach.test.ts` drives.** That test walks every integer up to
 *   1023 and every snap point to two decimals, so a skip keyed on any
 *   viewport height or snap the callers use is caught; one keyed on
 *   something else is not. Measured, before that population was widened:
 *   `if (title.includes("745")) return id;` dropped 18 browser cases with
 *   the helper's own three-item fixture green.
 * - **A population walked back in *distinctness* rather than length** —
 *   four entries with the same value keep every count and every id.
 *   `expectDistinct` is for that, and it has to be used.
 * - **A case deleted outside the helper.** Compare the returned register
 *   against a list rebuilt from the declarations, never against itself.
 * - **Anything about the runner's own registry.** No test file can read
 *   it; the true count lives in `--list` and in the CI job's output.
 */
export function declareEach<T, Body>(
  items: readonly T[],
  register: (title: string, body: Body) => void,
  spec: (item: T) => { title: string; id: string; body: Body },
): string[] {
  return items.map((item) => {
    const { title, id, body } = spec(item);
    register(title, body);
    return id;
  });
}

/**
 * The population's members are distinct.
 *
 * A table of four rows that are all the same row satisfies every count
 * and every register here, and measures one case four times. Returned as
 * a pair rather than asserted inside, so the caller writes the expected
 * numbers out and a shrink has to disagree with them.
 */
export function expectDistinct(
  values: readonly (string | number)[],
): { unique: number; total: number } {
  return { unique: new Set(values).size, total: values.length };
}
