import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useTextViewer } from "../useTextViewer";
import type { ArchiveEntry } from "@/types";

vi.mock("@/lib/api", () => ({
  getArchiveEntryUrl: (fileId: string, path: string) =>
    `/api/files/${fileId}/archive/entry?path=${encodeURIComponent(path)}`,
}));

const textEntry: ArchiveEntry = {
  path: "readme.txt",
  filename: "readme.txt",
  file_size: 500,
  compressed_size: 200,
  file_type: "document",
  mime_type: "text/plain",
  is_dir: false,
};

describe("useTextViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes with null content and no loading", () => {
    const { result } = renderHook(() =>
      useTextViewer("listing", null, "file-1")
    );
    expect(result.current.textContent).toBeNull();
    expect(result.current.textLoading).toBe(false);
    expect(result.current.textError).toBeNull();
    expect(result.current.textConfirmed).toBe(false);
  });

  it("does not fetch when viewMode is not text", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderHook(() => useTextViewer("listing", textEntry, "file-1"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not fetch when textConfirmed is false", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderHook(() => useTextViewer("text", textEntry, "file-1"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches text content when confirmed", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Hello, World!", { status: 200 })
    );
    const { result } = renderHook(() =>
      useTextViewer("text", textEntry, "file-1")
    );

    act(() => {
      result.current.setTextConfirmed(true);
    });

    await waitFor(() => {
      expect(result.current.textContent).toBe("Hello, World!");
    });
    expect(result.current.textLoading).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("sets error on fetch failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500, statusText: "Internal Server Error" })
    );
    const { result } = renderHook(() =>
      useTextViewer("text", textEntry, "file-1")
    );

    act(() => {
      result.current.setTextConfirmed(true);
    });

    await waitFor(() => {
      expect(result.current.textError).toBe("500 Internal Server Error");
    });
    expect(result.current.textContent).toBeNull();
  });

  it("does not fetch when viewingEntry is null", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() =>
      useTextViewer("text", null, "file-1")
    );
    act(() => {
      result.current.setTextConfirmed(true);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
