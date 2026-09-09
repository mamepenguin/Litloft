/**
 * The helper every enumerating suite in this tree registers through.
 *
 * `declareEach` is the one place a case can be dropped without a register
 * noticing — it is the code between "the population" and "the runner" —
 * so it is held here directly, with a fake `register` standing in for
 * `test` / `it`. Measured before this file existed: a single `if (…)
 * return;` inside the map dropped 18 of 73 browser cases with every
 * register green.
 *
 * These are decisions about calls, not about anything rendered, so jsdom
 * laying nothing out is irrelevant here.
 */
import { describe, it, expect } from "vitest";

import { declareEach, expectDistinct } from "../declareEach";

type Body = () => string;

function fakeRunner() {
  const calls: Array<{ title: string; body: Body }> = [];
  return {
    calls,
    register: (title: string, body: Body) => calls.push({ title, body }),
  };
}

const ITEMS = ["a", "b", "c"] as const;

describe("declareEach", () => {
  it("registers exactly one test per member, in order", () => {
    const runner = fakeRunner();

    const ids = declareEach(ITEMS, runner.register, (item) => ({
      title: `title for ${item}`,
      id: `id:${item}`,
      body: () => `ran ${item}`,
    }));

    // The count and the order, written out rather than derived from what
    // the runner happened to receive — deriving the expectation from the
    // observation is what cannot catch a deletion.
    expect(runner.calls.map((c) => c.title)).toEqual([
      "title for a",
      "title for b",
      "title for c",
    ]);
    expect(ids).toEqual(["id:a", "id:b", "id:c"]);
  });

  it("returns an id for a member only when it registered that member", () => {
    // The property the two earlier repairs did not have. A member that is
    // skipped must not contribute an id, or the register it feeds says a
    // test exists that does not.
    const runner = fakeRunner();

    const ids = declareEach(ITEMS, runner.register, (item) => ({
      title: item,
      id: item,
      body: () => item,
    }));

    expect(ids).toEqual(runner.calls.map((c) => c.title));
    expect(ids).toHaveLength(ITEMS.length);
  });

  it("hands the runner the body the spec built, not a stand-in", () => {
    // A helper that registered the right number of empty tests would
    // satisfy everything above and assert nothing anywhere.
    const runner = fakeRunner();

    declareEach(ITEMS, runner.register, (item) => ({
      title: item,
      id: item,
      body: () => `ran ${item}`,
    }));

    expect(runner.calls.map((c) => c.body())).toEqual(["ran a", "ran b", "ran c"]);
  });

  it("registers every member of a population wide enough to contain the callers' own values", () => {
    // The one skip point `declareEach` still has is its own body, and a
    // condition there can be keyed on the data rather than on the index:
    // `if (title.includes("745")) return id;` dropped 18 browser cases
    // while the three cases above — whose fixtures are "a", "b", "c" —
    // stayed green. Measured.
    //
    // So the population here is every integer a viewport height could be
    // and every snap point to two decimals, which is where the callers'
    // literals live: 667 / 745 / 812 / 915, and 0.5 / 0.7 / 0.9. A skip
    // keyed on any of them fails here.
    //
    // It is not a proof of totality. A condition keyed on a value outside
    // this range, or on something other than the title, still survives —
    // and nothing in a test file can read the runner's registry to close
    // that. `--list` and the CI job are where the true count is.
    const heights = Array.from({ length: 1024 }, (_, i) => i);
    const snaps = Array.from({ length: 101 }, (_, i) => i / 100);
    const items = [...heights, ...snaps];

    const runner = fakeRunner();
    const ids = declareEach(items, runner.register, (value) => ({
      title: String(value),
      id: String(value),
      body: () => String(value),
    }));

    expect(runner.calls).toHaveLength(items.length);
    expect(ids).toEqual(items.map(String));
    // And the callers' own literals are in there, so the sentence above
    // is a claim about this population rather than about a range someone
    // has to check by hand.
    for (const literal of ["667", "745", "812", "915", "0.5", "0.7", "0.9"]) {
      expect(ids).toContain(literal);
    }
  });

  it("registers nothing for an empty population", () => {
    const runner = fakeRunner();
    expect(declareEach([], runner.register, () => ({
      title: "x",
      id: "x",
      body: () => "x",
    }))).toEqual([]);
    expect(runner.calls).toEqual([]);
  });
});

describe("expectDistinct", () => {
  it("separates a shrunk population from a repeated one", () => {
    expect(expectDistinct(["a", "b", "c"])).toEqual({ unique: 3, total: 3 });
    // The shape the counts cannot see: same length, one value twice.
    expect(expectDistinct(["a", "a", "c"])).toEqual({ unique: 2, total: 3 });
    expect(expectDistinct([667, 667])).toEqual({ unique: 1, total: 2 });
  });
});
