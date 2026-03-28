import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCreateFolder } from "../useCreateFolder";

vi.mock("@/lib/api", () => ({
  createFolder: vi.fn().mockResolvedValue({}),
}));

import { createFolder } from "@/lib/api";

describe("useCreateFolder", () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with default state", () => {
    const { result } = renderHook(() =>
      useCreateFolder("main", undefined, onComplete)
    );
    expect(result.current.creatingFolder).toBe(false);
    expect(result.current.newFolderName).toBe("");
    expect(result.current.folderError).toBeNull();
  });

  it("creates folder successfully", async () => {
    const { result } = renderHook(() =>
      useCreateFolder("main", "photos", onComplete)
    );
    act(() => {
      result.current.setNewFolderName("vacation");
    });
    await act(async () => {
      await result.current.handleCreateFolder();
    });
    expect(createFolder).toHaveBeenCalledWith("main", "photos", "vacation");
    expect(onComplete).toHaveBeenCalled();
    expect(result.current.newFolderName).toBe("");
    expect(result.current.creatingFolder).toBe(false);
  });

  it("does nothing when name is empty", async () => {
    const { result } = renderHook(() =>
      useCreateFolder("main", undefined, onComplete)
    );
    await act(async () => {
      await result.current.handleCreateFolder();
    });
    expect(createFolder).not.toHaveBeenCalled();
  });

  it("rejects name with slash", async () => {
    const { result } = renderHook(() =>
      useCreateFolder("main", undefined, onComplete)
    );
    act(() => {
      result.current.setNewFolderName("bad/name");
    });
    await act(async () => {
      await result.current.handleCreateFolder();
    });
    expect(result.current.folderError).toBe("無効なフォルダ名です");
    expect(createFolder).not.toHaveBeenCalled();
  });

  it("rejects name with backslash", async () => {
    const { result } = renderHook(() =>
      useCreateFolder("main", undefined, onComplete)
    );
    act(() => {
      result.current.setNewFolderName("bad\\name");
    });
    await act(async () => {
      await result.current.handleCreateFolder();
    });
    expect(result.current.folderError).toBe("無効なフォルダ名です");
  });

  it("rejects dot-dot name", async () => {
    const { result } = renderHook(() =>
      useCreateFolder("main", undefined, onComplete)
    );
    act(() => {
      result.current.setNewFolderName("..");
    });
    await act(async () => {
      await result.current.handleCreateFolder();
    });
    expect(result.current.folderError).toBe("無効なフォルダ名です");
  });

  it("rejects hidden folder name starting with dot", async () => {
    const { result } = renderHook(() =>
      useCreateFolder("main", undefined, onComplete)
    );
    act(() => {
      result.current.setNewFolderName(".hidden");
    });
    await act(async () => {
      await result.current.handleCreateFolder();
    });
    expect(result.current.folderError).toBe("無効なフォルダ名です");
  });

  it("rejects name longer than 255 chars", async () => {
    const { result } = renderHook(() =>
      useCreateFolder("main", undefined, onComplete)
    );
    act(() => {
      result.current.setNewFolderName("a".repeat(256));
    });
    await act(async () => {
      await result.current.handleCreateFolder();
    });
    expect(result.current.folderError).toBe("フォルダ名が長すぎます");
  });

  it("sets error on API failure", async () => {
    vi.mocked(createFolder).mockRejectedValueOnce(new Error("fail"));
    const { result } = renderHook(() =>
      useCreateFolder("main", undefined, onComplete)
    );
    act(() => {
      result.current.setNewFolderName("valid");
    });
    await act(async () => {
      await result.current.handleCreateFolder();
    });
    expect(result.current.folderError).toBe("フォルダの作成に失敗しました");
  });

  it("trims whitespace from folder name", async () => {
    const { result } = renderHook(() =>
      useCreateFolder("main", "", onComplete)
    );
    act(() => {
      result.current.setNewFolderName("  trimmed  ");
    });
    await act(async () => {
      await result.current.handleCreateFolder();
    });
    expect(createFolder).toHaveBeenCalledWith("main", "", "trimmed");
  });
});
