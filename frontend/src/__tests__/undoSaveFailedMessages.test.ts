/** SPEC-CORE-150 / SPEC-ADDON-154 section 9: the core strings the toasts of an item action use. */
import { describe, expect, it } from "vitest";

import en from "@/messages-core/en.json";
import ja from "@/messages-core/ja.json";

type Common = { common: Record<string, string> };

describe("SPEC-CORE-150 common.undo and common.saveFailed", () => {
  it("has the English texts", () => {
    const { common } = en as unknown as Common;
    expect([common.undo, common.saveFailed]).toEqual(["Undo", "Couldn't save the change"]);
  });

  it("has the Japanese texts", () => {
    const { common } = ja as unknown as Common;
    expect([common.undo, common.saveFailed]).toEqual(["元に戻す", "変更を保存できませんでした"]);
  });
});
