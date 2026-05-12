import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCollectionManagement } from "../useCollectionManagement";
import type { CollectionSummary } from "@/types";

vi.mock("@/lib/api", () => ({
  createCollection: vi.fn().mockResolvedValue({}),
  updateCollection: vi.fn().mockResolvedValue({}),
  deleteCollection: vi.fn().mockResolvedValue({}),
  getCollections: vi.fn().mockResolvedValue([]),
}));

const { toastErrorSpy } = vi.hoisted(() => ({
  toastErrorSpy: vi.fn(),
}));
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({
    error: toastErrorSpy,
    success: vi.fn(),
    info: vi.fn(),
  }),
}));

import { createCollection, updateCollection, deleteCollection, getCollections } from "@/lib/api";

const mockPush = vi.fn();
const mockRouter = {
  push: mockPush,
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
} as any;

const makeCol = (
  id: string,
  name: string,
  itemCount = 0,
  firstFileId: string | null = null,
): CollectionSummary => ({
  id,
  name,
  description: null,
  drive: "main",
  item_count: itemCount,
  first_file_id: firstFileId,
  created_at: "",
  updated_at: "",
});

describe("useCollectionManagement", () => {
  const close = vi.fn();
  const setOverrideDrive = vi.fn();
  let collectionList: CollectionSummary[];
  let setCollectionList: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    toastErrorSpy.mockClear();
    collectionList = [makeCol("c1", "Collection 1", 3)];
    setCollectionList = vi.fn();
  });

  function renderCM() {
    return renderHook(() =>
      useCollectionManagement({
        currentDrive: "main",
        collectionList,
        setCollectionList,
        close,
        router: mockRouter,
        setOverrideDrive,
      })
    );
  }

  it("initializes with no creating/renaming state", () => {
    const { result } = renderCM();
    expect(result.current.creatingCollection).toBe(false);
    expect(result.current.renamingId).toBeNull();
    expect(result.current.contextMenu).toBeNull();
  });

  it("creates a collection and refreshes list", async () => {
    const updated = [makeCol("c1", "Collection 1"), makeCol("c2", "New")];
    vi.mocked(getCollections).mockResolvedValueOnce(updated);
    const { result } = renderCM();

    act(() => {
      result.current.setNewCollectionName("New");
    });

    await act(async () => {
      await result.current.handleCreateCollection();
    });

    expect(createCollection).toHaveBeenCalledWith("main", "New");
    expect(setCollectionList).toHaveBeenCalledWith(updated);
    expect(result.current.creatingCollection).toBe(false);
    expect(result.current.newCollectionName).toBe("");
  });

  it("does not create with empty name", async () => {
    const { result } = renderCM();

    await act(async () => {
      await result.current.handleCreateCollection();
    });

    expect(createCollection).not.toHaveBeenCalled();
  });

  it("trims whitespace from new collection name", async () => {
    vi.mocked(getCollections).mockResolvedValueOnce([]);
    const { result } = renderCM();

    act(() => {
      result.current.setNewCollectionName("  Trimmed  ");
    });

    await act(async () => {
      await result.current.handleCreateCollection();
    });

    expect(createCollection).toHaveBeenCalledWith("main", "Trimmed");
  });

  it("renames a collection and refreshes list", async () => {
    const updated = [makeCol("c1", "Renamed")];
    vi.mocked(getCollections).mockResolvedValueOnce(updated);
    const { result } = renderCM();

    act(() => {
      result.current.setRenamingId("c1");
      result.current.setRenameValue("Renamed");
    });

    await act(async () => {
      await result.current.handleRenameCollection();
    });

    expect(updateCollection).toHaveBeenCalledWith("main", "c1", { name: "Renamed" });
    expect(setCollectionList).toHaveBeenCalledWith(updated);
    expect(result.current.renamingId).toBeNull();
  });

  it("does not rename with empty value", async () => {
    const { result } = renderCM();

    act(() => {
      result.current.setRenamingId("c1");
      result.current.setRenameValue("");
    });

    await act(async () => {
      await result.current.handleRenameCollection();
    });

    expect(updateCollection).not.toHaveBeenCalled();
  });

  it("deletes a collection and refreshes list", async () => {
    vi.mocked(getCollections).mockResolvedValueOnce([]);
    const { result } = renderCM();

    await act(async () => {
      await result.current.handleDeleteCollection("c1");
    });

    expect(deleteCollection).toHaveBeenCalledWith("main", "c1");
    expect(setCollectionList).toHaveBeenCalledWith([]);
    expect(result.current.contextMenu).toBeNull();
  });

  it("navigates to the collection detail page on click", () => {
    const { result } = renderCM();

    act(() => {
      result.current.handleCollectionClick(makeCol("c1", "Test", 2, "file-1"));
    });

    expect(setOverrideDrive).toHaveBeenCalledWith("main");
    expect(close).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/drive/main/collections/c1");
  });

  it("navigates to the detail page even for empty collections", () => {
    const { result } = renderCM();

    act(() => {
      result.current.handleCollectionClick(makeCol("c1", "Test", 0));
    });

    expect(mockPush).toHaveBeenCalledWith("/drive/main/collections/c1");
  });

  it("surfaces a toast when create fails", async () => {
    vi.mocked(createCollection).mockRejectedValueOnce(new Error("409"));
    const { result } = renderCM();

    act(() => {
      result.current.setNewCollectionName("Dup");
    });

    await act(async () => {
      await result.current.handleCreateCollection();
    });

    expect(toastErrorSpy).toHaveBeenCalledWith("Failed to create collection");
  });

  it("surfaces a toast when rename fails", async () => {
    vi.mocked(updateCollection).mockRejectedValueOnce(new Error("409"));
    const { result } = renderCM();

    act(() => {
      result.current.setRenamingId("c1");
      result.current.setRenameValue("Conflict");
    });

    await act(async () => {
      await result.current.handleRenameCollection();
    });

    expect(toastErrorSpy).toHaveBeenCalledWith(
      "Failed to rename collection (the name may already be in use)",
    );
  });

  it("surfaces a toast when delete fails", async () => {
    vi.mocked(deleteCollection).mockRejectedValueOnce(new Error("500"));
    const { result } = renderCM();

    await act(async () => {
      await result.current.handleDeleteCollection("c1");
    });

    expect(toastErrorSpy).toHaveBeenCalledWith("Failed to delete collection");
  });

  it("does nothing when currentDrive is null", async () => {
    const { result } = renderHook(() =>
      useCollectionManagement({
        currentDrive: null,
        collectionList: [],
        setCollectionList,
        close,
        router: mockRouter,
        setOverrideDrive,
      })
    );

    act(() => {
      result.current.setNewCollectionName("Test");
    });

    await act(async () => {
      await result.current.handleCreateCollection();
    });

    expect(createCollection).not.toHaveBeenCalled();
  });
});
