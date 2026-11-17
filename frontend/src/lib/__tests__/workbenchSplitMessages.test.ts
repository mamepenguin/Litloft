import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const messages = (locale: string) =>
  JSON.parse(
    readFileSync(resolve(process.cwd(), `src/messages-core/${locale}.json`), "utf8"),
  );

describe("SPEC-CORE-127 the button's name", () => {
  it.each([
    ["ja", "パネルを横に並べる"],
    ["en", "Show panels beside the player"],
  ])("SPEC-CORE-127 I7 workbench.splitPanels in %s is %s", (locale, name) => {
    expect(messages(locale).workbench.splitPanels).toBe(name);
  });
});
