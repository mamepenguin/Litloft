import { describe, expect, it } from "vitest";
import { extractVimeoId } from "../VimeoEmbed";

describe("extractVimeoId", () => {
  it("extracts id from standard vimeo.com URL", () => {
    expect(extractVimeoId("https://vimeo.com/123456789")).toBe("123456789");
  });

  it("extracts id from player.vimeo.com URL", () => {
    expect(extractVimeoId("https://player.vimeo.com/video/123456789")).toBe(
      "123456789",
    );
  });

  it("extracts id from channels URL", () => {
    expect(
      extractVimeoId("https://vimeo.com/channels/staffpicks/987654"),
    ).toBe("987654");
  });

  it("extracts id from groups URL", () => {
    expect(
      extractVimeoId("https://vimeo.com/groups/abc123/videos/555"),
    ).toBe("555");
  });

  it("returns null for non-vimeo URL", () => {
    expect(extractVimeoId("https://youtu.be/abc")).toBeNull();
    expect(extractVimeoId("https://example.com/x")).toBeNull();
  });

  it("rejects lookalike hosts that contain vimeo.com in the path", () => {
    // Hostname guard: only the registered Vimeo hosts are accepted.
    expect(extractVimeoId("https://evil.example/vimeo.com/123")).toBeNull();
    expect(extractVimeoId("https://vimeo.com.evil.example/123")).toBeNull();
  });

  it("returns null for malformed URL", () => {
    expect(extractVimeoId("not-a-url")).toBeNull();
    expect(extractVimeoId("")).toBeNull();
  });
});
