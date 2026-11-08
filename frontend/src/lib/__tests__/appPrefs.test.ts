/** SPEC-CORE-057 I10: face, classification and target are remembered per drive. */

import { describe, it, expect, beforeEach } from "vitest";

import { readAppPrefs, writeAppPrefs } from "../appPrefs";

const DEFAULTS = { face: "discover", classification: "folder", target: "default" };

beforeEach(() => {
  localStorage.clear();
});

describe("SPEC-CORE-057 I10 app preferences", () => {
  it("SPEC-CORE-057 reads the defaults on first use", () => {
    expect(readAppPrefs("main")).toEqual(DEFAULTS);
  });

  it("SPEC-CORE-057 returns what was written, one value at a time", () => {
    writeAppPrefs("main", { face: "library" });
    expect(readAppPrefs("main")).toEqual({ ...DEFAULTS, face: "library" });

    writeAppPrefs("main", { classification: "month" });
    writeAppPrefs("main", { target: "sf-1" });
    expect(readAppPrefs("main")).toEqual({
      face: "library",
      classification: "month",
      target: "sf-1",
    });
  });

  it("SPEC-CORE-057 keeps each drive's values apart", () => {
    writeAppPrefs("a", { face: "library", target: "sf-1" });

    expect(readAppPrefs("b")).toEqual(DEFAULTS);
    expect(readAppPrefs("a").target).toBe("sf-1");
  });

  it("SPEC-CORE-057 does not confuse drives whose names overlap", () => {
    writeAppPrefs("a", { face: "library" });
    writeAppPrefs("a b", { classification: "tag" });

    expect(readAppPrefs("a")).toEqual({ ...DEFAULTS, face: "library" });
    expect(readAppPrefs("a b")).toEqual({ ...DEFAULTS, classification: "tag" });
  });

  it.each([
    ["face", "grid"],
    ["classification", "artist"],
  ] as const)("SPEC-CORE-057 reads an unknown %s as its default", (field, bad) => {
    writeAppPrefs("main", { [field]: bad } as never);

    expect(readAppPrefs("main")[field]).toBe(DEFAULTS[field]);
  });

  it.each(["discover", "library"] as const)("SPEC-CORE-057 round-trips face %s", (face) => {
    writeAppPrefs("main", { face });
    expect(readAppPrefs("main").face).toBe(face);
  });

  it.each(["folder", "tag", "month", "duration", "watch"] as const)(
    "SPEC-CORE-057 round-trips classification %s",
    (classification) => {
      writeAppPrefs("main", { classification });
      expect(readAppPrefs("main").classification).toBe(classification);
    },
  );

  it("SPEC-CORE-057 falls back to the defaults when storage refuses", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    try {
      expect(readAppPrefs("main")).toEqual(DEFAULTS);
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});

describe("per-app preference keys", () => {
  it("keeps Video's existing storage keys unchanged", () => {
    writeAppPrefs("main", { face: "library", target: "sf-1" });

    expect(localStorage.getItem("litloft.videoApp.face.main")).toBe("library");
    expect(localStorage.getItem("litloft.videoApp.target.main")).toBe("sf-1");
  });

  it("stores Reading under its own namespace", () => {
    writeAppPrefs("main", { face: "library", target: "sf-1" }, "reading");

    expect(localStorage.getItem("litloft.readingApp.face.main")).toBe("library");
    expect(localStorage.getItem("litloft.readingApp.target.main")).toBe("sf-1");
    expect(localStorage.getItem("litloft.videoApp.face.main")).toBeNull();
  });

  it("reads each app's values apart on the same drive", () => {
    writeAppPrefs("main", { face: "library" });
    writeAppPrefs("main", { target: "sf-1" }, "reading");

    expect(readAppPrefs("main")).toEqual({ ...DEFAULTS, face: "library" });
    expect(readAppPrefs("main", "reading")).toEqual({ ...DEFAULTS, target: "sf-1" });
  });

  it("falls back to the Reading defaults for an unknown stored value", () => {
    localStorage.setItem("litloft.readingApp.face.main", "grid");

    expect(readAppPrefs("main", "reading").face).toBe(DEFAULTS.face);
  });
});
