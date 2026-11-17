/** SPEC-CORE-125 section 9: the strings of the unavailable state, in both languages. */
import { describe, expect, it } from "vitest";

import en from "@/messages-core/en.json";
import ja from "@/messages-core/ja.json";

describe("SPEC-CORE-125 driveUnavailable messages", () => {
  it("has the English texts", () => {
    const m = (en as unknown as Record<string, Record<string, string>>).driveUnavailable;
    expect(m).toEqual({
      title: "Can't open the drive “{name}”",
      allDrives: "All drives",
      unlock: "Unlock",
    });
  });

  it("has the Japanese texts", () => {
    const m = (ja as unknown as Record<string, Record<string, string>>).driveUnavailable;
    expect(m).toEqual({
      title: "ドライブ「{name}」を開けません",
      allDrives: "ドライブ一覧へ",
      unlock: "ロックを解除",
    });
  });
});
