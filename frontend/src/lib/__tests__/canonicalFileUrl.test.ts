import { describe, expect, it } from "vitest";

import {
  CARRIED_QUERY_KEYS,
  buildCanonicalFileUrl,
  fileLinkHref,
} from "../canonicalFileUrl";

const baseFile = { drive: "media", folder_path: "Notes/2026" };

describe("buildCanonicalFileUrl", () => {
  it("builds /drive/{drive}/{folder}?file={id} for nested folders", () => {
    expect(buildCanonicalFileUrl(baseFile, "f1")).toBe(
      "/drive/media/Notes/2026?file=f1",
    );
  });

  it("omits the folder segment when the file is at the drive root", () => {
    expect(
      buildCanonicalFileUrl({ drive: "media", folder_path: "" }, "f1"),
    ).toBe("/drive/media?file=f1");
  });

  it("encodes special characters in drive and folder names", () => {
    expect(
      buildCanonicalFileUrl(
        { drive: "my drive", folder_path: "a b/c&d" },
        "f1",
      ),
    ).toBe("/drive/my%20drive/a%20b/c%26d?file=f1");
  });

  it("forwards listed query keys and drops unknown ones", () => {
    const url = buildCanonicalFileUrl(baseFile, "f1", {
      t: "42",
      edit: "1",
      sort: "name",
      unknown: "drop-me",
    });
    expect(url).toContain("file=f1");
    expect(url).toContain("t=42");
    expect(url).toContain("edit=1");
    expect(url).toContain("sort=name");
    expect(url).not.toContain("unknown");
  });

  it("drops array-valued and empty params (Next.js searchParams shape)", () => {
    const url = buildCanonicalFileUrl(baseFile, "f1", {
      t: ["a", "b"],
      edit: "",
      sort: undefined,
    });
    expect(url).toBe("/drive/media/Notes/2026?file=f1");
  });

  it("exposes the carried-key allowlist for callers that need to mirror it", () => {
    expect(CARRIED_QUERY_KEYS).toContain("edit");
    expect(CARRIED_QUERY_KEYS).toContain("t");
  });
});

describe("fileLinkHref", () => {
  it.each([
    [
      "a nested folder, with the listing's order and the folder walk",
      { id: "f1", drive: "media", folder_path: "Notes/2026" },
      "?sort=name&order=asc&nav=folder",
      "/drive/media/Notes/2026?file=f1&sort=name&order=asc&nav=folder",
    ],
    [
      "the drive root, with no listing query",
      { id: "f2", drive: "media", folder_path: "" },
      undefined,
      "/drive/media?file=f2",
    ],
    [
      "names that need encoding",
      { id: "f3", drive: "動画", folder_path: "YouTube/おでかけ 子ザメ" },
      "?sort=created_at&order=desc",
      "/drive/%E5%8B%95%E7%94%BB/YouTube/%E3%81%8A%E3%81%A7%E3%81%8B%E3%81%91%20%E5%AD%90%E3%82%B6%E3%83%A1?file=f3&sort=created_at&order=desc",
    ],
    [
      "keys the redirect does not carry",
      { id: "f4", drive: "media", folder_path: "a" },
      "?sort=name&view=liked&q=x",
      "/drive/media/a?file=f4&sort=name",
    ],
  ])("links %s to where /files/{id} would redirect", (_name, file, query, want) => {
    expect(fileLinkHref(file, query)).toBe(want);
  });
});
