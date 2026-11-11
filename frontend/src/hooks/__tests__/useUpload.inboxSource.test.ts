/**
 * SPEC-CORE-032 I2 — the upload store is the one place every uploading
 * entry point hands its files to, so the arrival marker is sent once, here.
 */

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { resetUploadStore, useUpload, type UploadFileEntry } from "../useUpload";

vi.mock("@/lib/api", () => ({
  initUpload: vi.fn().mockResolvedValue({ upload_id: "u1", total_chunks: 1 }),
  uploadChunk: vi.fn().mockResolvedValue({}),
  completeUpload: vi.fn().mockResolvedValue({ id: "f1" }),
  cancelUpload: vi.fn().mockResolvedValue({}),
  getFilesProcessing: vi.fn().mockResolvedValue({ files: {} }),
}));

async function initCalls() {
  const { initUpload } = await import("@/lib/api");
  await vi.waitFor(() =>
    expect(vi.mocked(initUpload).mock.calls.length).toBeGreaterThan(0),
  );
  return vi.mocked(initUpload).mock.calls as [
    string,
    Record<string, unknown>,
  ][];
}

function file(name: string): File {
  return new File(["x"], name, { type: "text/plain" });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetUploadStore();
});

describe("SPEC-CORE-032 I2 the upload store marks every upload an arrival", () => {
  it("SPEC-CORE-032 I2 sends inbox_source from the upload zone's file list", async () => {
    const { result } = renderHook(() => useUpload());
    act(() => result.current.addFiles("main", "recipes", [file("a.txt")]));

    const [drive, body] = (await initCalls())[0];
    expect(drive).toBe("main");
    expect(body.folder_path).toBe("recipes");
    expect(body.inbox_source).toBe("upload");
  });

  it("SPEC-CORE-032 I2 sends it for a folder upload, once per file, with the relative path", async () => {
    const { result } = renderHook(() => useUpload());
    const entries: UploadFileEntry[] = [
      { file: file("a.txt"), relativePath: "folder/a.txt" },
      { file: file("b.txt"), relativePath: "folder/sub/b.txt" },
    ];
    act(() => result.current.addFileEntries("main", "", entries));

    const calls = await vi.waitFor(async () => {
      const { initUpload } = await import("@/lib/api");
      expect(vi.mocked(initUpload).mock.calls).toHaveLength(2);
      return vi.mocked(initUpload).mock.calls as [string, Record<string, unknown>][];
    });

    expect(calls.map(([, body]) => body.relative_path)).toEqual([
      "folder/a.txt",
      "folder/sub/b.txt",
    ]);
    for (const [, body] of calls) {
      expect(body.inbox_source).toBe("upload");
    }
  });

  it("SPEC-CORE-032 I2 marks each file of a multi-file drop", async () => {
    const { result } = renderHook(() => useUpload());
    act(() =>
      result.current.addFiles("main", "", [file("a.txt"), file("b.txt"), file("c.txt")]),
    );

    await vi.waitFor(async () => {
      const { initUpload } = await import("@/lib/api");
      expect(vi.mocked(initUpload).mock.calls).toHaveLength(3);
    });
    const { initUpload } = await import("@/lib/api");
    for (const [, body] of vi.mocked(initUpload).mock.calls as [
      string,
      Record<string, unknown>,
    ][]) {
      expect(body.inbox_source).toBe("upload");
    }
  });

  it("SPEC-CORE-032 I2 sends nothing but the upload source from this store", async () => {
    const { result } = renderHook(() => useUpload());
    act(() => result.current.addFiles("main", "", [file("a.txt")]));

    const [, body] = (await initCalls())[0];
    expect(body.inbox_source).toBe("upload");
    expect(Object.keys(body)).not.toContain("arrival");
  });
});
