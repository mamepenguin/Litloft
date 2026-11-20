/** SPEC-CORE-057 I10, SPEC-CORE-145: face and target per drive; the view per Target. */

import { describe, it, expect, beforeEach } from "vitest";

import {
  readAppPrefs,
  readLegacyGroup,
  readTargetView,
  writeAppPrefs,
  writeTargetView,
} from "../appPrefs";

const DEFAULTS = { face: "discover", target: "default" };

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

    writeAppPrefs("main", { target: "sf-1" });
    expect(readAppPrefs("main")).toEqual({ face: "library", target: "sf-1" });
  });

  it("SPEC-CORE-057 keeps each drive's values apart", () => {
    writeAppPrefs("a", { face: "library", target: "sf-1" });

    expect(readAppPrefs("b")).toEqual(DEFAULTS);
    expect(readAppPrefs("a").target).toBe("sf-1");
  });

  it("SPEC-CORE-057 does not confuse drives whose names overlap", () => {
    writeAppPrefs("a", { face: "library" });
    writeAppPrefs("a b", { target: "sf-2" });

    expect(readAppPrefs("a")).toEqual({ ...DEFAULTS, face: "library" });
    expect(readAppPrefs("a b")).toEqual({ ...DEFAULTS, target: "sf-2" });
  });

  it("SPEC-CORE-057 reads an unknown face as its default", () => {
    writeAppPrefs("main", { face: "grid" } as never);

    expect(readAppPrefs("main").face).toBe(DEFAULTS.face);
  });

  it.each(["discover", "library"] as const)("SPEC-CORE-057 round-trips face %s", (face) => {
    writeAppPrefs("main", { face });
    expect(readAppPrefs("main").face).toBe(face);
  });

  it("SPEC-CORE-145 no longer reads or writes a per-drive classification", () => {
    writeAppPrefs("main", { classification: "month" } as never);

    expect(localStorage.getItem("litloft.videoApp.classification.main")).toBeNull();
    expect("classification" in readAppPrefs("main")).toBe(false);
  });

  it("SPEC-CORE-145 reads the old per-drive grouping without writing it", () => {
    localStorage.setItem("litloft.videoApp.classification.main", "tag");
    localStorage.setItem("litloft.readingApp.group.main", "tag");

    expect(readLegacyGroup("main", "video")).toBe("tag");
    expect(readLegacyGroup("main", "reading")).toBe("tag");
    expect(readLegacyGroup("main", { addon: "knowledge" })).toBeNull();

    writeTargetView("video", "main", "default", { group: "month" });
    writeTargetView("reading", "main", "default", { group: "folder" });

    expect(localStorage.getItem("litloft.videoApp.classification.main")).toBe("tag");
    expect(localStorage.getItem("litloft.readingApp.group.main")).toBe("tag");
  });

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

describe("SPEC-CORE-145 the per-Target view store", () => {
  it("reads a Target never written as an empty view", () => {
    expect(readTargetView("video", "main", "default")).toEqual({});
    writeTargetView("video", "main", "sf-1", { group: "tag" });
    expect(readTargetView("video", "main", "sf-1")).toEqual({ group: "tag" });
  });
});
