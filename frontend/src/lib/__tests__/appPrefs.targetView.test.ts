/** SPEC-CORE-145: the per-Target view store, one JSON key per app and drive. */

import { describe, it, expect, beforeEach } from "vitest";

import { readTargetView, writeTargetView } from "../appPrefs";

const DRIVE = "main";

function storedKeys(): string[] {
  return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).sort();
}

function snapshot(): Record<string, string | null> {
  return Object.fromEntries(storedKeys().map((k) => [k, localStorage.getItem(k)]));
}

beforeEach(() => {
  localStorage.clear();
});

describe("SPEC-CORE-145 the key of each app's views", () => {
  it.each([
    ["video", "litloft.videoApp.view.main"],
    ["reading", "litloft.readingApp.view.main"],
    [{ addon: "knowledge" }, "litloft.addon.knowledge.view.main"],
    [{ addon: "knowledge-clips" }, "litloft.addon.knowledge-clips.view.main"],
  ] as const)("SPEC-CORE-145 %j keeps every Target's view under %s as one JSON object", (app, key) => {
    writeTargetView(app, DRIVE, "default", { group: "tag" });
    writeTargetView(app, DRIVE, "sf-1", { sort: "title" });
    writeTargetView(app, DRIVE, "collection:7", { group: "none", sort: "oldest" });

    expect(storedKeys()).toEqual([key]);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({
      default: { group: "tag" },
      "sf-1": { sort: "title" },
      "collection:7": { group: "none", sort: "oldest" },
    });
  });

  it("SPEC-CORE-145 encodes the drive into the key", () => {
    writeTargetView("video", "a b/c", "default", { group: "tag" });

    expect(storedKeys()).toEqual(["litloft.videoApp.view.a%20b%2Fc"]);
  });
});

describe("SPEC-CORE-145 readTargetView", () => {
  it("SPEC-CORE-145 reads a Target never written as an empty view", () => {
    expect(readTargetView("video", DRIVE, "default")).toEqual({});
    writeTargetView("video", DRIVE, "sf-1", { group: "tag" });
    expect(readTargetView("video", DRIVE, "default")).toEqual({});
  });

  it("SPEC-CORE-145 returns the stored view of the Target asked", () => {
    localStorage.setItem(
      "litloft.readingApp.view.main",
      JSON.stringify({ default: { group: "folder", sort: "size" }, "sf-1": { group: "month" } }),
    );

    expect(readTargetView("reading", DRIVE, "default")).toEqual({ group: "folder", sort: "size" });
    expect(readTargetView("reading", DRIVE, "sf-1")).toEqual({ group: "month" });
  });

  it.each([
    ["unparsable JSON", "{oops"],
    ["an array", '[{"group":"tag"}]'],
    ["a string", '"tag"'],
    ["null", "null"],
  ])("SPEC-CORE-145 reads %s as an empty view", (_name, raw) => {
    localStorage.setItem("litloft.videoApp.view.main", raw);

    expect(readTargetView("video", DRIVE, "default")).toEqual({});
  });

  it("SPEC-CORE-145 reads an empty view when storage refuses the read", () => {
    writeTargetView("video", DRIVE, "default", { group: "tag" });
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    try {
      expect(readTargetView("video", DRIVE, "default")).toEqual({});
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});

describe("SPEC-CORE-145 writeTargetView", () => {
  it("SPEC-CORE-145 merges one field into the Target's entry", () => {
    writeTargetView("video", DRIVE, "sf-1", { group: "tag" });
    writeTargetView("video", DRIVE, "sf-1", { sort: "size" });

    expect(readTargetView("video", DRIVE, "sf-1")).toEqual({ group: "tag", sort: "size" });

    writeTargetView("video", DRIVE, "sf-1", { group: "month" });

    expect(readTargetView("video", DRIVE, "sf-1")).toEqual({ group: "month", sort: "size" });
  });

  it("SPEC-CORE-145 I1 leaves every other Target, app and drive byte-for-byte unchanged", () => {
    localStorage.setItem(
      "litloft.videoApp.view.main",
      '{"sf-2":{"sort":"oldest","group":"duration"},"default":{"group":"tag"}}',
    );
    localStorage.setItem("litloft.readingApp.view.main", '{"default":{"group":"folder"}}');
    localStorage.setItem("litloft.videoApp.view.other", '{"default":{"group":"month"}}');
    localStorage.setItem("litloft.videoApp.classification.main", "tag");
    const before = snapshot();

    writeTargetView("video", DRIVE, "default", { sort: "size" });

    const after = snapshot();
    const stored = JSON.parse(after["litloft.videoApp.view.main"]!);
    expect(stored.default).toEqual({ group: "tag", sort: "size" });
    expect(JSON.stringify(stored["sf-2"])).toBe('{"sort":"oldest","group":"duration"}');
    for (const key of Object.keys(before).filter((k) => k !== "litloft.videoApp.view.main")) {
      expect(after[key]).toBe(before[key]);
    }
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  });

  it("SPEC-CORE-145 never writes the old per-drive keys", () => {
    writeTargetView("video", DRIVE, "default", { group: "tag" });
    writeTargetView("reading", DRIVE, "default", { group: "tag" });
    writeTargetView({ addon: "knowledge" }, DRIVE, "default", { group: "tag" });

    expect(storedKeys()).toEqual([
      "litloft.addon.knowledge.view.main",
      "litloft.readingApp.view.main",
      "litloft.videoApp.view.main",
    ]);
  });

  it.each([
    ["unparsable JSON", "{oops"],
    ["an array", "[1,2]"],
  ])("SPEC-CORE-145 replaces a key holding %s with an object of the new entry only", (_name, raw) => {
    localStorage.setItem("litloft.videoApp.view.main", raw);

    writeTargetView("video", DRIVE, "sf-1", { group: "tag" });

    expect(JSON.parse(localStorage.getItem("litloft.videoApp.view.main")!)).toEqual({
      "sf-1": { group: "tag" },
    });
  });

  it("SPEC-CORE-145 swallows a write that storage refuses", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
    try {
      expect(() => writeTargetView("video", DRIVE, "default", { group: "tag" })).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }

    expect(readTargetView("video", DRIVE, "default")).toEqual({});
  });

  it("SPEC-CORE-145 keeps drives whose names overlap apart", () => {
    writeTargetView("video", "a", "default", { group: "tag" });
    writeTargetView("video", "a b", "default", { group: "month" });

    expect(readTargetView("video", "a", "default")).toEqual({ group: "tag" });
    expect(readTargetView("video", "a b", "default")).toEqual({ group: "month" });
    expect(readTargetView("video", "ab", "default")).toEqual({});
  });

  it("SPEC-CORE-145 keeps an addon's views apart from a built-in app of the same name", () => {
    writeTargetView({ addon: "video" }, DRIVE, "default", { group: "tag" });

    expect(readTargetView("video", DRIVE, "default")).toEqual({});
    expect(storedKeys()).toEqual(["litloft.addon.video.view.main"]);
  });
});
