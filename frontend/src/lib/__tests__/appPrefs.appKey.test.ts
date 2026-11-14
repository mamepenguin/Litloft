/** SPEC-ADDON-106: the saved target and shown set under a built-in or an addon app key. */

import { describe, it, expect, beforeEach } from "vitest";

import {
  readAppPrefs,
  readAppTarget,
  readShownTargets,
  writeAppPrefs,
  writeAppTarget,
  writeShownTargets,
} from "../appPrefs";

const DRIVE = "main";

function storedKeys(): string[] {
  return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).sort();
}

beforeEach(() => {
  localStorage.clear();
});

describe("SPEC-ADDON-106 the storage keys of an app key", () => {
  it.each([
    ["video", "litloft.videoApp.target.main", "litloft.videoApp.targets.main"],
    ["reading", "litloft.readingApp.target.main", "litloft.readingApp.targets.main"],
    [{ addon: "photo-diary" }, "litloft.addon.photo-diary.target.main", "litloft.addon.photo-diary.targets.main"],
  ] as const)("SPEC-ADDON-106 %j keeps its target and shown set under its own keys", (app, targetKey, shownKey) => {
    writeAppTarget(DRIVE, app, "sf-1");
    writeShownTargets(DRIVE, ["sf-1", "sf-2"], app);

    expect(storedKeys()).toEqual([targetKey, shownKey].sort());
    expect(localStorage.getItem(shownKey)).toBe('["sf-1","sf-2"]');
  });

  it("SPEC-ADDON-106 encodes the drive into an addon's keys", () => {
    writeAppTarget("a b/c", { addon: "pd" }, "sf-1");
    writeShownTargets("a b/c", ["sf-1"], { addon: "pd" });

    expect(storedKeys()).toEqual(
      ["litloft.addon.pd.target.a%20b%2Fc", "litloft.addon.pd.targets.a%20b%2Fc"].sort(),
    );
  });
});

describe("SPEC-ADDON-106 readAppTarget and writeAppTarget", () => {
  it("SPEC-ADDON-106 reads a target never saved as the default", () => {
    expect(readAppTarget(DRIVE, { addon: "pd" })).toBe("default");
    expect(readAppTarget(DRIVE, "video")).toBe("default");
  });

  it.each([["video"], ["reading"], [{ addon: "pd" }]] as const)(
    "SPEC-ADDON-106 round-trips a saved target for %j",
    (app) => {
      writeAppTarget(DRIVE, app, "sf-7");
      expect(readAppTarget(DRIVE, app)).toBe("sf-7");

      writeAppTarget(DRIVE, app, "default");
      expect(readAppTarget(DRIVE, app)).toBe("default");
    },
  );

  it.each([
    ["video", "litloft.videoApp.target.main"],
    ["reading", "litloft.readingApp.target.main"],
    [{ addon: "pd" }, "litloft.addon.pd.target.main"],
  ] as const)("SPEC-ADDON-106 reads an empty stored value for %j as the default", (app, key) => {
    localStorage.setItem(key, "");

    expect(readAppTarget(DRIVE, app)).toBe("default");
  });

  it("SPEC-ADDON-106 returns a saved id it cannot check against the drive's folders", () => {
    writeAppTarget(DRIVE, { addon: "pd" }, "sf-that-is-gone");

    expect(readAppTarget(DRIVE, { addon: "pd" })).toBe("sf-that-is-gone");
  });

  it.each(["video", "reading"] as const)(
    "SPEC-ADDON-106 I1 shares the %s target with readAppPrefs and writeAppPrefs",
    (app) => {
      writeAppTarget(DRIVE, app, "sf-from-helper");
      expect(readAppPrefs(DRIVE, app).target).toBe("sf-from-helper");

      writeAppPrefs(DRIVE, { target: "sf-from-prefs" }, app);
      expect(readAppTarget(DRIVE, app)).toBe("sf-from-prefs");
    },
  );

  it("SPEC-ADDON-106 reads the default when storage refuses the read", () => {
    writeAppTarget(DRIVE, { addon: "pd" }, "sf-1");
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    try {
      expect(readAppTarget(DRIVE, { addon: "pd" })).toBe("default");
    } finally {
      Storage.prototype.getItem = original;
    }
  });

  it("SPEC-ADDON-106 drops a write that storage refuses", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
    try {
      expect(() => writeAppTarget(DRIVE, { addon: "pd" }, "sf-1")).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }

    expect(readAppTarget(DRIVE, { addon: "pd" })).toBe("default");
  });
});

describe("SPEC-ADDON-106 I2 an addon never reaches a built-in app's keys", () => {
  it.each(["video", "reading"] as const)(
    "SPEC-ADDON-106 an addon named %s neither reads nor writes the built-in app's target and shown set",
    (name) => {
      writeAppTarget(DRIVE, name, "sf-builtin");
      writeShownTargets(DRIVE, ["sf-builtin"], name);

      expect(readAppTarget(DRIVE, { addon: name })).toBe("default");
      expect(readShownTargets(DRIVE, { addon: name })).toBeNull();

      writeAppTarget(DRIVE, { addon: name }, "sf-addon");
      writeShownTargets(DRIVE, ["sf-addon"], { addon: name });

      expect(readAppTarget(DRIVE, name)).toBe("sf-builtin");
      expect(readShownTargets(DRIVE, name)).toEqual(["sf-builtin"]);
    },
  );

  it.each(["video", "reading", "videoApp", "readingApp"])(
    "SPEC-ADDON-106 an addon named %s writes only under litloft.addon.",
    (name) => {
      writeAppTarget(DRIVE, { addon: name }, "sf-1");
      writeShownTargets(DRIVE, ["sf-1"], { addon: name });

      for (const key of storedKeys()) {
        expect(key.startsWith(`litloft.addon.${name}.`)).toBe(true);
      }
    },
  );
});

describe("SPEC-ADDON-106 I3 addons and drives stay apart", () => {
  it("SPEC-ADDON-106 keeps two addons' targets and shown sets apart on one drive", () => {
    writeAppTarget(DRIVE, { addon: "pd" }, "sf-pd");
    writeShownTargets(DRIVE, ["sf-pd"], { addon: "pd" });
    writeAppTarget(DRIVE, { addon: "pd2" }, "sf-pd2");
    writeShownTargets(DRIVE, ["sf-pd2"], { addon: "pd2" });

    expect(readAppTarget(DRIVE, { addon: "pd" })).toBe("sf-pd");
    expect(readShownTargets(DRIVE, { addon: "pd" })).toEqual(["sf-pd"]);
    expect(readAppTarget(DRIVE, { addon: "pd2" })).toBe("sf-pd2");
    expect(readShownTargets(DRIVE, { addon: "pd2" })).toEqual(["sf-pd2"]);
    expect(readAppTarget(DRIVE, { addon: "p" })).toBe("default");
  });

  it.each([
    ["a", "ab"],
    ["ab", "a"],
    ["a", "a b"],
  ])("SPEC-ADDON-106 a choice on drive %j never applies to drive %j", (saved, other) => {
    writeAppTarget(saved, { addon: "pd" }, "sf-1");
    writeShownTargets(saved, ["sf-1"], { addon: "pd" });

    expect(readAppTarget(other, { addon: "pd" })).toBe("default");
    expect(readShownTargets(other, { addon: "pd" })).toBeNull();
    expect(readAppTarget(saved, { addon: "pd" })).toBe("sf-1");
  });
});

describe("SPEC-ADDON-106 the shown set under an addon key", () => {
  it("SPEC-ADDON-106 keeps an empty set apart from never saved", () => {
    expect(readShownTargets(DRIVE, { addon: "pd" })).toBeNull();

    writeShownTargets(DRIVE, [], { addon: "pd" });

    expect(readShownTargets(DRIVE, { addon: "pd" })).toEqual([]);
    expect(localStorage.getItem("litloft.addon.pd.targets.main")).toBe("[]");
  });

  it("SPEC-ADDON-106 reads malformed stored JSON as never saved", () => {
    localStorage.setItem("litloft.addon.pd.targets.main", '["sf-1"]');
    expect(readShownTargets(DRIVE, { addon: "pd" })).toEqual(["sf-1"]);

    localStorage.setItem("litloft.addon.pd.targets.main", "{oops");

    expect(readShownTargets(DRIVE, { addon: "pd" })).toBeNull();
  });

  it("SPEC-ADDON-106 reads a storage failure as never saved and swallows a write failure", () => {
    localStorage.setItem("litloft.addon.pd.targets.main", '["sf-1"]');
    expect(readShownTargets(DRIVE, { addon: "pd" })).toEqual(["sf-1"]);
    localStorage.clear();
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    try {
      expect(readShownTargets(DRIVE, { addon: "pd" })).toBeNull();
      expect(() => writeShownTargets(DRIVE, ["sf-1"], { addon: "pd" })).not.toThrow();
    } finally {
      Storage.prototype.getItem = getItem;
      Storage.prototype.setItem = setItem;
    }

    expect(storedKeys()).toEqual([]);
  });
});
