import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { ApiStatusError } from "@/lib/apiError";
import { addSubtitle, deleteSubtitle, replaceSubtitle } from "../api";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const subtitle = {
  index: 0,
  language: "ja",
  format: "srt",
  label: "日本語",
  filename: "Night.ja.srt",
  shared_with: 0,
  version: "1111111111111111111",
};

function file(name = "jp.srt") {
  return new File(["WEBVTT\n"], name, { type: "text/plain" });
}

describe("SPEC-CORE-185 API contract: the Subtitles list writes", () => {
  it("addSubtitle POSTs the file and language to the video's subtitles", async () => {
    const picked = file();
    mockFetch.mockResolvedValueOnce(jsonResponse({ subtitles: [subtitle] }, 201));

    const result = await addSubtitle("f1", picked, "ja");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/files/f1/subtitles");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body.get("file")).toBe(picked);
    expect(body.get("language")).toBe("ja");
    expect(result).toEqual({ subtitles: [subtitle] });
  });

  it("addSubtitle sends an empty language for the bare track", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ subtitles: [] }, 201));

    await addSubtitle("f1", file("bare.srt"), "");

    expect((mockFetch.mock.calls[0][1].body as FormData).get("language")).toBe("");
  });

  it("replaceSubtitle PUTs the row's name and the picked file", async () => {
    const picked = file("replacement.vtt");
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ subtitles: [subtitle], sidecar_errors: [] }),
    );

    const result = await replaceSubtitle("f1", "Night.ja.srt", picked);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/files/f1/subtitles");
    expect(init.method).toBe("PUT");
    const body = init.body as FormData;
    expect(body.get("name")).toBe("Night.ja.srt");
    expect(body.get("file")).toBe(picked);
    expect(result).toEqual({ subtitles: [subtitle], sidecar_errors: [] });
  });

  it("deleteSubtitle DELETEs exactly the named sidecar", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ subtitles: [] }));

    const result = await deleteSubtitle("f1", "Night.ja.srt");

    const [url, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("DELETE");
    const [path, query] = String(url).split("?");
    expect(path).toBe("/api/files/f1/subtitles");
    expect(new URLSearchParams(query).get("name")).toBe("Night.ja.srt");
    expect(result).toEqual({ subtitles: [] });
  });

  it.each([
    ["add", () => addSubtitle("f1", file(), "ja")],
    ["replace", () => replaceSubtitle("f1", "Night.ja.srt", file())],
    ["delete", () => deleteSubtitle("f1", "Night.ja.srt")],
  ] as const)(
    "%s turns a 409 detail object into an ApiStatusError with code and names",
    async (_label, send) => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          { detail: { code: "subtitle_name_taken", names: ["Night.ja.srt"] } },
          409,
        ),
      );

      const failure = await send().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ApiStatusError);
      expect(failure).toMatchObject({
        status: 409,
        code: "subtitle_name_taken",
        names: ["Night.ja.srt"],
      });
    },
  );

  it.each([400, 413])("keeps the status of a %i refusal", async (status) => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ detail: { code: "subtitle_too_large", names: [] } }, status),
    );

    const failure = await addSubtitle("f1", file(), "").catch((error: unknown) => error);

    expect(failure).toMatchObject({ status, code: "subtitle_too_large", names: [] });
  });
});
