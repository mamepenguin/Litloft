import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import { CollectionDetail } from "../CollectionDetail";
import type { FileItem } from "@/types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
}));

const selectFileSpy = vi.fn();
vi.mock("@/hooks/useSelectedFile", () => ({
  useSelectedFile: () => ({
    fileId: null,
    selectFile: selectFileSpy,
    clearFile: vi.fn(),
  }),
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

const setOverrideDriveSpy = vi.fn();
vi.mock("@/components/CurrentDriveProvider", () => ({
  useSetOverrideDrive: () => setOverrideDriveSpy,
}));

vi.mock("@/lib/api", () => ({
  getCollection: vi.fn(),
  updateCollection: vi.fn().mockResolvedValue({}),
  deleteCollection: vi.fn().mockResolvedValue(undefined),
  reorderCollectionItems: vi.fn().mockResolvedValue({}),
  removeCollectionItem: vi.fn().mockResolvedValue(undefined),
}));

import * as api from "@/lib/api";
const apiMocks = {
  getCollection: vi.mocked(api.getCollection),
  updateCollection: vi.mocked(api.updateCollection),
  deleteCollection: vi.mocked(api.deleteCollection),
  reorderCollectionItems: vi.mocked(api.reorderCollectionItems),
  removeCollectionItem: vi.mocked(api.removeCollectionItem),
};

// FileGrid / FileList both render the title text we assert on; stub them
// for speed and to avoid pulling in their context-menu trees.
vi.mock("@/components/folder/TwoPaneLayout", () => ({
  TwoPaneLayout: ({
    children,
    leftPane,
  }: {
    children: React.ReactNode;
    leftPane?: React.ReactNode;
    drive?: string;
    folderPath?: string;
    leftPaneAriaLabel?: string;
  }) => (
    <>
      <aside data-testid="left-pane">{leftPane}</aside>
      <section data-testid="right-pane">{children}</section>
    </>
  ),
}));

vi.mock("@/components/CollectionItemsPane", () => ({
  CollectionItemsPane: ({ items }: { items: Array<{ id: number }> }) => (
    <div data-testid="items-pane">items:{items.length}</div>
  ),
}));

vi.mock("@/components/TreeToggle", () => ({
  TreeToggle: () => <button data-testid="tree-toggle">tree</button>,
}));

vi.mock("@/components/FileGrid", () => ({
  FileGrid: ({ files }: { files: FileItem[] }) => (
    <div data-testid="file-grid">
      {files.map((f) => (
        <div key={f.id} data-testid="grid-row">
          {f.title}
        </div>
      ))}
    </div>
  ),
}));
vi.mock("@/components/FileList", () => ({
  FileList: ({ files }: { files: FileItem[] }) => (
    <div data-testid="file-list">
      {files.map((f) => (
        <div key={f.id} data-testid="list-row">
          {f.title}
        </div>
      ))}
    </div>
  ),
}));

function makeFile(
  id: string,
  type: FileItem["file_type"] = "document",
): FileItem {
  return {
    id,
    filename: `${id}.dat`,
    title: `File ${id}`,
    description: "",
    drive: "main",
    folder_path: "",
    file_type: type,
    mime_type: "application/octet-stream",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 100,
    duration: null,
    likes: 0,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "",
    updated_at: "",
  };
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  mockPush.mockClear();
  setOverrideDriveSpy.mockClear();
  toastErrorSpy.mockClear();
  for (const fn of Object.values(apiMocks)) (fn as ReturnType<typeof vi.fn>).mockClear();
  apiMocks.getCollection.mockResolvedValue({
    id: "c1",
    name: "My Collection",
    description: "Hand-picked",
    drive: "main",
    items: [
      { id: 1, position: 0, file: makeFile("a", "document") },
      { id: 2, position: 1, file: makeFile("b", "audio") },
    ],
    created_at: "",
    updated_at: "",
  });
});

describe("CollectionDetail", () => {
  it("renders name + description + item count from the API", async () => {
    render(<CollectionDetail drive="main" collectionId="c1" />);
    expect(await screen.findByRole("heading", { name: "My Collection" })).toBeInTheDocument();
    expect(screen.getByText("Hand-picked")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
  });

  it("shows the Play button when the collection contains audio/video", async () => {
    render(<CollectionDetail drive="main" collectionId="c1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument(),
    );
  });

  it("hides the Play button for collections with no media items", async () => {
    apiMocks.getCollection.mockResolvedValueOnce({
      id: "c1",
      name: "Docs Only",
      description: null,
      drive: "main",
      items: [
        { id: 1, position: 0, file: makeFile("doc1", "document") },
      ],
      created_at: "",
      updated_at: "",
    });
    render(<CollectionDetail drive="main" collectionId="c1" />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Docs Only" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });

  it("navigates to the playback queue on Play click, starting at the first media item", async () => {
    render(<CollectionDetail drive="main" collectionId="c1" />);
    const play = await screen.findByRole("button", { name: "Play" });
    fireEvent.click(play);
    expect(mockPush).toHaveBeenCalledWith("/files/b?collection=c1");
  });

  it("renders FileGrid by default and switches to FileList via the toggle", async () => {
    render(<CollectionDetail drive="main" collectionId="c1" />);
    await waitFor(() => expect(screen.getByTestId("file-grid")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("List view"));
    expect(screen.getByTestId("file-list")).toBeInTheDocument();
  });

  it("persists a description edit through updateCollection", async () => {
    render(<CollectionDetail drive="main" collectionId="c1" />);
    const desc = await screen.findByText("Hand-picked");
    fireEvent.click(desc);
    const textarea = screen.getByPlaceholderText("Add description...");
    fireEvent.change(textarea, { target: { value: "Updated" } });
    fireEvent.blur(textarea);
    await waitFor(() =>
      expect(apiMocks.updateCollection).toHaveBeenCalledWith("main", "c1", {
        description: "Updated",
      }),
    );
  });

  it("mounts CollectionItemsPane in the left pane with all items", async () => {
    render(<CollectionDetail drive="main" collectionId="c1" />);
    expect(await screen.findByTestId("items-pane")).toHaveTextContent(
      "items:2",
    );
  });

  it("renders the not-found state when the API returns an error", async () => {
    apiMocks.getCollection.mockRejectedValueOnce(new Error("404"));
    render(<CollectionDetail drive="main" collectionId="c1" />);
    expect(await screen.findByText("Collection not found")).toBeInTheDocument();
  });

  it("surfaces a toast when description save fails", async () => {
    apiMocks.updateCollection.mockRejectedValueOnce(new Error("500"));
    render(<CollectionDetail drive="main" collectionId="c1" />);
    const desc = await screen.findByText("Hand-picked");
    fireEvent.click(desc);
    const textarea = screen.getByPlaceholderText("Add description...");
    fireEvent.change(textarea, { target: { value: "Updated" } });
    fireEvent.blur(textarea);
    await waitFor(() =>
      expect(toastErrorSpy).toHaveBeenCalledWith("Failed to save description"),
    );
  });

  it("auto-detects list view for a markdown-heavy collection", async () => {
    apiMocks.getCollection.mockResolvedValueOnce({
      id: "c1",
      name: "Notes",
      description: null,
      drive: "main",
      items: [
        {
          id: 1,
          position: 0,
          file: { ...makeFile("a", "document"), mime_type: "text/markdown", filename: "a.md" },
        },
        {
          id: 2,
          position: 1,
          file: { ...makeFile("b", "document"), mime_type: "text/markdown", filename: "b.md" },
        },
      ],
      created_at: "",
      updated_at: "",
    });
    render(<CollectionDetail drive="main" collectionId="c1" />);
    expect(await screen.findByTestId("file-list")).toBeInTheDocument();
    expect(screen.queryByTestId("file-grid")).toBeNull();
  });
});
