/**
 * Declare one test per member of a population, and hand back the ids of
 * the tests that were declared.
 *
 * ## The hole this closes, and the three attempts before it
 *
 * A suite that loops over a table and asserts `table.length` has checked
 * nothing about its tests: the assertion reads the literal, not the loop.
 * Walking the loop back — `slice`, `break`, `continue` — leaves the length
 * green and silently drops cases. Every round of review in this
 * repository has found another spelling of it; counting them here would
 * be one more number that goes stale without going red.
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
 * The third repair brought the registration in here, as a `.map` whose
 * body ended in `return id`. That is the same seam a third time, moved
 * from the caller into this file: an early `return id` in front of
 * `register` hands every caller a *complete* register having declared
 * nothing. Measured at `ca4dd8e1`: `if (title.includes("px (")) return
 * id;` dropped all 72 browser cases, `pnpm test:e2e:layout` went 140 → 68
 * and exited 0, with `every group ran at every case` green.
 *
 * So the ids are no longer produced by the shape that iterates. The body
 * below is a loop that calls `register` and *then* records the id, which
 * is the one order in which a skip cannot leave the two disagreeing:
 * whatever is not registered contributes no id, the returned register is
 * short, and a caller comparing it against a list rebuilt from its own
 * declarations goes red. The same mutation against this shape fails that
 * caller's guard instead of passing, and no figure for it is written
 * here — a count in a comment goes stale without going red, which is the
 * shape this whole helper exists to remove.
 *
 * ## What it still does not close
 *
 * Named, because a helper that oversells itself is the defect it exists
 * to prevent.
 *
 * - **A caller that passes a filtering `register`** instead of the
 *   runner's own `test` / `it`. That is not a loop being walked back; it
 *   is a wrapper written on purpose, and it is visible at the call site.
 * - **A caller that checks the returned register against itself.** The
 *   ids carry the skip only as far as the expected side is built
 *   independently of them — a hand-written list, or a cross product of
 *   declared tables that are themselves pinned. `expect(ids).toEqual(
 *   population.map(String))` moves with the population and says nothing
 *   about a population the caller shrank.
 * - **A population walked back in *distinctness* rather than length** —
 *   four entries with the same value keep every count and every id.
 *   `expectDistinct` is for that, and it has to be used with the numbers
 *   written out at the call site.
 * - **A case deleted outside the helper**, and a whole `describe` skipped
 *   with `.skip` — the runner registers those and then declines to run
 *   them, so nothing here is short.
 * - **Anything about the runner's own registry.** No test file can read
 *   it; the true count lives in `--list` and in the CI job's output. Note
 *   that Playwright takes a case's location from the call site of
 *   `test()`, so every case declared through this helper is listed as
 *   `declareEach.ts` at the line below rather than as the spec that
 *   supplied it. The group and the case are still in the title.
 */
export function declareEach<T, Body>(
  items: readonly T[],
  register: (title: string, body: Body) => void,
  spec: (item: T) => { title: string; id: string; body: Body },
): string[] {
  const ids: string[] = [];
  for (const item of items) {
    const { title, id, body } = spec(item);
    register(title, body);
    // After the registration, never before it: an id recorded first is
    // an id for a test that a skip on the next line would not declare.
    ids.push(id);
  }
  return ids;
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
