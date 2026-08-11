import { describe, it, expect } from "vitest";
import { LOFT_MIME, playerKind } from "../playerKind";

describe("playerKind", () => {
  it("recognises a .loft reference before anything else", () => {
    // The trap this helper exists for: filetype classification reports
    // .loft as `video` so that search's file_type filters include it,
    // but a native <video> cannot load a YouTube URL. Checking
    // file_type first would send every .loft to the wrong player.
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
    // Scanned files occasionally reach the client without one.
    expect(playerKind({ file_type: "video" })).toBe("video");
    expect(playerKind({ mime_type: "", file_type: "audio" })).toBe("audio");
    expect(playerKind({ mime_type: null, file_type: "video" })).toBe("video");
  });

  it("returns null rather than guessing when it knows nothing", () => {
    expect(playerKind({})).toBeNull();
    expect(playerKind({ mime_type: null, file_type: null })).toBeNull();
  });

  it("matches the .loft mime exactly", () => {
    // Substring or prefix matching here would misroute anything that
    // merely mentions the vendor string.
    expect(
      playerKind({ mime_type: "application/vnd.litloft.loft+json; charset=utf-8", file_type: "video" }),
    ).toBe("video");
  });
});
