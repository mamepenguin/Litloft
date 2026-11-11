import { describe, expect, it } from "vitest";

import ja from "@/messages-core/ja.json";
import en from "@/messages-core/en.json";

describe("SPEC-CORE-048 C2/I23 the screen-text passage label", () => {
  it("is 画面内の文字 in Japanese", () => {
    expect(Object.values(ja.search)).toContain("画面内の文字");
  });

  it("has an English label that is not the plain-text one", () => {
    const values = Object.values(en.search);
    expect(values).toContain("Text in video");
    expect(values.filter((value) => value === "Text")).toHaveLength(1);
  });
});
