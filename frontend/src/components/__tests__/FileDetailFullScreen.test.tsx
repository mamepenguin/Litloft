import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const mockGetFile = vi.fn();
vi.mock("@/lib/api", () => ({
  getFile: (...args: unknown[]) => mockGetFile(...args),
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

// useFileNav is stubbed: PR-2 has its own tests; PR-5 moved the
// dirty-navigation dialog to the global ``<DirtyBlocker />``.
vi.mock("@/hooks/useFileNav", () => ({
  useFileNav: vi.fn(() => ({ prevId: null, nextId: null })),
}));

import { FileDetailFullScreen } from "../FileDetailFullScreen";

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
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

beforeEach(() => {
  mockGetFile.mockReset();
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
    mockSearchParams.set("highlight", "phrase");
    mockGetFile.mockResolvedValue(baseFile);
    render(<FileDetailFullScreen fileId="abc" />);
    await waitFor(() => expect(fileDetailContentProps.length).toBeGreaterThan(0));
    const last = fileDetailContentProps[fileDetailContentProps.length - 1];
    expect(last.initialTime).toBe(30);
    expect(last.initialPage).toBe(7);
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

  it("calls setOverrideDrive with the file's drive on mount", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<FileDetailFullScreen fileId="abc" />);
    await waitFor(() =>
      expect(driveMocks.setOverrideDriveSpy).toHaveBeenCalledWith("main"),
    );
  });


  // `FileDetailContent` is stubbed in this file, so counting page rows
  // here would count only the ones this host draws — which is exactly
  // how a duplicate row shipped: the second one comes from the shell
  // inside the stub, and an assertion that cannot see it passes while
  // the page has two. What is testable here, and is where that bug
  // lived, is whether the host decides to draw one at all.
  describe("the page row", () => {
    it("gains the breadcrumb it never had, over its own way back", async () => {
      mockGetFile.mockResolvedValue(baseFile);
      render(<FileDetailFullScreen fileId="abc" />);
      await waitFor(() =>
        expect(screen.getByTestId("file-detail-chrome")).toBeInTheDocument(),
      );

      expect(screen.getByTestId("file-detail-chrome")).toHaveTextContent("main");
      // A button running this route's handler, not a Link to the file's
      // folder: from a collection, back means the collection.
      expect(screen.getByTestId("file-detail-back").tagName).toBe("BUTTON");
    });

    it("draws no row for a file that brings its own", async () => {
      // A Markdown note rides `FileDetailShell`, which draws the row
      // itself because it owns the inspector toggle sitting in it. This
      // host drawing one too is two breadcrumbs and, on a phone, two
      // back controls. The knowledge editor policy is fail-open, so the
      // default resolution is the one that reaches the shell.
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
      // The guard above would otherwise trade a duplicate row for a
      // silently wrong one: the shell's own row links to the parent
      // folder, which is not where back goes from a collection.
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
