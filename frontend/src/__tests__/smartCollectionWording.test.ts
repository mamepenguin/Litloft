/**
 * SPEC-CORE-106 (I1, wording half): the feature is called Smart Collection in
 * every UI string and every user-facing doc. A "smart folder" inside a code
 * span or a fenced block is an identifier, not the term (step 4).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, relative, join } from "node:path";
import { fileURLToPath } from "node:url";

import ja from "@/messages-core/ja.json";
import en from "@/messages-core/en.json";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OLD_TERM = /smart folder|スマートフォルダ/i;

/**
 * Records of past work, which keep the words they were written with, and the
 * gitignored pre-kit archive, which exists only in some checkouts.
 */
const EXCLUDED = [
  "docs/specs/",
  "docs/process/reviews/",
  "docs/developer-guide/reviews/",
  "docs/superpowers/",
];

function stringValues(node: unknown, path: string[] = []): [string, string][] {
  if (typeof node === "string") return [[path.join("."), node]];
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([k, v]) => stringValues(v, [...path, k]));
  }
  return [];
}

function markdownUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return markdownUnder(full);
    return entry.name.endsWith(".md") ? [full] : [];
  });
}

function userFacingDocs(): string[] {
  const docs = markdownUnder(resolve(REPO, "docs"))
    .map((p) => relative(REPO, p))
    .filter((p) => !EXCLUDED.some((r) => p.startsWith(r)));
  return [...docs, "README.md", "DESIGN.md"];
}

function prose(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

function githubSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

describe("SPEC-CORE-106 I1 the UI strings", () => {
  it.each([
    ["ja", ja],
    ["en", en],
  ])("SPEC-CORE-106 I1 no %s message names a Smart Folder", (_locale, messages) => {
    const offenders = stringValues(messages).filter(([, v]) => OLD_TERM.test(v));
    expect(offenders).toEqual([]);
  });

  it("SPEC-CORE-106 the feature is named スマートコレクション / Smart Collection", () => {
    expect(ja.smartFolder.saveTitle).toBe("スマートコレクションを保存");
    expect(en.smartFolder.save).toBe("Save as Smart Collection");
    expect(en.smartFolder.saveTitle).toBe("Save Smart Collection");
    expect(en.smartFolder.renameTitle).toBe("Rename Smart Collection");
  });
});

describe("SPEC-CORE-106 I1 the user-facing docs", () => {
  it("SPEC-CORE-106 I1 no user-facing page names a Smart Folder outside code", () => {
    const pages = userFacingDocs();
    for (const named of [
      "docs/README_ja.md",
      "docs/addons/media-import.md",
      "docs/reference/api.md",
      "docs/user-guide/search.md",
      "docs/user-guide/file-browsing.md",
      "docs/user-guide/playlists-favorites.md",
      "README.md",
      "DESIGN.md",
    ]) {
      expect(pages).toContain(named);
    }
    expect(pages.some((p) => p.startsWith("docs/specs/"))).toBe(false);

    const offenders = pages.flatMap((page) => {
      const lines = prose(readFileSync(resolve(REPO, page), "utf8")).split("\n");
      return lines
        .map((line, i) => ({ page, line: i + 1, text: line }))
        .filter(({ text }) => OLD_TERM.test(text))
        .map(({ page: p, line }) => `${p}:${line}`);
    });
    expect(offenders).toEqual([]);
  });

  it("SPEC-CORE-106 the search guide's saving heading is renamed and every link to it still resolves", () => {
    const search = readFileSync(resolve(REPO, "docs/user-guide/search.md"), "utf8");
    const headings = [...search.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1]);
    expect(headings).toContain("Saving as a Smart Collection");
    const anchors = new Set(headings.map(githubSlug));

    const links = userFacingDocs().flatMap((page) => {
      const text = readFileSync(resolve(REPO, page), "utf8");
      return [...text.matchAll(/\]\(([^)\s]*search\.md)#([^)\s]+)\)/g)]
        .filter((m) => resolve(REPO, dirname(page), m[1]) === resolve(REPO, "docs/user-guide/search.md"))
        .map((m) => ({ page, anchor: m[2] }));
    });
    expect(links.some((l) => l.page === "docs/user-guide/playlists-favorites.md")).toBe(true);
    for (const link of links) {
      expect(anchors.has(link.anchor), `${link.page} → search.md#${link.anchor}`).toBe(true);
    }
  });

  it("SPEC-CORE-106 the API reference lists the 409 on all four name-taking write routes", () => {
    const api = readFileSync(resolve(REPO, "docs/reference/api.md"), "utf8").split("\n");
    const row = (method: string, path: string) =>
      api.find((l) => l.startsWith(`| \`${method}\` | \`${path}\` |`));
    for (const [method, path] of [
      ["POST", "/api/drives/{drive}/collections"],
      ["PUT", "/api/drives/{drive}/collections/{id}"],
      ["POST", "/api/drives/{drive}/smart-folders"],
      ["PATCH", "/api/drives/{drive}/smart-folders/{id}"],
    ]) {
      const line = row(method, path);
      expect(line, `${method} ${path}`).toBeDefined();
      expect(line, `${method} ${path}`).toMatch(/409/);
    }
  });
});
