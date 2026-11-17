/**
 * A spec that reads `localStorage` across documents opens the fixture from
 * the http origin in `fixtureOrigin.ts`, never from `file://`.
 */

import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = __dirname;

/** A reload, history navigation, or a second page in the same context. */
const ACROSS_DOCUMENTS = /\.reload\(|\.go(Back|Forward)\(|\bcontext(\(\))?\.newPage\(/;

const FILE_URL = /pathToFileURL\(/;
const SERVED = /serveFixture\(/;

test("every spec that crosses documents serves the fixture over http", () => {
  const crossing = readdirSync(DIR)
    .filter((name) => name.endsWith(".spec.ts"))
    .map((name) => ({ name, source: readFileSync(join(DIR, name), "utf8") }))
    .filter(({ source }) => ACROSS_DOCUMENTS.test(source));

  expect(crossing.map(({ name }) => name).sort()).toEqual([
    "player-workbench-desktop.spec.ts",
    "workbench-split-desktop.spec.ts",
  ]);
  for (const { name, source } of crossing) {
    expect(FILE_URL.test(source), name).toBe(false);
    expect(SERVED.test(source), name).toBe(true);
  }
});
