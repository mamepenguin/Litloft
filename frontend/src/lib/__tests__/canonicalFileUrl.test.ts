import { describe, expect, it } from "vitest";

import {
  CARRIED_QUERY_KEYS,
  buildCanonicalFileUrl,
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
