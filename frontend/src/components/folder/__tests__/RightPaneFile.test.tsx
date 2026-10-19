import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _resetFileSeedForTests, seedFiles } from "@/lib/fileSeed";

// `mockGetFile` answers the shared request, which is the only one a host
// may make; `mockGetFileDirect` is there to show it made no other.
const mockGetFile = vi.fn();
const mockGetFileDirect = vi.fn();
vi.mock("@/lib/api", () => ({
  getFile: (...args: unknown[]) => mockGetFileDirect(...args),
  getFileShared: (...args: unknown[]) => mockGetFile(...args),
  getFileNeighbors: vi.fn().mockResolvedValue({ prev_id: null, next_id: null }),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  recordFileView: vi.fn(),
  likeFile: vi.fn(),
  dislikeFile: vi.fn(),
  updateFile: vi.fn(),
}));

const mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/drive/work/Q1",
  useParams: () => ({}),
}));

const fileDetailProps: Array<Record<string, unknown>> = [];
// The stub reads the file-nav context because the real consumer is four
// components below this slot and is not mounted.
vi.mock("@/components/FileDetailContent", async () => {
  const { useFileNavState } = await import("@/lib/fileNavContext");
  return {
    FileDetailContent: (props: Record<string, unknown>) => {
      fileDetailProps.push(props);
      const nav = useFileNavState();
      return (
        <div data-testid="file-detail-content">
          detail:{props.fileId as string}
          {nav && (
            <span data-testid="published-walk">
              {nav.position ?? "-"}/{nav.total ?? "-"}:{nav.prevId ?? "-"}:
              {nav.nextId ?? "-"}
            </span>
          )}
        </div>
      );
    },
  };
});

const imageGalleryProps: Array<Record<string, unknown>> = [];
vi.mock("@/components/ImageGallery", () => ({
  ImageGallery: (props: Record<string, unknown>) => {
    imageGalleryProps.push(props);
    return (
      <div data-testid="image-gallery">
        gallery:{props.open ? "open" : "closed"}
      </div>
    );
  },
}));

// TreeToggle pulls in useTreeEnabled (localStorage); stub it.
vi.mock("@/components/TreeToggle", () => ({
  TreeToggle: () => <button data-testid="tree-toggle">tree</button>,
}));

// `vi.mock` factories are not type-checked, and an incomplete one hands
// `undefined` to the provider. All six fields, deliberately.
const fileNavResult = {
  prevId: null as string | null,
  nextId: null as string | null,
  position: null as number | null,
  total: null as number | null,
  navigatePrev: vi.fn(),
  navigateNext: vi.fn(),
};
const useFileNavMock = vi.fn(
  (_opts: {
    sort?: string;
    order?: string;
    countable?: boolean;
    mimeType?: string | null;
  }) =>
    fileNavResult,
);
vi.mock("@/hooks/useFileNav", () => ({
  useFileNav: (opts: Record<string, unknown>) =>
    useFileNavMock(opts as Parameters<typeof useFileNavMock>[0]),
}));

const mockClearFile = vi.fn();
const mockSelectFile = vi.fn();
vi.mock("@/hooks/useSelectedFile", () => ({
  useSelectedFile: () => ({
    fileId: null,
    selectFile: mockSelectFile,
    clearFile: mockClearFile,
  }),
}));

import { RightPaneFile } from "../RightPaneFile";

// Default fixture is a plain-text document, a kind that does not bring its
// own page header.
const baseFile = {
  id: "abc123",
  filename: "doc.txt",
  title: "My Document",
  description: "",
  drive: "work",
  folder_path: "Q1",
  file_type: "document" as const,
  mime_type: "text/plain",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 100,
  duration: null,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified" as const,
  trust_reviewed_at: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
  image_width: null,
  image_height: null,
};

beforeEach(() => {
  mockGetFile.mockReset();
  mockGetFileDirect.mockReset();
  mockClearFile.mockReset();
  mockSelectFile.mockReset();
  fileDetailProps.length = 0;
  imageGalleryProps.length = 0;
  for (const k of Array.from(mockSearchParams.keys())) {
    mockSearchParams.delete(k);
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RightPaneFile", () => {
  it("renders FileDetailContent without waiting for the file", () => {
    mockGetFile.mockReturnValue(new Promise(() => {}));
    render(<RightPaneFile fileId="abc123" drive="work" />);
    expect(screen.getByTestId("file-detail-content")).toHaveTextContent(
      "detail:abc123",
    );
    expect(screen.queryByText("Loading...")).toBeNull();
  });

  it("suppresses the PaneShell header for Markdown files (DocumentLayout owns chrome)", async () => {
    mockGetFile.mockResolvedValue({
      ...baseFile,
      filename: "note.md",
      mime_type: "text/markdown",
    });
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
    );
    expect(screen.queryByText("My Document")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /back to tree/i }),
    ).toBeNull();
  });

  it("suppresses the header for a PDF too, now that it brings its own", async () => {
    for (const file of [
      { filename: "paper.pdf", mime_type: "application/pdf", file_type: "document" },
      { filename: "comic.cbz", mime_type: "application/x-zip-compressed", file_type: "archive" },
      { filename: "photo.jpg", mime_type: "image/jpeg", file_type: "image" },
    ]) {
      mockGetFile.mockResolvedValue({ ...baseFile, ...file });
      const view = render(<RightPaneFile fileId="abc123" drive="work" />);
      await waitFor(() =>
        expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
      );
      expect(screen.queryByText("My Document")).toBeNull();
      view.unmount();
    }
  });

  it("does NOT render an 'Open details' link (the right pane IS the detail page now)", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Open details")).toBeNull();
    expect(screen.queryByRole("link", { name: /open details/i })).toBeNull();
  });

  it("shows error state when fetch fails", async () => {
    mockGetFile.mockRejectedValue(new Error("404"));
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByText("File not found")).toBeInTheDocument(),
    );
  });

  it("re-fetches when fileId prop changes", async () => {
    mockGetFile
      .mockResolvedValueOnce(baseFile)
      .mockResolvedValueOnce({ ...baseFile, id: "z9", title: "Other" });
    const { rerender } = render(
      <RightPaneFile fileId="abc123" drive="work" />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
    );
    rerender(<RightPaneFile fileId="z9" drive="work" />);
    await waitFor(() =>
      expect(screen.getByTestId("file-detail-content")).toHaveTextContent(
        "detail:z9",
      ),
    );
    expect(mockGetFile).toHaveBeenCalledTimes(2);
  });

  it("does NOT render a 'Back to tree' affordance (mobile back-gesture replaces it)", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /back to tree/i }),
    ).toBeNull();
  });

  it("forwards URL deep-link hints (?t=, ?page=, ?section=, ?highlight=) to FileDetailContent", async () => {
    mockSearchParams.set("t", "10");
    mockSearchParams.set("page", "5");
    mockSearchParams.set("section", "4");
    mockSearchParams.set("highlight", "match");
    mockGetFile.mockResolvedValue(baseFile);
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
    );
    const lastProps = fileDetailProps[fileDetailProps.length - 1];
    expect(lastProps.initialTime).toBe(10);
    expect(lastProps.initialPage).toBe(5);
    expect(lastProps.initialSection).toBe(4);
    expect(lastProps.highlight).toBe("match");
  });

  it("mounts ImageGallery once a file is loaded (closed by default)", async () => {
    mockGetFile.mockResolvedValue({
      ...baseFile,
      file_type: "image",
      mime_type: "image/png",
    });
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByTestId("image-gallery")).toBeInTheDocument(),
    );
    const lastProps = imageGalleryProps[imageGalleryProps.length - 1];
    expect(lastProps.open).toBe(false);
  });

  it("opens ImageGallery when FileDetailContent fires onRequestImageGallery", async () => {
    mockGetFile.mockResolvedValue({
      ...baseFile,
      file_type: "image",
      mime_type: "image/png",
    });
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
    );
    const lastProps = fileDetailProps[fileDetailProps.length - 1];
    const onRequest = lastProps.onRequestImageGallery as () => void;
    onRequest();
    await waitFor(() => {
      const galleryAfter = imageGalleryProps[imageGalleryProps.length - 1];
      expect(galleryAfter.open).toBe(true);
    });
  });

  it("passes a scroll-container element as miniPlayerRoot once attached", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
    );
    // After the second render (post ref attach), miniPlayerRoot should
    // be a real Element. Wait for that to propagate.
    await waitFor(() => {
      const last = fileDetailProps[fileDetailProps.length - 1];
      expect(last.miniPlayerRoot).toBeInstanceOf(Element);
    });
  });

  it("forwards onAfterDelete to clearFile (file removed → close right pane)", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
    );
    const lastProps = fileDetailProps[fileDetailProps.length - 1];
    const onAfterDelete = lastProps.onAfterDelete as () => void;
    onAfterDelete();
    expect(mockClearFile).toHaveBeenCalledTimes(1);
  });

  // `FileDetailContent` is stubbed here, so what is testable is whether
  // this host decides to draw a row at all.
  describe("the page row", () => {
    it("draws no row of its own while the file is still being fetched", () => {
      mockGetFile.mockReturnValue(new Promise(() => {}));
      render(<RightPaneFile fileId="abc123" drive="work" />);
      expect(screen.queryByTestId("file-detail-chrome")).toBeNull();
    });

    it("draws no row of its own once the file has resolved, whatever it is", async () => {
      for (const file of [
        baseFile,
        { ...baseFile, filename: "sheet.xlsx", mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        { ...baseFile, filename: "note.md", mime_type: "text/markdown" },
        { ...baseFile, filename: "paper.pdf", mime_type: "application/pdf" },
        { ...baseFile, filename: "clip.mp4", mime_type: "video/mp4", file_type: "video" as const },
        { ...baseFile, filename: "blob.bin", mime_type: "application/octet-stream", file_type: "other" as const },
      ]) {
        mockGetFile.mockResolvedValue(file);
        const view = render(<RightPaneFile fileId="abc123" drive="work" />);
        await waitFor(() =>
          expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
        );
        expect(
          screen.queryByTestId("file-detail-chrome"),
          file.filename,
        ).toBeNull();
        view.unmount();
      }
    });

    it("leaves it to the shell for a video too, on this surface", async () => {
      mockGetFile.mockResolvedValue({
        ...baseFile,
        filename: "clip.mp4",
        mime_type: "video/mp4",
        file_type: "video" as const,
      });
      render(<RightPaneFile fileId="abc123" drive="work" />);
      await waitFor(() =>
        expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
      );

      expect(screen.queryByTestId("file-detail-chrome")).toBeNull();
    });

    it("leaves the row to the shell for a file that brings one", async () => {
      // A Markdown note rides `FileDetailShell`, which draws this row
      // itself because it also owns the inspector toggle inside it.
      // Two of them would be two paths and two toggles.
      mockGetFile.mockResolvedValue({
        ...baseFile,
        filename: "note.md",
        mime_type: "text/markdown",
        file_type: "document",
      });
      render(<RightPaneFile fileId="abc123" drive="work" />);
      await waitFor(() =>
        expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
      );

      // The stub stands in for the whole shell, so the row it would have
      // drawn is not here either — what matters is that the host did not
      // add a second one.
      expect(screen.queryByTestId("file-detail-chrome")).toBeNull();
    });
  });
});

describe("RightPaneFile — the prev/next walk it publishes", () => {
  beforeEach(() => {
    useFileNavMock.mockClear();
    localStorage.clear();
    Object.assign(fileNavResult, {
      prevId: "before",
      nextId: "after",
      position: 12,
      total: 995,
    });
  });

  it("mounts the provider the page row reads", async () => {
    mockGetFile.mockResolvedValue({
      ...baseFile,
      filename: "DSC_0412.jpg",
      title: "DSC_0412",
      file_type: "image",
      mime_type: "image/jpeg",
      folder_path: "photos",
    });
    render(<RightPaneFile fileId="f1" drive="media" />);

    // The slot's occupant can read the walk, which is only true if the
    // host mounted the provider around it.
    expect(await screen.findByTestId("published-walk")).toHaveTextContent(
      "12/995:before:after",
    );
  });

  it("walks folder order for a hand-written updated_at sort", async () => {
    mockSearchParams.set("sort", "updated_at");
    mockSearchParams.set("order", "desc");
    mockSearchParams.set("nav", "folder");
    mockGetFile.mockResolvedValue({
      ...baseFile,
      filename: "note.md",
      file_type: "document",
      mime_type: "text/markdown",
      folder_path: "notes",
    });
    render(<RightPaneFile fileId="f1" drive="media" />);
    await screen.findByTestId("published-walk");

    const call = useFileNavMock.mock.calls.at(-1)![0];
    expect(call.sort).toBeUndefined();
    expect(call.countable).toBe(false);

    mockSearchParams.delete("sort");
    mockSearchParams.delete("order");
    mockSearchParams.delete("nav");
  });

  it("asks for the ordering the listing declared, and counts only what it marked", async () => {
    // Not `folderPrefs`: the drive root never writes it, so the arrows and
    // the full-screen gallery would walk two different orderings.
    mockSearchParams.set("sort", "title");
    mockSearchParams.set("order", "asc");
    mockSearchParams.set("nav", "folder");
    mockGetFile.mockResolvedValue({
      ...baseFile,
      filename: "DSC_0412.jpg",
      file_type: "image",
      mime_type: "image/jpeg",
      folder_path: "photos",
    });
    render(<RightPaneFile fileId="f1" drive="media" />);
    await screen.findByTestId("published-walk");

    const call = useFileNavMock.mock.calls.at(-1)![0];
    expect(call.sort).toBe("title");
    expect(call.order).toBe("asc");
    expect(call.countable).toBe(true);
    expect(call.mimeType).toBe("image/jpeg");

    mockSearchParams.delete("sort");
    mockSearchParams.delete("order");
    mockSearchParams.delete("nav");
  });
});

describe("RightPaneFile, the file it holds", () => {
  afterEach(() => {
    _resetFileSeedForTests();
  });

  it("asks through the shared request and nothing else", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByTestId("image-gallery")).toBeInTheDocument(),
    );
    expect(mockGetFile).toHaveBeenCalledTimes(1);
    expect(mockGetFileDirect).not.toHaveBeenCalled();
  });

  it("holds a list's copy before the answer arrives", () => {
    seedFiles([baseFile]);
    mockGetFile.mockReturnValue(new Promise(() => {}));
    render(<RightPaneFile fileId="abc123" drive="work" />);
    expect(screen.getByTestId("image-gallery")).toBeInTheDocument();
  });

  it("says the file is not there when it cannot be read, list copy or not", async () => {
    seedFiles([baseFile]);
    mockGetFile.mockRejectedValue(new Error("API error: 404"));
    render(<RightPaneFile fileId="abc123" drive="work" />);
    expect(await screen.findByText("File not found")).toBeInTheDocument();
  });

  it("ignores an answer for a file it has already left", async () => {
    let answerFirst: (f: unknown) => void = () => {};
    mockGetFile.mockImplementation((id: string) =>
      id === "abc123"
        ? new Promise((resolve) => {
            answerFirst = resolve;
          })
        : Promise.resolve({ ...baseFile, id: "xyz" }),
    );
    const { rerender } = render(<RightPaneFile fileId="abc123" drive="work" />);
    rerender(<RightPaneFile fileId="xyz" drive="work" />);
    await waitFor(() =>
      expect(imageGalleryProps.at(-1)?.file).toMatchObject({ id: "xyz" }),
    );
    await act(async () => {
      answerFirst(baseFile);
    });
    expect(imageGalleryProps.at(-1)?.file).toMatchObject({ id: "xyz" });
  });

  it("ignores a failure for a file it has already left", async () => {
    let failFirst: (e: unknown) => void = () => {};
    mockGetFile.mockImplementation((id: string) =>
      id === "abc123"
        ? new Promise((_resolve, reject) => {
            failFirst = reject;
          })
        : Promise.resolve({ ...baseFile, id: "xyz" }),
    );
    const { rerender } = render(<RightPaneFile fileId="abc123" drive="work" />);
    rerender(<RightPaneFile fileId="xyz" drive="work" />);
    await waitFor(() =>
      expect(screen.getByTestId("image-gallery")).toBeInTheDocument(),
    );
    await act(async () => {
      failFirst(new Error("API error: 404"));
    });
    expect(screen.queryByText("File not found")).toBeNull();
    expect(screen.getByTestId("file-detail-content")).toHaveTextContent("detail:xyz");
  });
});
