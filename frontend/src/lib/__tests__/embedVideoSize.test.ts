import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderHook, act } from "@testing-library/react";

import { installShellStub } from "@/test/shellStub";

type Module = typeof import("../embedVideoSize");

const contract = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "shell-contract.json"), "utf8"),
) as { reports: { embedSize: { type: string; videoId: string; width: number; height: number } } };

const sample = contract.reports.embedSize;

async function load(): Promise<Module> {
  vi.resetModules();
  return import("../embedVideoSize");
}

function deliver(payload: unknown): void {
  act(() => {
    (window as unknown as { __litloft?: { receive(p: unknown): void } }).__litloft?.receive(payload);
  });
}

let shell: ReturnType<typeof installShellStub> | null = null;

afterEach(() => {
  shell?.remove();
  shell = null;
});

describe("useEmbedVideoSize", () => {
  it("knows nothing until the shell has reported", async () => {
    shell = installShellStub(4);
    const { useEmbedVideoSize } = await load();

    const { result } = renderHook(() => useEmbedVideoSize(sample.videoId));

    expect(result.current()).toBeNull();
  });

  it("reads the size the shell reports for its own embed, as the shared sample spells it", async () => {
    shell = installShellStub(4);
    const { useEmbedVideoSize } = await load();
    const { result } = renderHook(() => useEmbedVideoSize(sample.videoId));

    deliver(sample);

    expect(result.current()).toEqual({ width: sample.width, height: sample.height });
  });

  it("keeps the latest size, and gives the same reader for the whole life of the component", async () => {
    shell = installShellStub(4);
    const { useEmbedVideoSize } = await load();
    const { result, rerender } = renderHook(() => useEmbedVideoSize(sample.videoId));
    const reader = result.current;

    deliver(sample);
    deliver({ ...sample, width: 854, height: 480 });
    rerender();

    expect(result.current).toBe(reader);
    expect(reader()).toEqual({ width: 854, height: 480 });
  });

  it("ignores a size reported for another embed", async () => {
    shell = installShellStub(4);
    const { useEmbedVideoSize } = await load();
    const { result } = renderHook(() => useEmbedVideoSize(sample.videoId));

    deliver({ ...sample, videoId: "M7lc1UVf-VE" });

    expect(result.current()).toBeNull();
  });

  it("ignores a size that is not two positive numbers", async () => {
    shell = installShellStub(4);
    const { useEmbedVideoSize } = await load();
    const { result } = renderHook(() => useEmbedVideoSize(sample.videoId));

    for (const bad of [
      { ...sample, width: 0 },
      { ...sample, height: -1 },
      { ...sample, width: "1280" },
      { ...sample, height: Number.NaN },
    ]) {
      deliver(bad);
    }

    expect(result.current()).toBeNull();
  });

  it("does not let the video it was asked about before keep reporting into the one it is asked about now", async () => {
    shell = installShellStub(4);
    const { useEmbedVideoSize } = await load();
    const { result, rerender } = renderHook(({ id }) => useEmbedVideoSize(id), {
      initialProps: { id: sample.videoId as string | null },
    });

    rerender({ id: "M7lc1UVf-VE" });
    deliver(sample);

    expect(result.current()).toBeNull();
  });

  it("ignores any message that is not about an embed's size, whatever fields it carries", async () => {
    shell = installShellStub(4);
    const { useEmbedVideoSize } = await load();
    const { result } = renderHook(() => useEmbedVideoSize(sample.videoId));

    deliver({ ...sample, type: "page.immersive.applied", active: true });

    expect(result.current()).toBeNull();
  });

  it("forgets the size when it is asked about another video", async () => {
    shell = installShellStub(4);
    const { useEmbedVideoSize } = await load();
    const { result, rerender } = renderHook(({ id }) => useEmbedVideoSize(id), {
      initialProps: { id: sample.videoId as string | null },
    });
    deliver(sample);

    rerender({ id: "M7lc1UVf-VE" });

    expect(result.current()).toBeNull();
  });

  it("listens to nothing without a video id, and does nothing outside the shell", async () => {
    shell = installShellStub(4);
    const { useEmbedVideoSize } = await load();
    const { result } = renderHook(() => useEmbedVideoSize(null));
    deliver(sample);
    expect(result.current()).toBeNull();

    shell.remove();
    shell = null;
    const outside = renderHook(() => useEmbedVideoSize(sample.videoId));
    expect(outside.result.current()).toBeNull();
  });
});
