import { describe, expect, it } from "vitest";

import {
  previousPlayableBefore,
  type QueueEntry,
} from "../queue";

function entry(
  id: string,
  type: QueueEntry["file_type"],
  extra: Partial<QueueEntry> = {},
): QueueEntry {
  return { id, title: id, file_type: type, duration: null, ...extra };
}

// SPEC-CORE-190 step 7 / I3: the previous-track control takes the previous
// playable item and wraps only with loop on.
const ENTRIES: QueueEntry[] = [
  entry("d1", "document"),
  entry("v2", "video"),
  entry("a3", "audio", { missing_since: "2026-01-01T00:00:00Z" }),
  entry("v4", "video"),
  entry("i5", "image"),
];

describe("previousPlayableBefore", () => {
  it("skips non-playable entries before the current one", () => {
    expect(previousPlayableBefore(ENTRIES, "v4", false)?.id).toBe("v2");
  });

  it("does not wrap with loop off", () => {
    expect(previousPlayableBefore(ENTRIES, "v2", false)).toBeNull();
  });

  it("wraps to the last playable entry with loop on", () => {
    expect(previousPlayableBefore(ENTRIES, "v2", true)?.id).toBe("v4");
  });

  it("never chooses the current entry when it is the only playable one", () => {
    expect(
      previousPlayableBefore([entry("v1", "video")], "v1", true),
    ).toBeNull();
  });

  it("does nothing when the current file is not in the queue", () => {
    expect(previousPlayableBefore(ENTRIES, "zz", true)).toBeNull();
  });
});
