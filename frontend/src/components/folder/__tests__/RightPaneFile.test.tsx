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
// (PR-2 has its own tests). PR-5 dropped the per-host dirty dialog —
// the global ``<DirtyBlocker />`` owns it now.
vi.mock("@/hooks/useFileNav", () => ({
  useFileNav: vi.fn(() => ({ prevId: null, nextId: null })),
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

// Default fixture is a plain-text document, which is a kind that still
// gets its page row from this host. Everything that brings its own —
// Markdown, media, and since 2026-09 PDF, archives and images — takes
// the other branch, where drawing a header here would be the second
// one. The dedicated tests below cover both paths.
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
  trust_tier: "verified",
  trust_reviewed_at: null,
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
      expect(screen.getByText("doc.txt")).toBeInTheDocument(),
    );
  });

  it("suppresses the PaneShell header for Markdown files (DocumentLayout owns chrome)", async () => {
    // 2026-05-11 chrome consolidation: when the file is text/markdown
    // and the Knowledge editor policy is enabled (fail-open default),
    // FileDetailContent will mount MarkdownDocumentLayout whose own
    // unified chrome renders the title. PaneShell hides its own
    // header to avoid a duplicate title row.
    mockGetFile.mockResolvedValue({
      ...baseFile,
      filename: "note.md",
      mime_type: "text/markdown",
    });
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
    );
    // Header title (PaneShell) must NOT be rendered for markdown.
    expect(screen.queryByText("My Document")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /back to tree/i }),
    ).toBeNull();
  });

  it("suppresses the header for a PDF too, now that it brings its own", async () => {
    // Same reason as Markdown, and the reason the fixture above is a
    // text file: PDF, archives and images joined the shell in 2026-09,
    // so the host drawing a header for them would put two page rows and,
    // on a phone, two back controls on one screen.
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

  it("does NOT render a 'Back to tree' affordance (mobile back-gesture replaces it)", async () => {
    // 2026-05-12 chrome polish: the previous floating "back to tree"
    // button briefly flashed before the markdown layout suppressed
    // the PaneShell header; it was redundant with the browser / OS
    // back gesture so we dropped it.
    mockGetFile.mockResolvedValue(baseFile);
    render(<RightPaneFile fileId="abc123" drive="work" />);
    await waitFor(() =>
      expect(screen.getByText("My Document")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /back to tree/i }),
    ).toBeNull();
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

  // `FileDetailContent` is stubbed here, so counting rows would count
  // only this host's — and the duplicate a file detail page can get
  // comes from the shell inside that stub. What is testable, and is
  // where the equivalent bug lived on the other host, is whether this
  // one decides to draw a row at all.
  describe("the page row", () => {
    it("carries the breadcrumb for a file that has no shell of its own", async () => {
      mockGetFile.mockResolvedValue(baseFile);
      render(<RightPaneFile fileId="abc123" drive="work" />);
      await waitFor(() =>
        expect(screen.getByText("My Document")).toBeInTheDocument(),
      );

      const row = screen.getByTestId("file-detail-chrome");
      expect(row).toHaveTextContent("work");
      expect(row).toHaveTextContent("Q1");
      expect(row).toHaveTextContent("My Document");
      // The phone form of the same row, which is where MB-3's missing
      // way back used to be.
      expect(screen.getByTestId("file-detail-back")).toHaveAttribute(
        "href",
        "/drive/work/Q1",
      );
    });

    it("leaves it to the shell for a video too, on this surface", async () => {
      // This host is the canonical URL, where media rides the shell as
      // of 2026-09. The predicate that decides it takes a surface now,
      // and a host reading the old two-argument one would draw a second
      // row under the shell's — two breadcrumbs, two inspector toggles.
      // The collection host asserts the opposite, in its own suite.
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
