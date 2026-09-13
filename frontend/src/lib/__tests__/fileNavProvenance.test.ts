/**
 * The pane cannot infer the listing — the redirect destroys the evidence —
 * so the listing emits the marker and `CARRIED_QUERY_KEYS` keeps it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CARRIED_QUERY_KEYS,
  buildCanonicalFileUrl,
} from "../canonicalFileUrl";
import { PLAIN_FOLDER_NAV, resolveFileNavOrdering } from "../fileNavOrdering";

const src = (...p: string[]) =>
  readFileSync(join(__dirname, "..", "..", ...p), "utf8");

describe("the provenance marker survives the redirect", () => {
  it("is carried, so the pane can still read it", () => {
    expect(CARRIED_QUERY_KEYS).toContain("nav");
  });

  it("reaches the canonical URL end to end", () => {
    // `/files/{id}` rewrites the path to the file's own folder and keeps
    // only the listed keys.
    const url = buildCanonicalFileUrl(
      { drive: "media", folder_path: "photos/2024" },
      "abc123",
      { sort: "title", order: "asc", nav: PLAIN_FOLDER_NAV, view: "liked" },
    );
    expect(url).toContain(`nav=${PLAIN_FOLDER_NAV}`);
    expect(url).not.toContain("view=");

    const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    expect(resolveFileNavOrdering({ params }).countable).toBe(true);
  });

  it("is not invented by the pane when the listing did not send it", () => {
    const url = buildCanonicalFileUrl(
      { drive: "media", folder_path: "photos/2024" },
      "abc123",
      { sort: "liked_at", order: "desc", view: "liked" },
    );
    const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    const walk = resolveFileNavOrdering({ params });
    expect(walk.countable).toBe(false);
    expect(walk.sort).toBe("liked_at");
  });
});

describe("only a plain folder listing emits the marker", () => {
  const folderBrowser = src("components", "FolderBrowser.tsx");
  const folderContent = src("components", "folder", "FolderContent.tsx");

  it("gates the folder listing on every narrowing it owns", () => {
    // Each of these is a way the rows on screen stop being "the whole
    // folder". `typeFilter` and `trustFilter` are component state and
    // `tagFilter` is a prop, so none of them are in the URL — which is
    // why the gate has to be here rather than in the resolver.
    const gate = folderBrowser
      // Comments inside the expression are prose, and a term named in one
      // would satisfy this scan.
      .replace(/\/\/[^\n]*/g, "")
      .match(/const listingIsPlainFolder =([\s\S]*?);\n/);
    expect(gate).not.toBeNull();
    for (const term of [
      "folderPath !== undefined",
      "!isSpecialView",
      "!isSearch",
      "!tagFilter",
      "!typeFilter",
      "!trustFilter",
      'effectiveSort !== "random"',
    ]) {
      expect(gate![1]).toContain(term);
    }
    expect(folderBrowser).toContain('"&nav=folder"');
  });

  it("withdraws the marker while the name box is narrowing the rows", () => {
    // The box lives below `FolderBrowser`, which cannot see it.
    expect(folderContent).toMatch(/filter\.isActive[\s\S]{0,200}nav=folder/);
    expect(folderContent).toContain("sortQuery={rowSortQuery}");
    expect(folderContent).not.toMatch(/sortQuery=\{sortQuery\}/);
  });
});
