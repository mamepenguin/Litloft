import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";

import { _resetFileSeedForTests, seedFiles } from "@/lib/fileSeed";

// `mockGetFile` answers the shared request, which is the only one a host
// may make; `mockGetFileDirect` is there to show it made no other.
const mockGetFile = vi.fn();
const mockGetFileDirect = vi.fn();
vi.mock("@/lib/api", () => ({
  getFile: (...args: unknown[]) => mockGetFileDirect(...args),
  getFileShared: (...args: unknown[]) => mockGetFile(...args),
  getFileNeighbors: vi.fn().mockResolvedValue({
    prev_id: null,
    next_id: null,
  }),
  recordFileView: vi.fn(),
  likeFile: vi.fn(),
  dislikeFile: vi.fn(),
  updateFile: vi.fn(),
}));

const mockSearchParams = new URLSearchParams();
const mockReplace = vi.fn();
const mockPush = vi.fn();
const mockBack = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: mockBack,
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/files/abc",
  useParams: () => ({ id: "abc" }),
}));

const sidebarMocks = vi.hoisted(() => ({
  overlaySidebarSpy: vi.fn(),
}));
vi.mock("@/components/SidebarProvider", () => ({
  useOverlaySidebar: sidebarMocks.overlaySidebarSpy,
  useSidebar: () => ({ requestRefresh: vi.fn() }),
}));

const driveMocks = vi.hoisted(() => ({
  setOverrideDriveSpy: vi.fn(),
}));
vi.mock("@/components/CurrentDriveProvider", () => ({
  useSetOverrideDrive: () => driveMocks.setOverrideDriveSpy,
}));

const fileDetailContentProps: Array<Record<string, unknown>> = [];
vi.mock("@/components/FileDetailContent", () => ({
  FileDetailContent: (props: Record<string, unknown>) => {
    fileDetailContentProps.push(props);
    return (
      <div data-testid="file-detail-content">
        detail:{props.fileId as string}
      </div>
    );
  },
}));

const imageGalleryProps: Array<Record<string, unknown>> = [];
vi.mock("@/components/ImageGallery", () => ({
  ImageGallery: (props: Record<string, unknown>) => {
    imageGalleryProps.push(props);
    return <div data-testid="image-gallery" />;
  },
}));

const collectionPanelProps: Array<Record<string, unknown>> = [];
vi.mock("@/components/CollectionPanel", () => ({
  CollectionPanel: (props: Record<string, unknown>) => {
    collectionPanelProps.push(props);
    return <div data-testid="collection-panel" />;
  },
  getCollectionOnEnded: () => null,
}));

vi.mock("@/hooks/useFileNav", () => ({
  useFileNav: vi.fn(() => ({ prevId: null, nextId: null })),
}));

import { FileDetailFullScreen } from "../FileDetailFullScreen";
import { useFileNav } from "@/hooks/useFileNav";

const baseFile = {
  id: "abc",
  filename: "video.mp4",
  title: "Sample Video",
  description: "",
  drive: "main",
  folder_path: "movies",
  file_type: "video" as const,
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: true,
  file_size: 1024,
  duration: 60,
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
  mockReplace.mockReset();
  mockPush.mockReset();
  mockBack.mockReset();
  sidebarMocks.overlaySidebarSpy.mockClear();
  driveMocks.setOverrideDriveSpy.mockClear();
  fileDetailContentProps.length = 0;
  imageGalleryProps.length = 0;
  collectionPanelProps.length = 0;
  for (const k of Array.from(mockSearchParams.keys())) {
    mockSearchParams.delete(k);
  }
});

afterEach(() => {
  cleanup();
});

describe("FileDetailFullScreen", () => {
  it("calls useOverlaySidebar (host responsibility per §3.4)", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<FileDetailFullScreen fileId="abc" />);
    await waitFor(() => expect(driveMocks.setOverrideDriveSpy).toHaveBeenCalled());
    expect(sidebarMocks.overlaySidebarSpy).toHaveBeenCalled();
  });

  it("renders FileDetailContent with the given fileId", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<FileDetailFullScreen fileId="abc" />);
    await waitFor(() =>
      expect(screen.getByTestId("file-detail-content")).toHaveTextContent(
        "detail:abc",
      ),
    );
  });

  it("forwards URL deep-link hints to FileDetailContent", async () => {
    mockSearchParams.set("t", "30");
    mockSearchParams.set("page", "7");
    mockSearchParams.set("section", "2");
    mockSearchParams.set("highlight", "phrase");
    mockGetFile.mockResolvedValue(baseFile);
    render(<FileDetailFullScreen fileId="abc" />);
    await waitFor(() => expect(fileDetailContentProps.length).toBeGreaterThan(0));
    const last = fileDetailContentProps[fileDetailContentProps.length - 1];
    expect(last.initialTime).toBe(30);
    expect(last.initialPage).toBe(7);
    expect(last.initialSection).toBe(2);
    expect(last.highlight).toBe("phrase");
  });

  it("does NOT mount CollectionPanel when no collection params are set", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<FileDetailFullScreen fileId="abc" />);
    await waitFor(() =>
      expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("collection-panel")).toBeNull();
    expect(collectionPanelProps.length).toBe(0);
  });

  it("mounts CollectionPanel for video theater when ?collection= is set", async () => {
    mockSearchParams.set("collection", "c1");
    mockGetFile.mockResolvedValue(baseFile);
    render(<FileDetailFullScreen fileId="abc" />);
    await waitFor(() =>
      expect(screen.getByTestId("collection-panel")).toBeInTheDocument(),
    );
    expect(collectionPanelProps[0].collectionId).toBe("c1");
  });

  it("accepts the legacy ?playlist= alias and mounts CollectionPanel", async () => {
    mockSearchParams.set("playlist", "pl1");
    mockGetFile.mockResolvedValue(baseFile);
    render(<FileDetailFullScreen fileId="abc" />);
    await waitFor(() =>
      expect(screen.getByTestId("collection-panel")).toBeInTheDocument(),
    );
    expect(collectionPanelProps[0].collectionId).toBe("pl1");
  });

  it("mounts CollectionPanel for audio side mode when collection is set on audio file", async () => {
    mockSearchParams.set("folder_play", "1");
    mockGetFile.mockResolvedValue({
      ...baseFile,
      file_type: "audio",
      mime_type: "audio/mpeg",
    });
    render(<FileDetailFullScreen fileId="abc" />);
    await waitFor(() =>
      expect(screen.getByTestId("collection-panel")).toBeInTheDocument(),
    );
  });

  it("passes autoPlay=true and onEnded to FileDetailContent in collection mode", async () => {
    mockSearchParams.set("collection", "c1");
    mockGetFile.mockResolvedValue(baseFile);
    render(<FileDetailFullScreen fileId="abc" />);
    await waitFor(() => expect(fileDetailContentProps.length).toBeGreaterThan(0));
    const last = fileDetailContentProps[fileDetailContentProps.length - 1];
    expect(last.autoPlay).toBe(true);
    expect(typeof last.onEnded).toBe("function");
  });

  it("passes autoPlay=false (no onEnded) when no collection", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<FileDetailFullScreen fileId="abc" />);
    await waitFor(() => expect(fileDetailContentProps.length).toBeGreaterThan(0));
    const last = fileDetailContentProps[fileDetailContentProps.length - 1];
    expect(last.autoPlay).toBe(false);
    expect(last.onEnded).toBeUndefined();
  });

  it("mounts ImageGallery once a file is loaded (closed by default)", async () => {
    mockGetFile.mockResolvedValue({
      ...baseFile,
      file_type: "image",
      mime_type: "image/png",
    });
    render(<FileDetailFullScreen fileId="abc" />);
    await waitFor(() =>
      expect(screen.getByTestId("image-gallery")).toBeInTheDocument(),
    );
    expect(imageGalleryProps[imageGalleryProps.length - 1].open).toBe(false);
  });

  it("forwards a hand-written updated_at sort to neither the arrows nor the gallery", async () => {
    vi.mocked(useFileNav).mockClear();
    mockSearchParams.set("sort", "updated_at");
    mockSearchParams.set("order", "desc");
    mockGetFile.mockResolvedValue({
      ...baseFile,
      file_type: "image",
      mime_type: "image/png",
    });
    render(<FileDetailFullScreen fileId="abc" />);
    await waitFor(() =>
      expect(screen.getByTestId("image-gallery")).toBeInTheDocument(),
    );

    const navCalls = vi.mocked(useFileNav).mock.calls;
    expect(navCalls.length).toBeGreaterThan(0);
    for (const [opts] of navCalls) expect(opts.sort).toBeUndefined();
    expect(navCalls.at(-1)![0].mimeType).toBe("image/png");
    expect(imageGalleryProps.length).toBeGreaterThan(0);
    for (const props of imageGalleryProps) expect(props.sort).toBeUndefined();
  });

  it("calls setOverrideDrive with the file's drive on mount", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<FileDetailFullScreen fileId="abc" />);
    await waitFor(() =>
      expect(driveMocks.setOverrideDriveSpy).toHaveBeenCalledWith("main"),
    );
  });

  // `FileDetailContent` is stubbed here, so page rows drawn by the shell
  // inside it are invisible; only whether this host draws one is testable.
  describe("the page row", () => {
    it("gains the breadcrumb it never had, over its own way back", async () => {
      mockGetFile.mockResolvedValue(baseFile);
      render(<FileDetailFullScreen fileId="abc" />);
      await waitFor(() =>
        expect(screen.getByTestId("file-detail-chrome")).toBeInTheDocument(),
      );

      expect(screen.getByTestId("file-detail-chrome")).toHaveTextContent("main");
      expect(screen.getByTestId("file-detail-back").tagName).toBe("BUTTON");
    });

    it("draws no row for a file that brings its own", async () => {
      // The knowledge editor policy is fail-open, so the default resolution
      // is the one that reaches the shell.
      mockGetFile.mockResolvedValue({
        ...baseFile,
        filename: "note.md",
        mime_type: "text/markdown",
      });
      render(<FileDetailFullScreen fileId="abc" />);
      await waitFor(() =>
        expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
      );

      expect(screen.queryByTestId("file-detail-chrome")).toBeNull();
      expect(screen.queryByTestId("file-detail-back")).toBeNull();
    });

    it("hands its back handler to the shell rather than losing it there", async () => {
      mockGetFile.mockResolvedValue({
        ...baseFile,
        filename: "note.md",
        mime_type: "text/markdown",
      });
      render(<FileDetailFullScreen fileId="abc" />);
      await waitFor(() =>
        expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
      );

      const props = fileDetailContentProps[fileDetailContentProps.length - 1];
      expect(typeof props.onBack).toBe("function");
    });
  });
});

/**
 * Both handlers reach these lines only on a cold tab, where
 * `window.history.length` is 1 — which is what jsdom gives them.
 */
describe("FileDetailFullScreen, where it goes when there is no history", () => {
  const WAYS_BACK: [string, string, string][] = [
    ["a file in a folder", "movies", "/drive/main/movies"],
    ["a file at the drive root", "", "/drive/main"],
  ];

  const propsFor = async (folderPath: string) => {
    mockGetFile.mockResolvedValue({ ...baseFile, folder_path: folderPath });
    render(<FileDetailFullScreen fileId="abc" />);
    // The content mounts before the fetch lands, and both handlers return
    // early while the file is still null, so its presence is not the arrival
    // of the file they close over.
    await waitFor(() =>
      expect(fileDetailContentProps.at(-1)?.drive).toBe(baseFile.drive),
    );
    return fileDetailContentProps[fileDetailContentProps.length - 1];
  };

  it.each(WAYS_BACK)("sends Back from %s to %s", async (_name, folderPath, target) => {
    const props = await propsFor(folderPath);
    act(() => void (props.onBack as () => void)());
    expect(mockPush).toHaveBeenCalledWith(target);
  });

  it.each(WAYS_BACK)("sends a delete from %s to %s", async (_name, folderPath, target) => {
    const props = await propsFor(folderPath);
    act(() => void (props.onAfterDelete as () => void)());
    expect(mockPush).toHaveBeenCalledWith(target);
  });
});

describe("FileDetailFullScreen, the file it draws", () => {
  afterEach(() => {
    _resetFileSeedForTests();
  });

  it("asks through the shared request and nothing else", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<FileDetailFullScreen fileId="abc" />);
    await waitFor(() =>
      expect(screen.getByTestId("file-detail-chrome")).toHaveTextContent(
        "Sample Video",
      ),
    );
    expect(mockGetFile).toHaveBeenCalledTimes(1);
    expect(mockGetFileDirect).not.toHaveBeenCalled();
  });

  it("draws a list's copy before the answer arrives", () => {
    seedFiles([baseFile]);
    mockGetFile.mockReturnValue(new Promise(() => {}));
    render(<FileDetailFullScreen fileId="abc" />);
    expect(screen.getByTestId("file-detail-chrome")).toHaveTextContent(
      "Sample Video",
    );
    expect(driveMocks.setOverrideDriveSpy).toHaveBeenCalledWith("main");
  });

  it("lets go of a list's copy when the file cannot be read", async () => {
    seedFiles([{ ...baseFile, title: "Trashed clip" }]);
    mockGetFile.mockRejectedValue(new Error("API error: 404"));
    render(<FileDetailFullScreen fileId="abc" />);
    await waitFor(() => expect(screen.queryByText(/Trashed clip/)).toBeNull());
  });

  it("draws the next file's list copy when the file changes", () => {
    seedFiles([baseFile, { ...baseFile, id: "xyz", title: "Next one" }]);
    mockGetFile.mockReturnValue(new Promise(() => {}));
    const { rerender } = render(<FileDetailFullScreen fileId="abc" />);
    rerender(<FileDetailFullScreen fileId="xyz" />);
    expect(screen.getByTestId("file-detail-chrome")).toHaveTextContent("Next one");
  });

  it("ignores a failure for a file it has already left", async () => {
    let failFirst: (e: unknown) => void = () => {};
    mockGetFile.mockImplementation((id: string) =>
      id === "abc"
        ? new Promise((_resolve, reject) => {
            failFirst = reject;
          })
        : Promise.resolve({ ...baseFile, id: "xyz", title: "Other" }),
    );
    const { rerender } = render(<FileDetailFullScreen fileId="abc" />);
    rerender(<FileDetailFullScreen fileId="xyz" />);
    await waitFor(() =>
      expect(screen.getByTestId("file-detail-chrome")).toHaveTextContent("Other"),
    );
    await act(async () => {
      failFirst(new Error("API error: 404"));
    });
    expect(screen.getByTestId("file-detail-chrome")).toHaveTextContent("Other");
  });

  it("ignores an answer for a file it has already left", async () => {
    let answerFirst: (f: unknown) => void = () => {};
    mockGetFile.mockImplementation((id: string) =>
      id === "abc"
        ? new Promise((resolve) => {
            answerFirst = resolve;
          })
        : Promise.resolve({ ...baseFile, id: "xyz", title: "Other", drive: "second" }),
    );
    const { rerender } = render(<FileDetailFullScreen fileId="abc" />);
    rerender(<FileDetailFullScreen fileId="xyz" />);
    await waitFor(() =>
      expect(screen.getByTestId("file-detail-chrome")).toHaveTextContent("Other"),
    );
    await act(async () => {
      answerFirst(baseFile);
    });
    expect(screen.getByTestId("file-detail-chrome")).toHaveTextContent("Other");
    expect(driveMocks.setOverrideDriveSpy).toHaveBeenLastCalledWith("second");
  });
});
