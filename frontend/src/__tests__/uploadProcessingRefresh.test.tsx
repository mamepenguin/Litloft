/**
 * SPEC-CORE-037 — when the drawer asks the core again: the 30 s tick, the
 * WebSocket hand-off, the 30-minute deadline, a failed request, a file that
 * leaves the answer, and the 100-id request bound.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import type { ComponentType } from "react";

vi.mock("@/lib/api", async () => (await import("@/__tests__/helpers/uploadApiMock")).apiMock());

const wsState = vi.hoisted(() => ({
  lastEvent: null as { event: string; data: Record<string, unknown> } | null,
}));

vi.mock("@/hooks/useWebSocket", () => ({ useWebSocket: () => wsState.lastEvent }));

import { mockedApi, type UploadApi } from "@/__tests__/helpers/uploadApiMock";
import { dropOn, flush, initResult } from "@/__tests__/helpers/uploadQueue";

type StageState = "pending" | "running" | "done" | "failed";

interface Stage {
  addon: string | null;
  key: string;
  i18n_key: string;
  state: StageState;
  required: boolean;
}

type Answer = { files: Record<string, { stages: Stage[]; ready: boolean }> };

const SAVED: Stage = {
  addon: null,
  key: "saved",
  i18n_key: "upload.stageSaved",
  state: "done",
  required: true,
};

const SEARCH_PENDING: Stage = {
  addon: "intel",
  key: "search",
  i18n_key: "upload.statusPending",
  state: "pending",
  required: true,
};

const SEARCH_DONE: Stage = { ...SEARCH_PENDING, state: "done" };

const answer = (files: Answer["files"]): Answer => ({ files });

const inProgress = () =>
  answer({ file_a: { stages: [SAVED, SEARCH_PENDING], ready: false } });
const ready = () => answer({ file_a: { stages: [SAVED, SEARCH_DONE], ready: true } });

type DrawerType = ComponentType;
type UploadZoneType = typeof import("@/components/UploadZone").UploadZone;

async function load(): Promise<{ Drawer: DrawerType; UploadZone: UploadZoneType }> {
  const [{ UploadProgress }, { UploadZone }] = await Promise.all([
    import("@/components/UploadProgress"),
    import("@/components/UploadZone"),
  ]);
  return { Drawer: UploadProgress as unknown as DrawerType, UploadZone };
}

async function renderCompleted(api: UploadApi) {
  const { Drawer, UploadZone } = await load();
  api.initUpload.mockResolvedValue(initResult("upload-1"));
  api.completeUpload.mockResolvedValue({ id: "file_a" });
  const view = render(
    <>
      <UploadZone drive="main" folderPath="films">
        <div />
      </UploadZone>
      <Drawer />
    </>,
  );
  await dropOn(view.container, [new File(["x"], "a.txt")]);
  await flush(20);
  return { view, Drawer };
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const TICK = 30 * 1000;
const DEADLINE = 30 * 60 * 1000;
const spinner = () => document.querySelector("svg.lucide-loader-circle");

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  wsState.lastEvent = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SPEC-CORE-037 I8 — when an entry asks again", () => {
  it("SPEC-CORE-037 I8 (r2) asks as soon as an entry reaches the processing view, then on each tick", async () => {
    const api = await mockedApi();
    api.getFilesProcessing.mockResolvedValue(inProgress());

    await renderCompleted(api);
    await advance(1);

    expect(api.getFilesProcessing).toHaveBeenCalledWith(["file_a"]);
    expect(screen.getByText("Pending")).toBeInTheDocument();

    await advance(TICK);
    expect(api.getFilesProcessing).toHaveBeenCalledTimes(2);

    await advance(TICK - 1000);
    expect(api.getFilesProcessing).toHaveBeenCalledTimes(2);

    await advance(1000);
    expect(api.getFilesProcessing).toHaveBeenCalledTimes(3);
  });

  it("SPEC-CORE-037 I8 (r2) shares one request among entries that complete together", async () => {
    const api = await mockedApi();
    const { useUpload } = await import("@/hooks/useUpload");
    const hook = renderHook(() => useUpload());

    api.initUpload.mockImplementation(
      async (_drive: string, body: { filename: string }) =>
        initResult(`upload-${body.filename}`),
    );
    api.completeUpload.mockImplementation(
      async (_drive: string, uploadId: string) => ({ id: uploadId }),
    );
    api.getFilesProcessing.mockImplementation(async (ids: string[]) =>
      answer(
        Object.fromEntries(
          ids.map((id) => [id, { stages: [SAVED, SEARCH_PENDING], ready: false }]),
        ),
      ),
    );

    await act(async () => {
      hook.result.current.addFiles("main", "", [
        new File(["x"], "a.txt"),
        new File(["x"], "b.txt"),
      ]);
    });
    await flush(20);
    await advance(1);

    expect(api.completeUpload).toHaveBeenCalledTimes(2);
    expect(api.getFilesProcessing).toHaveBeenCalledTimes(1);
    const [[requested]] = api.getFilesProcessing.mock.calls as unknown as Array<
      [string[]]
    >;
    expect(new Set(requested)).toEqual(new Set(["upload-a.txt", "upload-b.txt"]));
  });

  it("SPEC-CORE-037 I8 asks on the tick and not again for 30 s", async () => {
    const api = await mockedApi();
    api.getFilesProcessing.mockResolvedValue(inProgress());

    await renderCompleted(api);
    await advance(1);
    const before = api.getFilesProcessing.mock.calls.length;

    await advance(TICK - 1000);
    expect(api.getFilesProcessing.mock.calls.length).toBe(before);

    await advance(1000);
    expect(api.getFilesProcessing.mock.calls.length).toBe(before + 1);
  });

  it("SPEC-CORE-037 I8 refreshes on an event naming its file and ignores another file", async () => {
    const api = await mockedApi();
    api.getFilesProcessing.mockResolvedValue(inProgress());

    const { view, Drawer } = await renderCompleted(api);
    await advance(TICK);
    const before = api.getFilesProcessing.mock.calls.length;

    wsState.lastEvent = {
      event: "processing.updated",
      data: { file_ids: ["file_other"], drive: "main" },
    };
    await act(async () => {
      view.rerender(<Drawer />);
    });
    await flush(5);

    expect(api.getFilesProcessing.mock.calls.length).toBe(before);

    api.getFilesProcessing.mockResolvedValue(ready());
    wsState.lastEvent = {
      event: "processing.updated",
      data: { file_ids: ["file_a"], drive: "main" },
    };
    await act(async () => {
      view.rerender(<Drawer />);
    });
    await flush(5);

    expect(api.getFilesProcessing.mock.calls.length).toBe(before + 1);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("SPEC-CORE-037 I8 never asks again once the answer is ready", async () => {
    const api = await mockedApi();
    api.getFilesProcessing.mockResolvedValue(ready());

    await renderCompleted(api);
    await advance(TICK);
    expect(screen.getByText("Ready")).toBeInTheDocument();

    const requests = api.getFilesProcessing.mock.calls.length;
    await advance(5 * 60 * 1000);

    expect(api.getFilesProcessing.mock.calls.length).toBe(requests);
  });

  it("SPEC-CORE-037 I8 keeps the last line through a failed request and retries on the next tick", async () => {
    const api = await mockedApi();
    let fetches = 0;
    api.getFilesProcessing.mockImplementation(async () => {
      fetches += 1;
      if (fetches <= 2) return inProgress();
      throw new Error("API error: 500 Internal Server Error");
    });

    await renderCompleted(api);
    await advance(TICK);
    expect(screen.getByText("Pending")).toBeInTheDocument();

    await advance(TICK);
    expect(screen.getByText("Pending")).toBeInTheDocument();

    await advance(TICK);
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(spinner()).not.toBeNull();

    const during = api.getFilesProcessing.mock.calls.length;
    api.getFilesProcessing.mockResolvedValue(ready());

    await advance(TICK);

    expect(api.getFilesProcessing.mock.calls.length).toBeGreaterThan(during);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-037 I12 — gone, stopped and waiting", () => {
  it("SPEC-CORE-037 I12 drops the line when the file leaves the answer and stops asking", async () => {
    const api = await mockedApi();
    const queue: Answer[] = [inProgress(), inProgress(), inProgress(), answer({})];
    api.getFilesProcessing.mockImplementation(async () => {
      const next = queue.shift();
      if (next === undefined) throw new Error("API error: 500 Internal Server Error");
      return next;
    });

    await renderCompleted(api);
    await advance(TICK);
    await advance(TICK);
    expect(screen.getByText("Pending")).toBeInTheDocument();

    await advance(TICK);
    await advance(TICK);

    expect(screen.queryByText("Pending")).toBeNull();
    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(document.querySelector("svg.lucide-check")).not.toBeNull();
    expect(screen.queryByText("Ready")).toBeNull();

    const requests = api.getFilesProcessing.mock.calls.length;
    await advance(5 * 60 * 1000);
    expect(api.getFilesProcessing.mock.calls.length).toBe(requests);
  });

  it("SPEC-CORE-037 I12 turns spinners into grey dashes at the 30-minute deadline", async () => {
    const api = await mockedApi();
    api.getFilesProcessing.mockResolvedValue(inProgress());

    await renderCompleted(api);
    await advance(TICK);
    expect(spinner()).not.toBeNull();

    await advance(DEADLINE);

    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(document.querySelector("svg.lucide-minus")).not.toBeNull();
    expect(spinner()).toBeNull();

    const requests = api.getFilesProcessing.mock.calls.length;
    await advance(5 * 60 * 1000);
    expect(api.getFilesProcessing.mock.calls.length).toBe(requests);
  });

  it("SPEC-CORE-037 I12 keeps the plain Complete check for an entry still waiting at its deadline", async () => {
    const api = await mockedApi();
    api.getFilesProcessing.mockRejectedValue(
      new Error("API error: 500 Internal Server Error"),
    );

    await renderCompleted(api);
    await advance(TICK);
    expect(api.getFilesProcessing.mock.calls.length).toBeGreaterThan(0);

    await advance(DEADLINE);

    expect(document.querySelector("svg.lucide-check")).not.toBeNull();
    expect(spinner()).toBeNull();
    expect(document.querySelector("svg.lucide-minus")).toBeNull();
    expect(screen.queryByText("Pending")).toBeNull();
  });
});

describe("SPEC-CORE-037 I8 — the 100-id request bound", () => {
  it("SPEC-CORE-037 I8 never asks for more than 100 files in one request", async () => {
    const api = await mockedApi();
    const { useUpload } = await import("@/hooks/useUpload");
    const hook = renderHook(() => useUpload());

    api.initUpload.mockImplementation(
      async (_drive: string, body: { filename: string }) =>
        initResult(`upload-${body.filename}`),
    );
    api.completeUpload.mockImplementation(
      async (_drive: string, uploadId: string) => ({ id: uploadId }),
    );
    api.getFilesProcessing.mockImplementation(async (ids: string[]) =>
      answer(
        Object.fromEntries(
          ids.map((id) => [
            id,
            { stages: [SAVED, SEARCH_PENDING], ready: false },
          ]),
        ),
      ),
    );

    const files = Array.from({ length: 101 }, (_, index) =>
      new File(["x"], `f${index}.txt`),
    );
    await act(async () => {
      hook.result.current.addFiles("main", "", files);
    });
    for (
      let round = 0;
      round < 400 && api.initUpload.mock.calls.length < 101;
      round += 1
    ) {
      await flush(1);
    }
    await flush(10);
    await advance(TICK);

    const calls = api.getFilesProcessing.mock.calls as unknown as Array<[string[]]>;
    for (const [ids] of calls) {
      expect(ids.length).toBeLessThanOrEqual(100);
    }
    const requested = new Set(calls.flatMap(([ids]) => ids));
    expect(api.initUpload.mock.calls.length).toBe(101);
    expect(requested.size).toBe(101);
  });
});
