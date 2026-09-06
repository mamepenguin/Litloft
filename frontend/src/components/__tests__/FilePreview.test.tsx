import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { accentFills } from "@/__tests__/helpers/accentFills";
import { FilePreview } from "../FilePreview";
import type { FileItem } from "@/types";

vi.mock("@/lib/api", () => ({
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getDownloadUrl: (id: string) => `/api/files/${id}/stream?download=true`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

vi.mock("../VideoPlayer", () => ({
  VideoPlayer: ({ videoId }: { videoId: string }) => (
    <div data-testid="video-player">{videoId}</div>
  ),
}));

vi.mock("../AudioPlayer", () => ({
  AudioPlayer: ({ file }: { file: FileItem }) => (
    <div data-testid="audio-player">{file.filename}</div>
  ),
}));

vi.mock("../ArchivePreview", () => ({
  ArchivePreview: ({ fileId }: { fileId: string }) => (
    <div data-testid="archive-preview">{fileId}</div>
  ),
}));

vi.mock("../HtmlPreview", () => ({
  HtmlPreview: ({ fileId }: { fileId: string }) => (
    <div data-testid="html-preview">{fileId}</div>
  ),
}));

vi.mock("../PdfPreview", () => ({
  PdfPreview: ({
    fileId,
    initialPage,
    onPdfController,
  }: {
    fileId: string;
    initialPage?: number;
    onPdfController?: unknown;
  }) => (
    <div data-testid="pdf-preview" data-has-pdf-controller={String(Boolean(onPdfController))}>
      {fileId}:{initialPage ?? 1}
    </div>
  ),
}));

vi.mock("../TextPreview", () => ({
  TextPreview: ({ fileId }: { fileId: string }) => (
    <div data-testid="text-preview">{fileId}</div>
  ),
  isTextPreviewable: (mime: string) => mime === "text/plain",
}));

vi.mock("../FileTypeIcon", () => ({
  FileTypeIcon: ({ fileType }: { fileType: string }) => (
    <span data-testid={`icon-${fileType}`} />
  ),
}));

vi.mock("../loft/LoftPlayer", () => ({
  default: ({ fileId }: { fileId: string }) => (
    <div data-testid="loft-player">{fileId}</div>
  ),
}));

vi.mock("../AddonSlot", () => ({
  AddonSlot: () => null,
}));

function makeFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    image_width: null,
    image_height: null,
    id: "file-1",
    filename: "test.mp4",
    title: "Test",
    description: "",
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1000,
    duration: 60,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("FilePreview", () => {
  it("renders VideoPlayer for video files", () => {
    render(<FilePreview file={makeFile()} />);
    expect(screen.getByTestId("video-player")).toBeInTheDocument();
  });

  it("renders image for image files", () => {
    const file = makeFile({ file_type: "image", mime_type: "image/jpeg", filename: "photo.jpg" });
    render(<FilePreview file={file} />);
    const img = screen.getByAltText("Test");
    expect(img).toHaveAttribute("src", "/api/files/file-1/stream");
  });

  it("renders SVG file via img tag with stream URL", () => {
    // Regression guard for the stream XSS hardening
    // (docs/superpowers/specs/2026-05-09-stream-xss-hardening.md):
    // SVG must keep going through <img> so that
    // ``Content-Disposition: attachment`` on the stream endpoint is
    // ignored as a sub-resource (browsers honour attachment only on
    // top-level navigation). Swapping to <iframe> would break SVG
    // display because attachment IS honoured on iframe loads.
    const file = makeFile({
      file_type: "image",
      mime_type: "image/svg+xml",
      filename: "logo.svg",
    });
    render(<FilePreview file={file} />);
    const img = screen.getByAltText("Test");
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("src", "/api/files/file-1/stream");
  });

  it("renders AudioPlayer for audio files", () => {
    const file = makeFile({ file_type: "audio", mime_type: "audio/mp3", filename: "song.mp3" });
    render(<FilePreview file={file} />);
    expect(screen.getByTestId("audio-player")).toBeInTheDocument();
  });

  // The viewer is loaded with next/dynamic and ssr: false, so it arrives a
  // tick after render. That is deliberate: react-pdf evaluates pdfjs-dist,
  // which needs DOMMatrix and therefore threw during SSR on every /drive/*
  // route. See the comment on the dynamic() call in FilePreview.
  it("renders the selectable PDF viewer at the requested page", async () => {
    const file = makeFile({ file_type: "document", mime_type: "application/pdf", filename: "doc.pdf" });
    render(<FilePreview file={file} initialPage={4} />);
    expect(await screen.findByTestId("pdf-preview")).toHaveTextContent("file-1:4");
  });

  it("renders ArchivePreview for archive files", () => {
    const file = makeFile({ file_type: "archive", mime_type: "application/zip", filename: "files.zip" });
    render(<FilePreview file={file} />);
    expect(screen.getByTestId("archive-preview")).toBeInTheDocument();
  });

  it("renders TextPreview for text files", () => {
    const file = makeFile({ file_type: "document", mime_type: "text/plain", filename: "readme.txt" });
    render(<FilePreview file={file} />);
    expect(screen.getByTestId("text-preview")).toBeInTheDocument();
  });

  it("renders HtmlPreview for text/html files", () => {
    const file = makeFile({
      id: "html-1",
      file_type: "document",
      mime_type: "text/html",
      filename: "artifact.html",
    });
    render(<FilePreview file={file} />);
    expect(screen.getByTestId("html-preview")).toBeInTheDocument();
    expect(screen.getByTestId("html-preview")).toHaveTextContent("html-1");
    // The text/html branch must beat the generic text fallback.
    expect(screen.queryByTestId("text-preview")).not.toBeInTheDocument();
  });

  it("renders LoftPlayer for .loft even though file_type is video", () => {
    // .loft is classified as file_type=video for search filtering, but
    // playback must use the iframe-based LoftPlayer (e.g. YouTube embed)
    // — a native <video> can't load a YouTube URL.
    const file = makeFile({
      file_type: "video",
      mime_type: "application/vnd.litloft.loft+json",
      filename: "clip.loft",
    });
    render(<FilePreview file={file} />);
    expect(screen.getByTestId("loft-player")).toBeInTheDocument();
    expect(screen.queryByTestId("video-player")).not.toBeInTheDocument();
  });

  it("renders fallback for unsupported files", () => {
    const file = makeFile({ file_type: "other", mime_type: "application/octet-stream", filename: "data.bin" });
    render(<FilePreview file={file} />);
    expect(screen.getByText(/data\.bin/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "This kind of file cannot be shown in a browser" }),
    ).toBeInTheDocument();
  });

  /**
   * The page said four times that it had nothing, and gave no way out. Both
   * of these are `<a>`, not buttons: a download whose address cannot be
   * copied or middle-clicked is a worse download, and
   * `docs/user-guide/viewers-and-players.md` has described this action
   * since before it existed.
   */
  it("offers the file itself when it cannot be previewed", () => {
    const file = makeFile({ file_type: "other", mime_type: "application/octet-stream", filename: "data.bin" });
    render(<FilePreview file={file} />);

    const download = screen.getByRole("link", { name: "Download" });
    expect(download).toHaveAttribute("href", expect.stringContaining("download=true"));
    // The attribute, not just the label: without `target` the "new tab"
    // link navigates in this one, and the label is then the only place the
    // promise lives. `rel` because a `_blank` without it hands the opened
    // page a `window.opener`.
    expect(download).toHaveAttribute("download");
    const open = screen.getByRole("link", { name: "Open in new tab" });
    expect(open).toHaveAttribute("href", expect.stringContaining(`/files/${file.id}/stream`));
    expect(open.getAttribute("href")).not.toContain("download=true");
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", "noopener noreferrer");

    // Neither goes through the router: `<Link>` prefetches an internal
    // href when it comes into view, which for a file endpoint means
    // fetching the body of a file nobody asked for yet.
    expect(download.getAttribute("data-prefetch")).toBeNull();
    for (const el of [download, open]) {
      expect(el.tagName).toBe("A");
    }
  });

  /**
   * DESIGN.md §2.2 — one accent fill per screen, and this screen is the
   * whole of the file's own area when nothing can be drawn in it.
   *
   * Through the shared detector, not a local re-implementation: the first
   * draft of this test read `[class*='bg-accent']` and disagreed with
   * `accentFills` about `hover:bg-accent` (a fill it must not count), about
   * `bg-accent-cta` (one it must), and about `<svg>`, where `className` is
   * an `SVGAnimatedString` rather than a string. That helper exists because
   * two earlier hand-rolled versions were wrong in the expensive direction.
   */
  it("spends one accent fill on the download", () => {
    const file = makeFile({ file_type: "other", mime_type: "application/octet-stream", filename: "data.bin" });
    const { container } = render(<FilePreview file={file} />);
    expect(accentFills(container).map((el) => el.textContent)).toEqual(["Download"]);
  });
});


describe("FilePreview's PDF controller pass-through", () => {
  it("hands the viewer the callback the shell gave it", async () => {
    // The page-list tab exists only if this reaches the viewer, and nothing
    // in the shell's own suite can see the wire: it stubs `FilePreview`.
    // Deleting the prop here used to leave every test green.
    const file = makeFile({ file_type: "document", mime_type: "application/pdf", filename: "doc.pdf" });
    render(<FilePreview file={file} onPdfController={vi.fn()} />);

    expect(
      (await screen.findByTestId("pdf-preview")).getAttribute("data-has-pdf-controller"),
    ).toBe("true");
  });

  it("passes nothing when the caller offered nothing", async () => {
    const file = makeFile({ file_type: "document", mime_type: "application/pdf", filename: "doc.pdf" });
    render(<FilePreview file={file} />);

    expect(
      (await screen.findByTestId("pdf-preview")).getAttribute("data-has-pdf-controller"),
    ).toBe("false");
  });
});


describe("FilePreview's Office excerpt", () => {
  const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("puts the extracted text under the panel that says there is no preview", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "Trade statistics, 2019 return",
    }) as unknown as typeof fetch;

    render(<FilePreview file={makeFile({ file_type: "document", mime_type: XLSX, filename: "trade.xlsx" })} />);

    // Both, and in this order: the excerpt is an addition to the empty
    // state, not a replacement for it — a reader still needs the download.
    expect(await screen.findByText("Trade statistics, 2019 return")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download/i })).toBeInTheDocument();
  });

  it("asks for nothing on a file that is not Office", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<FilePreview file={makeFile({ file_type: "other", mime_type: "application/octet-stream", filename: "blob.bin" })} />);

    await screen.findByRole("link", { name: /download/i });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
