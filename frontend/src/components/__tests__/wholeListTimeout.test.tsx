import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const apiMocks = vi.hoisted(() => ({
  getTrash: vi.fn(),
  emptyTrash: vi.fn(),
  purgeFile: vi.fn(),
  restoreFile: vi.fn(),
  batchRestore: vi.fn(),
  batchPurge: vi.fn(),
  getMissing: vi.fn(),
  purgeAllMissing: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...apiMocks,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
}));

vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor(_cb: IntersectionObserverCallback) {}
  },
);

import { MissingView } from "../missing/MissingView";
import { TrashView } from "../trash/TrashView";

function abortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

/** Answers a fetch only when its signal aborts, recording that signal. */
function hangUntilAborted(captured: { signal?: AbortSignal }) {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    captured.signal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(abortError()));
    });
  });
}

async function realApi() {
  return vi.importActual<typeof import("@/lib/api")>("@/lib/api");
}

describe("SPEC-CORE-120 I20: a whole-list request is bounded at 120 s", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    ["emptyTrash", (api: Awaited<ReturnType<typeof realApi>>) => api.emptyTrash("main")],
    [
      "purgeAllMissing",
      (api: Awaited<ReturnType<typeof realApi>>) => api.purgeAllMissing("main"),
    ],
  ])("I20 [SPEC-CORE-120] %s aborts at 120 s, not before", async (_label, call) => {
    vi.useFakeTimers();
    const captured: { signal?: AbortSignal } = {};
    vi.stubGlobal("fetch", hangUntilAborted(captured));
    const api = await realApi();

    const outcome = call(api).then(
      () => null,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(119_999);
    expect(captured.signal).toBeDefined();
    expect(captured.signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(captured.signal?.aborted).toBe(true);
    expect(await outcome).toBeInstanceOf(DOMException);
  });

  it("I20 [SPEC-CORE-120] a caller's signal still reaches the request", async () => {
    const captured: { signal?: AbortSignal } = {};
    vi.stubGlobal("fetch", hangUntilAborted(captured));
    const api = await realApi();
    const caller = new AbortController();

    const outcome = api.emptyTrash("main", { signal: caller.signal }).then(
      () => null,
      (error: unknown) => error,
    );
    await Promise.resolve();
    caller.abort();

    expect(await outcome).toBeInstanceOf(DOMException);
    expect(captured.signal).toBe(caller.signal);
  });
});

describe("SPEC-CORE-120 I20: an aborted whole-list request is a failure with the fixed text", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getTrash.mockResolvedValue({
      data: [
        { id: "a", filename: "a.mp4", title: "Trash a", drive: "main", folder_path: "", file_type: "video", mime_type: "video/mp4", tags: [] },
      ],
      meta: { total: 1, page: 1, limit: 30 },
    });
    apiMocks.getMissing.mockResolvedValue({
      data: [
        { id: "a", filename: "a.mp4", title: "Missing a", drive: "main", folder_path: "", file_type: "video", mime_type: "video/mp4", tags: [] },
      ],
      meta: { total: 1, page: 1, limit: 30 },
    });
  });

  async function confirmLast(name: RegExp) {
    const button = screen.getAllByRole("button", { name }).at(-1);
    fireEvent.click(button!);
  }

  it("I20 [SPEC-CORE-120] empty trash shows the failure text and re-enables its controls", async () => {
    apiMocks.emptyTrash.mockRejectedValue(abortError());
    render(<TrashView driveName="main" />);
    fireEvent.click(await screen.findByRole("button", { name: /Empty Trash/i }));
    await confirmLast(/Empty Trash/i);

    expect(await screen.findByText("Could not complete. Please try again.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Empty Trash/i }).at(-1)).toBeEnabled();
  });

  it("I20 [SPEC-CORE-120] purge all missing shows the failure text and re-enables its controls", async () => {
    apiMocks.purgeAllMissing.mockRejectedValue(abortError());
    render(<MissingView driveName="main" />);
    fireEvent.click(await screen.findByRole("button", { name: /Permanently Delete All/i }));
    await confirmLast(/Permanently Delete All/i);

    expect(await screen.findByText("Could not complete. Please try again.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /Permanently Delete All/i }).at(-1)).toBeEnabled(),
    );
  });
});
