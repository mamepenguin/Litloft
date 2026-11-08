import { describe, it, expect, beforeEach } from "vitest";

import { readShownTargets, writeShownTargets } from "../appPrefs";

const DRIVE = "main";

beforeEach(() => {
  localStorage.clear();
});

describe("SPEC-CORE-063 the shown target set", () => {
  it("reads a drive that has never saved one as unset", () => {
    expect(readShownTargets(DRIVE)).toBeNull();
  });

  it("round-trips a saved set under the app's own key", () => {
    writeShownTargets(DRIVE, ["sf-a", "sf-b"]);

    expect(readShownTargets(DRIVE)).toEqual(["sf-a", "sf-b"]);
    expect(localStorage.getItem("litloft.videoApp.targets.main")).toBe('["sf-a","sf-b"]');
  });

  it("keeps an empty set apart from never saved", () => {
    writeShownTargets(DRIVE, []);

    expect(readShownTargets(DRIVE)).toEqual([]);
  });

  it("keeps each app and each drive apart", () => {
    writeShownTargets(DRIVE, ["video-only"]);
    writeShownTargets(DRIVE, ["reading-only"], "reading");
    writeShownTargets("other", ["other-drive"]);

    expect(readShownTargets(DRIVE)).toEqual(["video-only"]);
    expect(readShownTargets(DRIVE, "reading")).toEqual(["reading-only"]);
    expect(readShownTargets("other")).toEqual(["other-drive"]);
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["an object", '{"a":1}'],
    ["a string", '"sf-a"'],
    ["an array with a non-string", '["sf-a",1]'],
  ])("reads %s as never saved", (_label, raw) => {
    localStorage.setItem("litloft.videoApp.targets.main", raw);

    expect(readShownTargets(DRIVE)).toBeNull();
  });

  it("reads a storage failure as never saved", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    try {
      expect(readShownTargets(DRIVE)).toBeNull();
    } finally {
      Storage.prototype.getItem = original;
    }
  });

  it("swallows a write failure", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    try {
      expect(() => writeShownTargets(DRIVE, ["sf-a"])).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }

    expect(localStorage.getItem("litloft.videoApp.targets.main")).toBeNull();
  });
});
