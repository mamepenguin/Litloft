import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useUpload, type UploadFileEntry } from "../useUpload";

vi.mock("@/lib/api", () => ({
  initUpload: vi.fn().mockResolvedValue({ upload_id: "u1", total_chunks: 1 }),
  uploadChunk: vi.fn().mockResolvedValue({}),
  completeUpload: vi.fn().mockResolvedValue({}),
  cancelUpload: vi.fn().mockResolvedValue({}),
}));

describe("useUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("addFiles creates uploads with empty relativePath", () => {
    const { result } = renderHook(() => useUpload("drive1", "/path"));

    const file = new File(["data"], "test.txt", { type: "text/plain" });
    act(() => {
      result.current.addFiles([file]);
    });

    expect(result.current.uploads).toHaveLength(1);
    expect(result.current.uploads[0].filename).toBe("test.txt");
    expect(result.current.uploads[0].relativePath).toBe("");
  });

  it("addFileEntries creates uploads with relative paths", () => {
    const { result } = renderHook(() => useUpload("drive1", "/path"));

    const file1 = new File(["data1"], "a.txt", { type: "text/plain" });
    const file2 = new File(["data2"], "b.txt", { type: "text/plain" });
    const entries: UploadFileEntry[] = [
      { file: file1, relativePath: "folder/a.txt" },
      { file: file2, relativePath: "folder/sub/b.txt" },
    ];

    act(() => {
      result.current.addFileEntries(entries);
    });

    expect(result.current.uploads).toHaveLength(2);
    expect(result.current.uploads[0].filename).toBe("a.txt");
    expect(result.current.uploads[0].relativePath).toBe("folder/a.txt");
    expect(result.current.uploads[1].filename).toBe("b.txt");
    expect(result.current.uploads[1].relativePath).toBe("folder/sub/b.txt");
  });

  it("addFileEntries passes relative_path to initUpload", async () => {
    const { initUpload } = await import("@/lib/api");

    const { result } = renderHook(() => useUpload("drive1", "/path"));

    const file = new File(["data"], "a.txt", { type: "text/plain" });
    const entries: UploadFileEntry[] = [
      { file, relativePath: "myfolder/a.txt" },
    ];

    act(() => {
      result.current.addFileEntries(entries);
    });

    // Wait for async processing
    await vi.waitFor(() => {
      expect(initUpload).toHaveBeenCalledWith("drive1", expect.objectContaining({
        relative_path: "myfolder/a.txt",
      }));
    });
  });

  it("addFiles passes empty relative_path to initUpload", async () => {
    const { initUpload } = await import("@/lib/api");

    const { result } = renderHook(() => useUpload("drive1", "/path"));

    const file = new File(["data"], "test.txt", { type: "text/plain" });
    act(() => {
      result.current.addFiles([file]);
    });

    await vi.waitFor(() => {
      expect(initUpload).toHaveBeenCalledWith("drive1", expect.objectContaining({
        relative_path: "",
      }));
    });
  });
});
