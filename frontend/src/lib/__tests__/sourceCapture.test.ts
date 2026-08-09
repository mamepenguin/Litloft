import { beforeEach, describe, expect, it } from "vitest";

import {
  SOURCE_CAPTURE_LIMIT,
  SourceCaptureLimitError,
  addSourceCapture,
  clearSourceCaptures,
  getSourceCaptures,
  removeSourceCapture,
  updateSourceCaptureNote,
} from "../sourceCapture";

function capture(overrides: Record<string, unknown> = {}) {
  return {
    drive: "media",
    sourceFileId: "abc123def456",
    filename: "Lecture.mp4",
    fileType: "video",
    kind: "media_timestamp" as const,
    locator: { seconds: 125 },
    ...overrides,
  };
}

describe("sourceCapture store", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearSourceCaptures("media");
    clearSourceCaptures("notes");
  });

  it("partitions captures by drive and restores them from sessionStorage", () => {
    addSourceCapture(capture());
    addSourceCapture(capture({ drive: "notes", sourceFileId: "note00000001" }));

    expect(getSourceCaptures("media")).toHaveLength(1);
    expect(getSourceCaptures("notes")).toHaveLength(1);
    expect(sessionStorage.getItem("litloft:source-captures:media")).toContain(
      "abc123def456",
    );
  });

  it("deduplicates the same source, locator, kind, and quote", () => {
    const first = addSourceCapture(capture());
    const duplicate = addSourceCapture(capture());

    expect(first.added).toBe(true);
    expect(duplicate.added).toBe(false);
    expect(duplicate.item.id).toBe(first.item.id);
    expect(getSourceCaptures("media")).toHaveLength(1);
  });

  it("updates a personal note immutably and removes by id", () => {
    const { item } = addSourceCapture(capture());
    const before = getSourceCaptures("media");

    updateSourceCaptureNote("media", item.id, "Check this claim");
    const after = getSourceCaptures("media");

    expect(after).not.toBe(before);
    expect(after[0].note).toBe("Check this claim");
    removeSourceCapture("media", item.id);
    expect(getSourceCaptures("media")).toEqual([]);
  });

  it("rejects captures beyond the per-drive limit", () => {
    for (let i = 0; i < SOURCE_CAPTURE_LIMIT; i += 1) {
      addSourceCapture(
        capture({ sourceFileId: `file${String(i).padStart(8, "0")}` }),
      );
    }

    expect(() =>
      addSourceCapture(capture({ sourceFileId: "overflow0001" })),
    ).toThrow(SourceCaptureLimitError);
  });

  it("ignores malformed persisted data", () => {
    sessionStorage.setItem("litloft:source-captures:media", "not-json");
    clearSourceCaptures("media", { persist: false });
    expect(getSourceCaptures("media")).toEqual([]);
  });
});
