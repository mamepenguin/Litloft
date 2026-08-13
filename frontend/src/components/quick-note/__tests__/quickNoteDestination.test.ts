import { beforeEach, describe, expect, it } from "vitest";

import {
  QUICK_NOTE_DEFAULT_FOLDER,
  QUICK_NOTE_LAST_DRIVE_KEY,
  isValidQuickNoteFolder,
  quickNoteDestinationKey,
  readQuickNoteFolder,
  readQuickNoteLastDrive,
  resolveQuickNoteDrive,
  writeQuickNoteFolder,
  writeQuickNoteLastDrive,
} from "../quickNoteDestination";

beforeEach(() => {
  localStorage.clear();
});

describe("resolveQuickNoteDrive", () => {
  it("prefers the current drive", () => {
    expect(
      resolveQuickNoteDrive({
        currentDrive: "photos",
        lastDrive: "notes",
        accessibleDrives: ["photos", "notes"],
      }),
    ).toBe("photos");
  });

  it("falls back to the last used drive when there is no current one", () => {
    expect(
      resolveQuickNoteDrive({
        currentDrive: null,
        lastDrive: "notes",
        accessibleDrives: ["photos", "notes"],
      }),
    ).toBe("notes");
  });

  it("ignores a stored drive that is no longer accessible", () => {
    expect(
      resolveQuickNoteDrive({
        currentDrive: null,
        lastDrive: "locked",
        accessibleDrives: ["photos", "notes"],
      }),
    ).toBeNull();
  });

  it("ignores a current drive that is not in the accessible list", () => {
    expect(
      resolveQuickNoteDrive({
        currentDrive: "locked",
        lastDrive: "notes",
        accessibleDrives: ["photos", "notes"],
      }),
    ).toBe("notes");
  });

  it("uses the sole accessible drive", () => {
    expect(
      resolveQuickNoteDrive({
        currentDrive: null,
        lastDrive: null,
        accessibleDrives: ["only"],
      }),
    ).toBe("only");
  });

  it("returns no selection when several drives exist and nothing points at one", () => {
    expect(
      resolveQuickNoteDrive({
        currentDrive: null,
        lastDrive: null,
        accessibleDrives: ["a", "b"],
      }),
    ).toBeNull();
  });

  it("returns no selection when nothing is accessible", () => {
    expect(
      resolveQuickNoteDrive({
        currentDrive: "photos",
        lastDrive: "notes",
        accessibleDrives: [],
      }),
    ).toBeNull();
  });
});

describe("isValidQuickNoteFolder", () => {
  it.each([["Inbox"], ["Inbox/2026"], [""]])("accepts %j", (folder) => {
    expect(isValidQuickNoteFolder(folder)).toBe(true);
  });

  it.each([
    ["../escape"],
    ["Inbox/../../etc"],
    ["./here"],
    ["/absolute"],
    ["trailing/"],
    ["double//slash"],
    ["back\\slash"],
    ["a".repeat(300)],
  ])("rejects %j", (folder) => {
    expect(isValidQuickNoteFolder(folder)).toBe(false);
  });

  it("rejects control characters", () => {
    expect(isValidQuickNoteFolder(`Inbox${String.fromCharCode(0)}`)).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isValidQuickNoteFolder(undefined)).toBe(false);
    expect(isValidQuickNoteFolder(42)).toBe(false);
    expect(isValidQuickNoteFolder({ folder: "Inbox" })).toBe(false);
  });
});

describe("folder preferences", () => {
  it("starts a drive with no setting at Inbox", () => {
    expect(readQuickNoteFolder("photos")).toBe(QUICK_NOTE_DEFAULT_FOLDER);
  });

  it("round-trips a stored folder", () => {
    writeQuickNoteFolder("photos", "Captures/2026");
    expect(readQuickNoteFolder("photos")).toBe("Captures/2026");
  });

  it("keeps settings isolated per drive", () => {
    writeQuickNoteFolder("photos", "Captures");
    writeQuickNoteFolder("notes", "Inbox/Quick");
    expect(readQuickNoteFolder("photos")).toBe("Captures");
    expect(readQuickNoteFolder("notes")).toBe("Inbox/Quick");
    expect(readQuickNoteFolder("other")).toBe(QUICK_NOTE_DEFAULT_FOLDER);
  });

  it("falls back to Inbox on corrupt storage", () => {
    localStorage.setItem(quickNoteDestinationKey("photos"), "{not json");
    expect(readQuickNoteFolder("photos")).toBe(QUICK_NOTE_DEFAULT_FOLDER);
  });

  it("falls back to Inbox on a malformed shape", () => {
    localStorage.setItem(quickNoteDestinationKey("photos"), JSON.stringify(["Inbox"]));
    expect(readQuickNoteFolder("photos")).toBe(QUICK_NOTE_DEFAULT_FOLDER);
  });

  it("falls back to Inbox on a traversal value", () => {
    localStorage.setItem(
      quickNoteDestinationKey("photos"),
      JSON.stringify({ folder: "../../etc" }),
    );
    expect(readQuickNoteFolder("photos")).toBe(QUICK_NOTE_DEFAULT_FOLDER);
  });

  it("refuses to store an invalid folder", () => {
    writeQuickNoteFolder("photos", "../escape");
    expect(localStorage.getItem(quickNoteDestinationKey("photos"))).toBeNull();
  });

  it("stores the drive root as an explicit empty folder", () => {
    writeQuickNoteFolder("photos", "");
    expect(readQuickNoteFolder("photos")).toBe("");
  });
});

describe("last drive", () => {
  it("is null before anything is saved", () => {
    expect(readQuickNoteLastDrive()).toBeNull();
  });

  it("round-trips", () => {
    writeQuickNoteLastDrive("photos");
    expect(localStorage.getItem(QUICK_NOTE_LAST_DRIVE_KEY)).toBe("photos");
    expect(readQuickNoteLastDrive()).toBe("photos");
  });
});
