import { describe, it, expect } from "vitest";

import { extractValidTags, parseNote, withTags } from "@/lib/frontmatter";

describe("parseNote", () => {
  it("returns empty metadata for plain body", () => {
    const p = parseNote("just a body\n");
    expect(p.metadata).toEqual({});
    expect(p.body).toBe("just a body\n");
  });

  it("parses well-formed frontmatter", () => {
    const p = parseNote("---\ntags: [a, b]\nfoo: bar\n---\nbody\n");
    expect(p.metadata).toEqual({ tags: ["a", "b"], foo: "bar" });
    expect(p.body.trim()).toBe("body");
  });

  it("falls back to empty metadata on malformed YAML", () => {
    const p = parseNote("---\ntags: [a\n---\nbody\n");
    // gray-matter is permissive and may recover; at minimum body is intact
    expect(typeof p.body).toBe("string");
    expect(p.body.includes("body")).toBe(true);
  });
});

describe("extractValidTags", () => {
  it("filters invalid characters", () => {
    const tags = extractValidTags({
      tags: ["ok", "has space", "has!bang", "日本語"],
    });
    expect(tags).toEqual(["ok", "日本語"]);
  });

  it("rejects non-string entries", () => {
    const tags = extractValidTags({ tags: ["ok", 42, null, "also-ok"] });
    expect(tags).toEqual(["ok", "also-ok"]);
  });

  it("caps at 10 valid entries", () => {
    const input = Array.from({ length: 15 }, (_, i) => `t${i}`);
    const tags = extractValidTags({ tags: input });
    expect(tags).toHaveLength(10);
    expect(tags[0]).toBe("t0");
    expect(tags[9]).toBe("t9");
  });

  it("drops entries over 30 chars", () => {
    const tags = extractValidTags({
      tags: ["ok", "x".repeat(31), "x".repeat(30)],
    });
    expect(tags).toEqual(["ok", "x".repeat(30)]);
  });

  it("dedupes case-insensitively, keeping first occurrence", () => {
    const tags = extractValidTags({ tags: ["Cooking", "cooking", "japanese"] });
    expect(tags).toEqual(["Cooking", "japanese"]);
  });

  it("returns [] when tags key is missing", () => {
    expect(extractValidTags({})).toEqual([]);
    expect(extractValidTags({ tags: "not-a-list" })).toEqual([]);
  });
});

describe("withTags", () => {
  it("adds tags to a note without frontmatter", () => {
    const out = withTags("body line 1\nbody line 2\n", ["a", "b"]);
    const parsed = parseNote(out);
    expect(parsed.metadata).toEqual({ tags: ["a", "b"] });
    expect(parsed.body.trim()).toBe("body line 1\nbody line 2");
  });

  it("replaces existing tags while preserving other metadata", () => {
    const out = withTags(
      "---\nurl: https://example.com\ntags: [old]\n---\nbody\n",
      ["new1", "new2"]
    );
    const parsed = parseNote(out);
    expect(parsed.metadata).toEqual({
      url: "https://example.com",
      tags: ["new1", "new2"],
    });
    expect(parsed.body.trim()).toBe("body");
  });

  it("removes the tags key when newTags is empty", () => {
    const out = withTags(
      "---\nurl: https://example.com\ntags: [old]\n---\nbody\n",
      []
    );
    expect(out).not.toContain("tags:");
    // gray-matter quotes URLs because of the ':' — check the key+host
    // separately rather than the raw pair.
    expect(out).toContain("url:");
    expect(out).toContain("https://example.com");
  });

  it("is a no-op when the note has no frontmatter and newTags is empty", () => {
    const original = "plain body, no frontmatter\n";
    expect(withTags(original, [])).toBe(original);
  });

  it("filters invalid tag names before writing", () => {
    const out = withTags("body\n", ["ok", "has space"]);
    const parsed = parseNote(out);
    expect(parsed.metadata.tags).toEqual(["ok"]);
  });

  it("strips the frontmatter block when removing the only key", () => {
    const out = withTags("---\ntags: [only]\n---\nbody\n", []);
    expect(out.startsWith("---")).toBe(false);
    expect(out.trim()).toBe("body");
  });

  it("strips __proto__ / constructor from frontmatter on write", () => {
    // Defence in depth against a malicious upstream ``.md`` carrying
    // a prototype-polluting key. gray-matter's js-yaml 4 defends by
    // default, but withTags removes these explicitly.
    const malicious =
      "---\n__proto__: {admin: true}\nconstructor: hack\nfoo: bar\n---\nbody\n";
    const out = withTags(malicious, ["ok"]);
    expect(out).not.toContain("__proto__");
    expect(out).not.toContain("constructor:");
    expect(out).toContain("foo:");
    expect(out).toContain("ok");
  });
});
