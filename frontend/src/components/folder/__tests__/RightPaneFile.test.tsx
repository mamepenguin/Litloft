import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetFile = vi.fn();
vi.mock("@/lib/api", () => ({
  getFile: (...args: unknown[]) => mockGetFile(...args),
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

// Stub the heavy detail content; PR-3's tests cover its internals.
// We capture the props it received so the host's wiring (drive,
// callbacks, miniPlayerRoot) can be asserted.
const fileDetailProps: Array<Record<string, unknown>> = [];
vi.mock("@/components/FileDetailContent", () => ({
  FileDetailContent: (props: Record<string, unknown>) => {
    fileDetailProps.push(props);
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

// useFileNav fetches neighbors and registers shortcuts; stub it so
// RightPaneFile's host wiring is what we test, not the hook's internals
// (PR-2 has its own tests). PR-4 added the dirty-navigation guard
// shape — we expose mutable refs so individual tests can simulate
// "dialog open" state.
let useFileNavReturn: {
  prevId: string | null;
  nextId: string | null;
  pendingNavigation: { targetId: string } | null;
  confirmPendingNavigation: () => void;
  cancelPendingNavigation: () => void;
} = {
  prevId: null,
  nextId: null,
  pendingNavigation: null,
  confirmPendingNavigation: vi.fn(),
  cancelPendingNavigation: vi.fn(),
};
vi.mock("@/hooks/useFileNav", () => ({
  useFileNav: vi.fn(() => useFileNavReturn),
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

const baseFile = {
  id: "abc123",
  filename: "doc.md",
  title: "My Document",
  description: "",
  drive: "work",
  folder_path: "Q1",
  file_type: "document" as const,
  mime_type: "text/markdown",
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
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

beforeEach(() => {
  mockGetFile.mockReset();
  mockClearFile.mockReset();
  mockSelectFile.mockReset();
  fileDetailProps.length = 0;
  imageGalleryProps.length = 0;
  // Reset search params
  for (const k of Array.from(mockSearchParams.keys())) {
    mockSearchParams.delete(k);
  }
  // Reset useFileNav mock return to clean defaults so the dirty
  // dialog stays closed unless a test opts in.
  useFileNavReturn = {
    prevId: null,
    nextId: null,
    pendingNavigation: null,
    confirmPendingNavigation: vi.fn(),
    cancelPendingNavigation: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RightPaneFile", () => {
  it("shows loading then renders FileDetailContent", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<RightPaneFile fileId="abc123" drive="work" />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("My Document")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("file-detail-content")).toHaveTextContent(
      "detail:abc123",
    );
  });

  it("falls back to filename when title is empty", async () => {
    mockGetFile.mockResolvedValue({ ...baseFile, title: "" });
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByText("doc.md")).toBeInTheDocument(),
    );
  });

  it("does NOT render an 'Open details' link (the right pane IS the detail page now)", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByText("My Document")).toBeInTheDocument(),
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
      expect(screen.getByText("My Document")).toBeInTheDocument(),
    );
    rerender(<RightPaneFile fileId="z9" drive="work" />);
    await waitFor(() =>
      expect(screen.getByText("Other")).toBeInTheDocument(),
    );
    expect(mockGetFile).toHaveBeenCalledTimes(2);
  });

  it("renders 'Back to tree' button that calls clearFile", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByText("My Document")).toBeInTheDocument(),
    );
    const backBtn = screen.getByRole("button", { name: /back to tree/i });
    fireEvent.click(backBtn);
    expect(mockClearFile).toHaveBeenCalledTimes(1);
  });

  it("forwards URL deep-link hints (?t=, ?page=, ?highlight=) to FileDetailContent", async () => {
    mockSearchParams.set("t", "10");
    mockSearchParams.set("page", "5");
    mockSearchParams.set("highlight", "match");
    mockGetFile.mockResolvedValue(baseFile);
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByText("My Document")).toBeInTheDocument(),
    );
    const lastProps = fileDetailProps[fileDetailProps.length - 1];
    expect(lastProps.initialTime).toBe(10);
    expect(lastProps.initialPage).toBe(5);
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
    // The mock captured FileDetailContent's onRequestImageGallery prop
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
      expect(screen.getByText("My Document")).toBeInTheDocument(),
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
      expect(screen.getByText("My Document")).toBeInTheDocument(),
    );
    const lastProps = fileDetailProps[fileDetailProps.length - 1];
    const onAfterDelete = lastProps.onAfterDelete as () => void;
    onAfterDelete();
    expect(mockClearFile).toHaveBeenCalledTimes(1);
  });

  it("does not render the discard-changes dialog when no navigation is pending (PR-4)", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("renders the discard-changes dialog when useFileNav reports pendingNavigation (PR-4)", async () => {
    mockGetFile.mockResolvedValue(baseFile);
    const confirmSpy = vi.fn();
    const cancelSpy = vi.fn();
    useFileNavReturn = {
      prevId: "prev1",
      nextId: "next1",
      pendingNavigation: { targetId: "next1" },
      confirmPendingNavigation: confirmSpy,
      cancelPendingNavigation: cancelSpy,
    };
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByText("Unsaved changes")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard and navigate" }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(cancelSpy).not.toHaveBeenCalled();
  });
});
