import { describe, it, expect } from "vitest";

import { TYPE_OPTION_KEYS } from "@/components/folder/filterOptions";
import { VALID_TYPES } from "@/app/drive/[name]/search/page";

describe("the search page's kind vocabulary", () => {
  it("is exactly what the toolbar offers", () => {
    // `null` is the toolbar's "All" row, which is the absence of a
    // filter rather than a kind, and never appears in a URL.
    const offered = TYPE_OPTION_KEYS.map((o) => o.value).filter((v) => v !== null);

    expect([...VALID_TYPES].sort()).toEqual([...offered].sort());
  });

  it("keeps the order the toolbar shows them in", () => {
    const offered = TYPE_OPTION_KEYS.map((o) => o.value).filter((v) => v !== null);
    expect(VALID_TYPES).toEqual(offered);
  });
});

describe("the option tables are read-only to their readers", () => {
  it("refuses a write", () => {
    const writeAttempt = () => {
      // @ts-expect-error the table is ReadonlyArray; if it loosens to `Array`,
      // `tsc` fails on the unused directive, which is the assertion.
      TYPE_OPTION_KEYS.push({ value: null, labelKey: "type.all" });
    };
    // Never called: a runtime push would really mutate the shared table and
    // leave the other tests in this file reading a corrupted one.
    expect(typeof writeAttempt).toBe("function");
  });
});
