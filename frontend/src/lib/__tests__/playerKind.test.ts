import { describe, it, expect } from "vitest";
import { LOFT_MIME, playerKind } from "../playerKind";

describe("playerKind", () => {
  it("recognises a .loft reference before anything else", () => {
    // `.loft` is classified as `video` for search filters, but a native
    // <video> cannot load its URL.
    expect(
      playerKind({ mime_type: LOFT_MIME, file_type: "video" }),
    ).toBe("loft");
  });

  it("recognises native video and audio", () => {
    expect(playerKind({ mime_type: "video/mp4", file_type: "video" })).toBe(
      "video",
    );
    expect(playerKind({ mime_type: "audio/mpeg", file_type: "audio" })).toBe(
      "audio",
    );
  });

  it("returns null for everything a media player does not play", () => {
    expect(playerKind({ mime_type: "image/jpeg", file_type: "image" })).toBeNull();
    expect(playerKind({ mime_type: "text/markdown", file_type: "text" })).toBeNull();
    expect(playerKind({ mime_type: "application/pdf", file_type: "pdf" })).toBeNull();
    expect(playerKind({ mime_type: "text/html", file_type: "text" })).toBeNull();
  });

  it("falls back to file_type when the mime is missing", () => {
    expect(playerKind({ file_type: "video" })).toBe("video");
    expect(playerKind({ mime_type: "", file_type: "audio" })).toBe("audio");
    expect(playerKind({ mime_type: null, file_type: "video" })).toBe("video");
  });

  it("returns null rather than guessing when it knows nothing", () => {
    expect(playerKind({})).toBeNull();
    expect(playerKind({ mime_type: null, file_type: null })).toBeNull();
  });

  it("matches the .loft mime exactly", () => {
    expect(
      playerKind({ mime_type: "application/vnd.litloft.loft+json; charset=utf-8", file_type: "video" }),
    ).toBe("video");
  });
});
