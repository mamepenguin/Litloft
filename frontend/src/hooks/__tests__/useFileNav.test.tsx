import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import { useFileNav } from "../useFileNav";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import * as api from "@/lib/api";
import type { Neighbors } from "@/types";

vi.mock("@/lib/api", () => ({
  getFileNeighbors: vi.fn(),
}));

const messages = {
  shortcuts: {
    fileBrowser: "File Browser",
    prevFile: "Previous file",
    nextFile: "Next file",
  },
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <ShortcutsProvider>{children}</ShortcutsProvider>
    </NextIntlClientProvider>
  );
}

async function dispatchKey(key: string) {
  // The handler reaches the document through the shortcut stack, and the
  // state a test waits for lands a render before the context closing over
  // it does: push -> setStack -> the provider's stackRef sync are two
  // further rounds. Drain them first, or the key falls into the gap and
  // finds no handler at all.
  await act(async () => {});
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true }),
    );
  });
}

const sampleNeighbors: Neighbors = {
  prev_id: "prev1",
  next_id: "next1",
  position: 2,
  total: 3,
};

describe("useFileNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getFileNeighbors as ReturnType<typeof vi.fn>).mockResolvedValue(
      sampleNeighbors,
    );
  });

  it("fetches neighbors with the given fileId/sort/order on mount", async () => {
    const onNavigate = vi.fn();
    renderHook(
      () =>
        useFileNav({
          fileId: "current",
          sort: "name",
          order: "asc",
          fileType: "document",
          enabled: true,
          onNavigate,
        }),
      { wrapper: Wrapper },
    );
    await waitFor(() => {
      expect(api.getFileNeighbors).toHaveBeenCalledWith(
        "current",
        "name",
        "asc",
      );
    });
  });

  it("calls onNavigate(prev_id) when ArrowLeft is dispatched", async () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(
      () =>
        useFileNav({
          fileId: "current",
          fileType: "document",
          enabled: true,
          onNavigate,
        }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.prevId).toBe("prev1"));
    await dispatchKey("ArrowLeft");
    expect(onNavigate).toHaveBeenCalledWith("prev1");
  });

  it("calls onNavigate(next_id) when ArrowRight is dispatched", async () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(
      () =>
        useFileNav({
          fileId: "current",
          fileType: "document",
          enabled: true,
          onNavigate,
        }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.nextId).toBe("next1"));
    await dispatchKey("ArrowRight");
    expect(onNavigate).toHaveBeenCalledWith("next1");
  });

  it("does not bind arrow keys when enabled is false", async () => {
    const onNavigate = vi.fn();
    renderHook(
      () =>
        useFileNav({
          fileId: "current",
          fileType: "document",
          enabled: false,
          onNavigate,
        }),
      { wrapper: Wrapper },
    );
    // enabled=false also gates the fetch — neighbors should not be requested.
    await Promise.resolve();
    expect(api.getFileNeighbors).not.toHaveBeenCalled();
    await dispatchKey("ArrowLeft");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("does not bind arrow keys for video files (player owns seek)", async () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(
      () =>
        useFileNav({
          fileId: "current",
          fileType: "video",
          enabled: true,
          onNavigate,
        }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.prevId).toBe("prev1"));
    await dispatchKey("ArrowLeft");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("does not bind arrow keys for audio files", async () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(
      () =>
        useFileNav({
          fileId: "current",
          fileType: "audio",
          enabled: true,
          onNavigate,
        }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.nextId).toBe("next1"));
    await dispatchKey("ArrowRight");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("does not bind arrow keys for .loft (YouTube/Vimeo) files", async () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(
      () =>
        useFileNav({
          fileId: "current",
          fileType: "video",
          mimeType: "application/vnd.litloft.loft+json",
          enabled: true,
          onNavigate,
        }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.prevId).toBe("prev1"));
    await dispatchKey("ArrowLeft");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("does not call onNavigate when neighbor id is null", async () => {
    (api.getFileNeighbors as ReturnType<typeof vi.fn>).mockResolvedValue({
      prev_id: null,
      next_id: null,
    });
    const onNavigate = vi.fn();
    renderHook(
      () =>
        useFileNav({
          fileId: "current",
          fileType: "document",
          enabled: true,
          onNavigate,
        }),
      { wrapper: Wrapper },
    );
    await waitFor(() =>
      expect(api.getFileNeighbors).toHaveBeenCalled(),
    );
    // Wait an extra microtask to let the promise resolve and state update.
    await waitFor(() =>
      expect(api.getFileNeighbors).toHaveBeenCalledTimes(1),
    );
    await dispatchKey("ArrowLeft");
    await dispatchKey("ArrowRight");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("re-fetches when fileId changes", async () => {
    const onNavigate = vi.fn();
    const { rerender } = renderHook(
      ({ fileId }: { fileId: string }) =>
        useFileNav({
          fileId,
          fileType: "document",
          enabled: true,
          onNavigate,
        }),
      { wrapper: Wrapper, initialProps: { fileId: "first" } },
    );
    await waitFor(() =>
      expect(api.getFileNeighbors).toHaveBeenCalledWith(
        "first",
        undefined,
        undefined,
      ),
    );
    rerender({ fileId: "second" });
    await waitFor(() =>
      expect(api.getFileNeighbors).toHaveBeenCalledWith(
        "second",
        undefined,
        undefined,
      ),
    );
  });

  it("does not fetch when fileId is null", async () => {
    const onNavigate = vi.fn();
    renderHook(
      () =>
        useFileNav({
          fileId: null,
          fileType: null,
          enabled: true,
          onNavigate,
        }),
      { wrapper: Wrapper },
    );
    await Promise.resolve();
    expect(api.getFileNeighbors).not.toHaveBeenCalled();
  });

  it("returns prevId / nextId from the fetched neighbors", async () => {
    const onNavigate = vi.fn();
    const { result } = renderHook(
      () =>
        useFileNav({
          fileId: "current",
          fileType: "document",
          enabled: true,
          onNavigate,
        }),
      { wrapper: Wrapper },
    );
    await waitFor(() =>
      expect(result.current.prevId).toBe("prev1"),
    );
    expect(result.current.nextId).toBe("next1");
  });
});
