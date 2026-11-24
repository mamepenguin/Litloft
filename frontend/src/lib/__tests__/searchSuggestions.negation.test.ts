/**
 * SPEC-CORE-172 I15 and I19: negated and `has:` value suggestions leave out a
 * value the query already holds in either polarity.
 */

import { describe, expect, it } from "vitest";

import { activeOperatorValue, suggestValues } from "../searchQuery";

const tags = [
  { name: "Trip", count: 3 },
  { name: "Travel", count: 1 },
];

function values(query: string, offered = tags): string[] {
  const active = activeOperatorValue(query);

  expect(active).not.toBeNull();
  return suggestValues(active!, offered, []).map((suggestion) => suggestion.value);
}

describe("SPEC-CORE-172 I15 a tag held in either polarity is not suggested", () => {
  it.each(["tag:trip -tag:", "-tag:trip tag:"])("%s leaves out Trip", (query) => {
    expect(values(query)).toEqual(["Travel"]);
  });

  it("a negated operator offers the same values as its positive form", () => {
    expect(values("tag:", tags)).toEqual(["Trip", "Travel"]);
    expect(values("-tag:", tags)).toEqual(["Trip", "Travel"]);
  });
});

describe("SPEC-CORE-172 I19 has: offers only tag and collection", () => {
  it.each(["has:", "-has:", "has:c"])("%s", (query) => {
    expect([...values(query)].sort()).toEqual(
      query === "has:c" ? ["collection"] : ["collection", "tag"],
    );
  });

  it.each(["has:tag has:", "has:tag -has:", "-has:tag -has:"])(
    "%s leaves out tag",
    (query) => {
      expect(values(query)).toEqual(["collection"]);
    },
  );

  it.each(["has:collection -has:", "-has:collection has:"])(
    "%s leaves out collection",
    (query) => {
      expect(values(query)).toEqual(["tag"]);
    },
  );
});
