import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import type { SubtitleInfo } from "@/types";
import { useShellCaptions } from "../useShellCaptions";

vi.mock("@/lib/api", () => ({
  getSubtitleUrl: (id: string, index: number) => `/subs/${id}/${index}`,
}));

const vtt = (text: string) => `WEBVTT\n\n00:00:00.000 --> 00:00:05.000\n${text}\n`;
const two: SubtitleInfo[] = [
  { index: 3, language: "ja", format: "vtt", label: "日本語" },
  { index: 5, language: "en", format: "vtt", label: "" },
];

let responses: Record<string, Response | Error>;

beforeEach(() => {
  window.localStorage.clear();
  responses = {
    "/subs/v1/3": new Response(vtt("ja line")),
    "/subs/v1/5": new Response(vtt("en line")),
    "/subs/v2/3": new Response(vtt("v2 line")),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const response = responses[url];
      if (response instanceof Error) throw response;
      return response ?? new Response("", { status: 404 });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("useShellCaptions", () => {
  it("shows the first track by default, as a default text track does", async () => {
    const { result } = renderHook(() => useShellCaptions("v1", two));

    expect(result.current.tracks.map((track) => track.label)).toEqual(["日本語", "en"]);
    expect(result.current.selected).toBe(0);
    await waitFor(() => expect(result.current.cues.map((cue) => cue.text)).toEqual(["ja line"]));
    expect(result.current.get()).toBe("on");
  });

  it("falls back to the automatic transcript when the file has no subtitles", () => {
    const { result } = renderHook(() => useShellCaptions("v1", []));
    expect(result.current.tracks).toEqual([
      expect.objectContaining({ url: "/api/addons/intelligence/files/v1/subtitles.vtt" }),
    ]);
  });

  it("is unavailable while nothing could be read", async () => {
    responses["/subs/v1/3"] = new Error("offline");
    const { result } = renderHook(() => useShellCaptions("v1", two));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current.get()).toBe("unavailable");
    expect(result.current.cues).toEqual([]);
  });

  it("stays off when the viewer turned captions off, and asserts nothing otherwise", async () => {
    window.localStorage.setItem("video-share-captions", "false");
    const { result } = renderHook(() => useShellCaptions("v1", two));

    await waitFor(() => expect(result.current.get()).toBe("off"));
    expect(result.current.selected).toBe(-1);
    expect(result.current.cues).toEqual([]);
    expect(window.localStorage.getItem("video-share-captions")).toBe("false");
  });

  it("switches track from the picker and remembers that captions are on", async () => {
    const { result } = renderHook(() => useShellCaptions("v1", two));

    act(() => result.current.select(1));

    await waitFor(() => expect(result.current.cues.map((cue) => cue.text)).toEqual(["en line"]));
    expect(result.current.selected).toBe(1);
    expect(window.localStorage.getItem("video-share-captions")).toBe("true");

    act(() => result.current.select(-1));
    expect(result.current.selected).toBe(-1);
    expect(window.localStorage.getItem("video-share-captions")).toBe("false");
  });

  it("turns off from the controls' toggle for this video only", async () => {
    const { result, rerender } = renderHook(({ id }) => useShellCaptions(id, two), {
      initialProps: { id: "v1" },
    });
    await waitFor(() => expect(result.current.get()).toBe("on"));

    act(() => result.current.set(false));
    expect(result.current.get()).toBe("off");

    rerender({ id: "v2" });
    expect(result.current.selected).toBe(0);
    await waitFor(() => expect(result.current.cues.map((cue) => cue.text)).toEqual(["v2 line"]));
  });
});
