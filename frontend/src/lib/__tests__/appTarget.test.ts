/** SPEC-ADDON-106: one resolver for a smart folder within a set of base kinds. */

import { describe, expect, it } from "vitest";

import { resolveAppTarget } from "../appTarget";
import { READING_BASE_KINDS, resolveReadingTarget } from "../readingAppTarget";
import type { FileKind } from "@/types";
import type { SmartFolder } from "@/types/smartFolder";

function folder(query: string, fileType: SmartFolder["file_type"] = null): SmartFolder {
  return {
    id: "sf-1",
    drive: "main",
    name: "Smart",
    query,
    file_type: fileType,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  };
}

const BASES: readonly (readonly FileKind[])[] = [
  ["image"],
  ["video"],
  ["pdf", "epub", "archive"],
  ["image", "video", "audio", "text", "other"],
];

function typesOf(target: ReturnType<typeof resolveAppTarget>): string[] {
  if (!target.usable || !("params" in target) || target.params === null) {
    throw new Error(`no params in ${JSON.stringify(target)}`);
  }
  return [...(target.params.type ?? [])].sort();
}

const sorted = (kinds: readonly string[]) => [...kinds].sort();

describe("SPEC-ADDON-106 the default target", () => {
  it.each(BASES)("SPEC-ADDON-106 I5 is every base kind for %j", (...base) => {
    const target = resolveAppTarget(null, base);

    expect(target.usable).toBe(true);
    expect(typesOf(target)).toEqual(sorted(base));
  });
});

describe("SPEC-ADDON-106 I5 the kinds a folder resolves to stay within the base kinds", () => {
  it.each(BASES)("SPEC-ADDON-106 a folder that names no kind gets every base kind of %j", (...base) => {
    expect(typesOf(resolveAppTarget(folder("tag:trip"), base))).toEqual(sorted(base));
  });

  it("SPEC-ADDON-106 keeps only the base kinds the named kinds hold", () => {
    const target = resolveAppTarget(folder("type:image type:pdf type:video"), ["image", "audio"]);

    expect(typesOf(target)).toEqual(["image"]);
  });

  it("SPEC-ADDON-106 keeps the base kinds a parent kind holds", () => {
    const target = resolveAppTarget(folder("type:document"), ["pdf", "image", "epub"]);

    expect(typesOf(target)).toEqual(["epub", "pdf"]);
  });

  it("SPEC-ADDON-106 resolves the folder's own kind against the base kinds", () => {
    expect(typesOf(resolveAppTarget(folder("tag:trip", "image"), ["image", "video"]))).toEqual([
      "image",
    ]);
  });

  it.each([
    ["type:document", null, ["image"]],
    ["type:video", null, ["image"]],
    ["tag:trip", "video", ["image", "audio"]],
    ["type:audio type:text", null, ["pdf", "epub"]],
  ] as const)(
    "SPEC-ADDON-106 %s (folder kind %s) holds none of %j and is empty",
    (query, fileType, base) => {
      expect(resolveAppTarget(folder(query, fileType), base)).toEqual({
        usable: true,
        empty: true,
        params: null,
      });
    },
  );

  it("SPEC-ADDON-106 is empty when the folder's own kind contradicts its query", () => {
    expect(resolveAppTarget(folder("type:image", "video"), ["image", "video"])).toEqual({
      usable: true,
      empty: true,
      params: null,
    });
  });
});

describe("SPEC-ADDON-106 the query's conditions", () => {
  it("SPEC-ADDON-106 carries search, tag, folder, size and favourite with the base kinds", () => {
    const target = resolveAppTarget(
      folder("beach tag:trip path:Photos size:>10MB is:favorite"),
      ["image"],
    );

    expect(target).toMatchObject({
      usable: true,
      params: {
        search: "beach",
        tag: ["trip"],
        folder: ["Photos"],
        size: ["gt:10485760"],
        favorite: true,
        type: ["image"],
      },
    });
  });
});

describe("SPEC-ADDON-106 I4 a folder the app cannot use", () => {
  const UNUSABLE = [
    "-tag:x",
    "!type:pdf",
    "!TYPE:pdf",
    "-Tag:x",
    "x -path : a",
    "x -Path : a",
    "x\t!in:Trip",
    "-is：favorite",
    "-in:Trip",
    "-size:>1MB",
    "-duration:>1m",
    "!is:liked",
    "duration:>10m",
    "tag:x duration:<1h",
    "DURATION:>1m",
  ];

  for (const base of BASES) {
    it.each(UNUSABLE)(`SPEC-ADDON-106 refuses %j whatever the base kinds (${base.join(",")})`, (query) => {
      expect(resolveAppTarget(folder(query), base)).toEqual({
        usable: false,
        reason: "unsupported_part",
      });
    });
  }

  it.each(["not-a-tag:here", "a-tag:x", "-foo:bar", "x!type:pdf", "tag:a-b"])(
    "SPEC-ADDON-106 keeps %j, which only looks like a negation",
    (query) => {
      expect(resolveAppTarget(folder(query), ["image"])).toMatchObject({ usable: true });
    },
  );
});

describe("SPEC-ADDON-106 base kinds the resolver refuses", () => {
  it.each([[[]], [["document"]], [["image", "document"]], [["document", "pdf"]]] as const)(
    "SPEC-ADDON-106 I5 throws for %j",
    (base) => {
      expect(() => resolveAppTarget(null, base as readonly FileKind[])).toThrow();
      expect(() => resolveAppTarget(folder("tag:x"), base as readonly FileKind[])).toThrow();
    },
  );
});

describe("SPEC-ADDON-106 I6 Reading resolves through the shared resolver", () => {
  const CORPUS: [string, SmartFolder["file_type"]][] = [
    ["", null],
    ["type:document", null],
    ["type:archive type:pdf type:video", null],
    ["tag:books", "document"],
    ["shelf tag:read path:Books size:>10MB is:favorite", null],
    ["in:Trip is:liked", null],
    ["type:video", null],
    ["type:pdf", "video"],
    ["duration:>10m", null],
    ["-tag:read", null],
    ["!type:pdf", null],
    ["not-a-tag:here", null],
    ["type:epub size:<5MB", "document"],
  ];

  it.each(CORPUS)("SPEC-ADDON-106 %j (folder kind %s) resolves the same", (query, fileType) => {
    const f = folder(query, fileType);

    expect(resolveReadingTarget(f)).toEqual(resolveAppTarget(f, READING_BASE_KINDS));
  });

  it("SPEC-ADDON-106 the default Reading target resolves the same", () => {
    expect(resolveReadingTarget(null)).toEqual(resolveAppTarget(null, READING_BASE_KINDS));
  });
});
