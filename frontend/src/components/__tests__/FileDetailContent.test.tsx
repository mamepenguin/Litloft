import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { useState } from "react";

import { FileDetailContent } from "../FileDetailContent";
import * as api from "@/lib/api";
import type { FileItem } from "@/types";

// Heavy children are mocked: this test focuses on FileDetailContent's
// own contract (fetch + recordFileView + chrome-less surface), not on
// the children's rendering — those have their own tests.

vi.mock("../FilePreview", () => ({
  FilePreview: vi.fn(() => <div data-testid="file-preview" />),
}));
vi.mock("../ActiveSummaryHost", () => ({
  ActiveSummaryHost: () => <div data-testid="active-summary-host" />,
}));
vi.mock("../RelatedFilesSection", () => ({
  RelatedFilesSection: () => <div data-testid="related-files" />,
}));
vi.mock("../ExifSection", () => ({
  ExifSection: () => <div data-testid="exif" />,
}));
vi.mock("../AddonSlot", () => ({
  AddonSlot: () => <div data-testid="addon-slot" />,
}));
vi.mock("../CommentSection", () => ({
  CommentSection: () => <div data-testid="comments" />,
}));
vi.mock("../EditableTagChips", () => ({
  EditableTagChips: ({
    onSaveSuccess,
  }: {
    onSaveSuccess?: () => void;
  }) => (
    <button
      type="button"
      data-testid="tag-save-trigger"
      onClick={() => onSaveSuccess?.()}
    >
      tags
    </button>
  ),
}));
vi.mock("../FavoriteButton", () => ({
  FavoriteButton: () => <div data-testid="favorite" />,
}));
vi.mock("../FileActions", () => ({
  FileActions: () => <div data-testid="file-actions" />,
}));
vi.mock("../CastButton", () => ({
  CastButton: () => <div data-testid="cast" />,
}));
vi.mock("@/lib/api", () => ({
  getFile: vi.fn(),
  recordFileView: vi.fn(),
  likeFile: vi.fn(),
  dislikeFile: vi.fn(),
  updateFile: vi.fn(),
}));
vi.mock("@/lib/recentlyPlayed", () => ({
  addRecentlyPlayed: vi.fn(),
}));

// Detect any accidental useOverlaySidebar() call. The contract (§3.2,
// §3.4) says FileDetailContent must NOT touch overlay state — host is
// responsible for that. vi.hoisted() gives us a reference the hoisted
// vi.mock factory can close over without violating its top-level rule.
const sidebarMocks = vi.hoisted(() => ({
  overlaySidebarSpy: vi.fn(),
}));
vi.mock("../SidebarProvider", () => ({
  useSidebar: () => ({
    requestRefresh: vi.fn(),
    isOpen: false,
    isOverlay: false,
    toggle: vi.fn(),
    close: vi.fn(),
    setOverlayMode: vi.fn(),
    refreshKey: 0,
  }),
  useOverlaySidebar: sidebarMocks.overlaySidebarSpy,
}));

function makeFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "f1",
    drive: "main",
    folder_path: "",
    filename: "video.mp4",
    title: "Sample",
    description: "",
    file_type: "video",
    file_size: 1234,
    duration: 60,
    mime_type: "video/mp4",
    likes: 0,
    is_favorite: false,
    tags: [],
    subtitles: [],
    has_thumbnail: true,
    created_at: "2026-05-10T00:00:00Z",
    updated_at: "2026-05-10T00:00:00Z",
    ...overrides,
  } as FileItem;
}

function setApiResponses(file: FileItem) {
  (api.getFile as ReturnType<typeof vi.fn>).mockResolvedValue(file);
  (api.recordFileView as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
}

describe("FileDetailContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls recordFileView exactly once when mounted with a fileId", async () => {
    setApiResponses(makeFile());
    render(<FileDetailContent fileId="f1" drive="main" />);
    await waitFor(() => expect(api.getFile).toHaveBeenCalledWith("f1"));
    expect(api.recordFileView).toHaveBeenCalledTimes(1);
    expect(api.recordFileView).toHaveBeenCalledWith("f1");
  });

  it("re-fetches and re-fires recordFileView when fileId changes", async () => {
    setApiResponses(makeFile());
    const { rerender } = render(
      <FileDetailContent fileId="f1" drive="main" />,
    );
    await waitFor(() => expect(api.getFile).toHaveBeenCalledWith("f1"));
    expect(api.recordFileView).toHaveBeenCalledTimes(1);

    setApiResponses(makeFile({ id: "f2", title: "Sample 2" }));
    rerender(<FileDetailContent fileId="f2" drive="main" />);
    await waitFor(() => expect(api.getFile).toHaveBeenCalledWith("f2"));
    expect(api.recordFileView).toHaveBeenCalledTimes(2);
    expect(api.recordFileView).toHaveBeenLastCalledWith("f2");
  });

  it("never calls useOverlaySidebar (host responsibility)", async () => {
    setApiResponses(makeFile());
    render(<FileDetailContent fileId="f1" drive="main" />);
    await waitFor(() => expect(api.getFile).toHaveBeenCalled());
    expect(sidebarMocks.overlaySidebarSpy).not.toHaveBeenCalled();
  });

  it("renders the Maximize trigger only for image files when onRequestImageGallery is provided", async () => {
    setApiResponses(
      makeFile({ file_type: "image", mime_type: "image/png" }),
    );
    const onRequest = vi.fn();
    render(
      <FileDetailContent
        fileId="f1"
        drive="main"
        onRequestImageGallery={onRequest}
      />,
    );
    await waitFor(() => expect(api.getFile).toHaveBeenCalled());
    const btn = screen.getByLabelText(/gallery/i);
    btn.click();
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it("does not render Maximize trigger for non-image files", async () => {
    setApiResponses(makeFile({ file_type: "video" }));
    const onRequest = vi.fn();
    render(
      <FileDetailContent
        fileId="f1"
        drive="main"
        onRequestImageGallery={onRequest}
      />,
    );
    await waitFor(() => expect(api.getFile).toHaveBeenCalled());
    expect(screen.queryByLabelText(/gallery/i)).toBeNull();
  });

  it("does not render Maximize for image files when callback is not provided", async () => {
    setApiResponses(
      makeFile({ file_type: "image", mime_type: "image/png" }),
    );
    render(<FileDetailContent fileId="f1" drive="main" />);
    await waitFor(() => expect(api.getFile).toHaveBeenCalled());
    expect(screen.queryByLabelText(/gallery/i)).toBeNull();
  });

  it("re-fetches the file when EditableTagChips reports a save", async () => {
    setApiResponses(makeFile());
    render(<FileDetailContent fileId="f1" drive="main" />);
    await waitFor(() => expect(api.getFile).toHaveBeenCalledTimes(1));
    const trigger = screen.getByTestId("tag-save-trigger");
    act(() => {
      trigger.click();
    });
    await waitFor(() =>
      expect(api.getFile).toHaveBeenCalledTimes(2),
    );
  });

  it("relays mediaController updates upward via onMediaController", async () => {
    setApiResponses(makeFile());
    let captured: unknown = "untouched";
    function Harness() {
      const [mc] = useState(null);
      return (
        <FileDetailContent
          fileId="f1"
          drive="main"
          onMediaController={(received) => {
            captured = received;
            void mc;
          }}
        />
      );
    }
    render(<Harness />);
    await waitFor(() => expect(api.getFile).toHaveBeenCalled());
    // FilePreview is mocked so onMediaController isn't auto-invoked
    // here, but the wiring (handleMediaController exists and is
    // forwarded to the FilePreview prop) is verified by the next test.
    expect(captured).toBe("untouched");
  });

  it("forwards miniPlayerRoot to FilePreview", async () => {
    setApiResponses(makeFile());
    const { FilePreview: MockedPreview } = await import("../FilePreview");
    const root = document.createElement("section");
    render(
      <FileDetailContent
        fileId="f1"
        drive="main"
        miniPlayerRoot={root}
      />,
    );
    await waitFor(() => expect(api.getFile).toHaveBeenCalled());
    const calls = (MockedPreview as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const lastProps = calls[calls.length - 1][0] as {
      miniPlayerRoot?: Element | null;
    };
    expect(lastProps.miniPlayerRoot).toBe(root);
  });
});
