import { describe, expect, it } from "vitest";
import { extractYouTubeId } from "../YouTubeEmbed";

describe("extractYouTubeId", () => {
  it("extracts id from watch URL", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("extracts id from youtu.be short URL", () => {
    expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("extracts id from /embed/ URL", () => {
    expect(
      extractYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("extracts id from /shorts/ URL", () => {
    expect(
      extractYouTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("rejects lookalike hosts that contain youtube.com in path", () => {
    expect(
      extractYouTubeId("https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBeNull();
    expect(
      extractYouTubeId("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ"),
    ).toBeNull();
  });

  it("returns null for non-youtube URL", () => {
    expect(extractYouTubeId("https://vimeo.com/123")).toBeNull();
    expect(extractYouTubeId("https://example.com/x")).toBeNull();
  });

  it("returns null for malformed URL", () => {
    expect(extractYouTubeId("not-a-url")).toBeNull();
    expect(extractYouTubeId("")).toBeNull();
  });
});
