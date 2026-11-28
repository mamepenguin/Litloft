/**
 * SPEC-CORE-190 §2 / I14: what the collection queue shows while the
 * collection is loading and while a same-page write is read again. The page
 * spinner belongs to the first load only; a re-read keeps the old rows and
 * the open file.
 */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emitCollectionChanged } from "@/lib/collectionChanged";
import type { CollectionDetail as CollectionDetailType, FileItem } from "@/types";

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
const route = { pathname: "/drive/main/collections/c1" };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => route.pathname,
}));

const selection = vi.hoisted(() => ({
  fileId: "v4" as string | null,
  selectFile: vi.fn(),
  clearFile: vi.fn(),
}));
vi.mock("@/hooks/useSelectedFile", () => ({ useSelectedFile: () => selection }));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/components/CurrentDriveProvider", () => ({
  useSetOverrideDrive: () => vi.fn(),
}));

vi.mock("@/components/folder/TwoPaneLayout", () => ({
  TwoPaneLayout: ({ children, leftPane }: { children: React.ReactNode; leftPane?: React.ReactNode }) => (
    <>
      <aside>{leftPane}</aside>
      <section>{children}</section>
    </>
  ),
}));

vi.mock("@/components/FileGrid", () => ({
  FileGrid: ({ files }: { files: FileItem[] }) => <div data-testid="grid" data-ids={files.map((f) => f.id).join(",")} />,
}));
vi.mock("@/components/FileList", () => ({
  FileList: ({ files }: { files: FileItem[] }) => <div data-testid="list" data-ids={files.map((f) => f.id).join(",")} />,
}));
vi.mock("@/components/ImageGallery", () => ({ ImageGallery: () => null }));

const api = vi.hoisted(() => ({ getCollection: vi.fn() }));
vi.mock("@/lib/api", () => ({
  getCollection: api.getCollection,
  updateCollection: vi.fn().mockResolvedValue({}),
  deleteCollection: vi.fn().mockResolvedValue(undefined),
  reorderCollectionItems: vi.fn().mockResolvedValue({}),
  removeCollectionItem: vi.fn().mockResolvedValue(undefined),
  setHomeShortcut: vi.fn().mockResolvedValue(undefined),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

import { CollectionDetail } from "../CollectionDetail";

function makeFile(id: string, type: FileItem["file_type"], extra: Partial<FileItem> = {}): FileItem {
  return {
    image_width: null,
    image_height: null,
    id,
    filename: `${id}.dat`,
    title: `File ${id}`,
    description: "",
    drive: "main",
    folder_path: "elsewhere",
    file_type: type,
    mime_type: type === "video" ? "video/mp4" : "text/plain",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 100,
    duration: type === "video" ? 60 : null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "",
    updated_at: "",
    modified_at: null,
    ...extra,
  };
}

function collection(ids: string[]): CollectionDetailType {
  return {
    id: "c1",
    name: "Road Trip",
    description: null,
    drive: "main",
    items: ids.map((id, position) => ({
      id: position + 1,
      position,
      file: makeFile(id, id.startsWith("v") ? "video" : "document"),
    })),
    created_at: "",
    updated_at: "",
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function positionIn(root: HTMLElement): string | null {
  const hit = [...root.querySelectorAll("*")].find((el) =>
    /^(\d+|–) \/ (\d+|–)$/.test((el.textContent ?? "").trim()),
  );
  return hit ? (hit.textContent ?? "").trim() : null;
}

function pane(): HTMLElement {
  return document.querySelector("aside")!;
}

function spinnerShown(): boolean {
  return document.querySelector(".animate-spin") !== null;
}

beforeEach(() => {
  api.getCollection.mockReset();
  selection.fileId = "v4";
  selection.selectFile.mockClear();
  selection.clearFile.mockClear();
  router.push.mockClear();
  router.replace.mockClear();
  route.pathname = "/drive/main/collections/c1";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-190 the collection queue's loading and re-reading states", () => {
  it("shows the page spinner on the first load and no queue until the collection arrives", async () => {
    const first = deferred<CollectionDetailType>();
    api.getCollection.mockReturnValue(first.promise);
    render(<CollectionDetail drive="main" collectionId="c1" />);

    expect(spinnerShown()).toBe(true);
    expect(screen.queryByText("File v4")).toBeNull();

    await act(async () => first.resolve(collection(["d1", "v2", "a3", "v4", "i5"])));
    await waitFor(() => expect(screen.getByText("File v4")).toBeInTheDocument());
    expect(spinnerShown()).toBe(false);
    expect(positionIn(pane())).toBe("4 / 5");
  });

  it("keeps the old rows and n / N while a same-page write is read again, with no spinner", async () => {
    api.getCollection.mockResolvedValueOnce(collection(["d1", "v2", "a3", "v4", "i5"]));
    render(<CollectionDetail drive="main" collectionId="c1" />);
    await waitFor(() => expect(positionIn(pane())).toBe("4 / 5"));

    const again = deferred<CollectionDetailType>();
    api.getCollection.mockReturnValueOnce(again.promise);
    act(() => emitCollectionChanged({ drive: "main", collectionId: "c1" }));

    await waitFor(() => expect(api.getCollection).toHaveBeenCalledTimes(2));
    expect(spinnerShown()).toBe(false);
    expect(positionIn(pane())).toBe("4 / 5");
    expect(within(pane()).getByText("File v4")).toBeInTheDocument();

    await act(async () =>
      again.resolve(collection(["d1", "v2", "a3", "v4", "i5", "zz"])),
    );
    await waitFor(() => expect(positionIn(pane())).toBe("4 / 6"));
    expect(within(pane()).getByText("File zz")).toBeInTheDocument();
    expect(screen.getByText("File v4")).toBeInTheDocument();
  });

  it("keeps the old rows and says nothing when the re-read fails", async () => {
    api.getCollection.mockResolvedValueOnce(collection(["d1", "v2", "a3", "v4", "i5"]));
    render(<CollectionDetail drive="main" collectionId="c1" />);
    await waitFor(() => expect(positionIn(pane())).toBe("4 / 5"));

    const again = deferred<CollectionDetailType>();
    api.getCollection.mockReturnValueOnce(again.promise);
    act(() => emitCollectionChanged({ drive: "main", collectionId: "c1" }));
    await waitFor(() => expect(api.getCollection).toHaveBeenCalledTimes(2));

    await act(async () => again.reject(new Error("boom")));
    expect(spinnerShown()).toBe(false);
    expect(screen.queryByText("Collection not found")).toBeNull();
    expect(positionIn(pane())).toBe("4 / 5");
    expect(within(pane()).getByText("File v4")).toBeInTheDocument();
  });

  it("ignores a write for another drive or another collection", async () => {
    api.getCollection.mockResolvedValue(collection(["d1", "v2", "a3", "v4", "i5"]));
    render(<CollectionDetail drive="main" collectionId="c1" />);
    await waitFor(() => expect(positionIn(pane())).toBe("4 / 5"));

    act(() => emitCollectionChanged({ drive: "other", collectionId: "c1" }));
    act(() => emitCollectionChanged({ drive: "main", collectionId: "c2" }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(api.getCollection).toHaveBeenCalledTimes(1);
  });
});
