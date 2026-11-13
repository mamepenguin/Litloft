import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A header value must be ISO-8859-1, and a drive name may not be: `fetch`
 * throws on `動画` before the request leaves. The addon proxy decodes the
 * header, so every sender percent-encodes the name. The source is scanned
 * because a sender that forgets only fails for a drive with such a name.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const ADDONS_DIR = resolve(REPO_ROOT, "addons");

const ROOTS = [
  resolve(REPO_ROOT, "frontend/src"),
  resolve(REPO_ROOT, "mcp-server/src"),
  ...(existsSync(ADDONS_DIR)
    ? readdirSync(ADDONS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => resolve(ADDONS_DIR, e.name, "frontend"))
        .filter(existsSync)
    : []),
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (entry.name === "__tests__" || /\.test\.tsx?$/.test(entry.name)) continue;
      const full = resolve(d, entry.name);
      if (full === resolve(REPO_ROOT, "frontend/src/addons")) continue;
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

const HEADER_VALUE = /["']X-Lit-Drive["']\s*:\s*([^,}\n]+)/g;

function unencodedSenders(): string[] {
  const found: string[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(HEADER_VALUE)) {
        if (!match[1].trim().startsWith("encodeURIComponent(")) {
          const line = text.slice(0, match.index).split("\n").length;
          found.push(`${relative(REPO_ROOT, file)}:${line} ${match[0].trim()}`);
        }
      }
    }
  }
  return found;
}

describe("SPEC-CORE-046: every X-Lit-Drive sender percent-encodes the drive name", () => {
  it("finds at least one sender, so the scan is reading the source", () => {
    const senders = ROOTS.flatMap(sourceFiles).filter((file) =>
      /["']X-Lit-Drive["']\s*:/.test(readFileSync(file, "utf8")),
    );
    expect(senders.length).toBeGreaterThan(0);
  });

  it("sends no raw drive name", () => {
    expect(unencodedSenders()).toEqual([]);
  });
});
