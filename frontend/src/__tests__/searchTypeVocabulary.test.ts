import { describe, it, expect } from "vitest";

import { TYPE_OPTION_KEYS } from "@/components/folder/filterOptions";
import { VALID_TYPES } from "@/app/drive/[name]/search/page";

/**
 * The picker and the URL parser name the same kinds.
 *
 * They are two lists, and only one of them is on screen. `VALID_TYPES`
 * decides whether a shared or reloaded `?type=` survives: a value it
 * does not recognise becomes `null`, and the listing widens back to
 * All. So a list that falls behind the toolbar produces a chip you can
 * select, a URL you can copy, and a page that quietly ignores it on
 * arrival — which reaches the user as "my link didn't work" and
 * nothing else.
 *
 * The two were deliberately out of step for a while: markdown and pdf
 * were withheld from search because the semantic index could not
 * honour them. That is over — the index learned the vocabulary — and
 * this is what keeps them from drifting apart by accident instead.
 */
describe("the search page's kind vocabulary", () => {
  it("is exactly what the toolbar offers", () => {
    // `null` is the toolbar's "All" row, which is the absence of a
    // filter rather than a kind, and never appears in a URL.
    const offered = TYPE_OPTION_KEYS.map((o) => o.value).filter((v) => v !== null);

    expect([...VALID_TYPES].sort()).toEqual([...offered].sort());
  });

  it("keeps the order the toolbar shows them in", () => {
    // Not required for correctness — `parseTypeFilter` is a membership
    // test. Asserted because the two lists are read side by side by
    // anyone adding a kind, and a difference in order is a difference
    // that has to be explained.
    const offered = TYPE_OPTION_KEYS.map((o) => o.value).filter((v) => v !== null);
    expect(VALID_TYPES).toEqual(offered);
  });
});

describe("the option tables are read-only to their readers", () => {
  it("refuses a write", () => {
    // `ReadonlyArray` is the only thing stopping one of three modules from
    // reordering a table the other two read. Changing the declaration to
    // `Array` type-checks silently, so the guarantee is asserted rather
    // than assumed.
    const writeAttempt = () => {
      // @ts-expect-error the table is ReadonlyArray. If the declaration
      // loosens to `Array`, this line stops being an error and `tsc` fails
      // on the unused directive — which is the assertion.
      TYPE_OPTION_KEYS.push({ value: null, labelKey: "type.all" });
    };
    // Never called: a runtime push would really mutate the shared table and
    // leave the other tests in this file reading a corrupted one.
    expect(typeof writeAttempt).toBe("function");
  });
});
