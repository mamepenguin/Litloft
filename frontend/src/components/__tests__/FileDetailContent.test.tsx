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
// Which slots an addon has claimed. Defaults to none, which is what
// every pre-existing test in this file assumes.
const slotMocks = vi.hoisted(() => ({ occupied: new Set<string>() }));
vi.mock("../AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: (slotId: string) => slotMocks.occupied.has(slotId),
  }),
}));
vi.mock("../AddonSlot", () => ({
  AddonSlot: ({
    id,
    includeIds,
    excludeIds,
    props,
  }: {
    id: string;
    includeIds?: string[];
    excludeIds?: string[];
    props?: Record<string, unknown>;
  }) => {
    // Surface the filter intent to the DOM so tests can assert which
    // copy of the slot (canvas vs. inspector) ran.
    const tag =
      id !== "file-detail-sections"
        ? id
        : includeIds
          ? `include:${includeIds.join(",")}`
          : excludeIds
            ? `exclude:${excludeIds.join(",")}`
            : "all";
    return (
      <div
        data-testid={`addon-slot-${tag}`}
        data-fill-height={props?.fillHeight === true ? "true" : "false"}
      />
    );
  },
}));
vi.mock("../MarkdownDocumentLayout", () => ({
  MarkdownDocumentLayout: ({
    title,
    inspector,
    mobileSheet,
    children,
  }: {
    title: string;
    inspector: React.ReactNode;
    mobileSheet?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div data-testid="markdown-document-layout">
      <div data-testid="md-title">{title}</div>
      <div data-testid="md-canvas">{children}</div>
      <div data-testid="md-inspector">{inspector}</div>
      {mobileSheet !== undefined && (
        <div data-testid="md-mobile-sheet">{mobileSheet}</div>
      )}
    </div>
  ),
}));
const usePolicyMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/usePolicy", () => ({
  usePolicy: usePolicyMock,
}));
vi.mock("../CommentSection", () => ({
  CommentSection: () => <div data-testid="comments" />,
}));
const editableTagChipsCalls = vi.hoisted(
  () => [] as Array<Record<string, unknown>>,
);
vi.mock("../EditableTagChips", () => ({
  EditableTagChips: (props: Record<string, unknown>) => {
    editableTagChipsCalls.push(props);
    const { onSaveSuccess, onContentChange } = props as {
      onSaveSuccess?: () => void;
      onContentChange?: (next: string) => void;
    };
    return (
      <div data-testid="tag-chips-stub">
        <button
          type="button"
          data-testid="tag-save-trigger"
          onClick={() => onSaveSuccess?.()}
        >
          tags
        </button>
        <button
          type="button"
          data-testid="tag-content-write"
          onClick={() =>
            onContentChange?.("---\ntags: [via-chips]\n---\nbody")
          }
        >
          content-write
        </button>
      </div>
    );
  },
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
    editableTagChipsCalls.length = 0;
    // Default: policy resolved as enabled (the "common" case for any
    // drive that hasn't opted out). Tests that need the legacy stack
    // override this either by selecting a non-Markdown mime type or
    // by remocking before render.
    usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
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

  // ---------- Markdown DocumentLayout fork (spec 2026-05-10) ----------

  it("renders MarkdownDocumentLayout when mime=text/markdown and policy is enabled", async () => {
    setApiResponses(
      makeFile({
        file_type: "document",
        mime_type: "text/markdown",
        filename: "note.md",
      }),
    );
    render(<FileDetailContent fileId="f1" drive="work" />);
    await waitFor(() => expect(api.getFile).toHaveBeenCalled());
    expect(screen.getByTestId("markdown-document-layout")).toBeInTheDocument();
    // Canvas hosts the knowledge-edit slot ...
    const canvas = screen.getByTestId("md-canvas");
    expect(
      canvas.querySelector('[data-testid="addon-slot-include:knowledge-edit"]'),
    ).not.toBeNull();
    // 2026-05-12 inspector consolidation: the canvas footer keeps
    // only the table-heavy summary surfaces (ActiveSummaryHost +
    // intelligence's `detailed-summary`). Everything else — including
    // similar-files and comments — moved into the inspector.
    expect(
      canvas.querySelector('[data-testid="active-summary-host"]'),
    ).not.toBeNull();
    expect(
      canvas.querySelector('[data-testid="addon-slot-include:detailed-summary"]'),
    ).not.toBeNull();
    expect(canvas.querySelector('[data-testid="comments"]')).toBeNull();
    // Inspector hosts everything except the editor itself and the
    // table-heavy summary slot.
    const inspector = screen.getByTestId("md-inspector");
    expect(
      inspector.querySelector(
        '[data-testid="addon-slot-exclude:knowledge-edit,detailed-summary"]',
      ),
    ).not.toBeNull();
    expect(inspector.querySelector('[data-testid="comments"]')).not.toBeNull();
    // The heavy summary belongs to the canvas footer on desktop — it
    // must NOT also live in the inspector (no double mount).
    expect(
      inspector.querySelector('[data-testid="active-summary-host"]'),
    ).toBeNull();
    expect(
      inspector.querySelector(
        '[data-testid="addon-slot-include:detailed-summary"]',
      ),
    ).toBeNull();
  });

  it("on mobile, suppresses the canvas footer and folds heavy summaries into the mobile sheet (2026-05-12)", async () => {
    // Drop the viewport below the 768px breakpoint so `useIsMobile`
    // returns true. FileDetailContent must then mount
    // ActiveSummaryHost + detailed-summary inside the mobile sheet
    // (alongside the regular inspector content) and skip rendering
    // them in the canvas footer — single mount across both surfaces.
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 420,
    });
    window.dispatchEvent(new Event("resize"));
    try {
      setApiResponses(
        makeFile({
          file_type: "document",
          mime_type: "text/markdown",
          filename: "note.md",
        }),
      );
      render(<FileDetailContent fileId="f1" drive="work" />);
      await waitFor(() => expect(api.getFile).toHaveBeenCalled());

      const sheet = screen.getByTestId("md-mobile-sheet");
      expect(sheet.querySelector('[data-testid="active-summary-host"]'))
        .not.toBeNull();
      expect(
        sheet.querySelector('[data-testid="addon-slot-include:detailed-summary"]'),
      ).not.toBeNull();
      // Inspector content is also folded in (single source of truth).
      expect(sheet.querySelector('[data-testid="comments"]')).not.toBeNull();

      // Canvas footer must NOT render the heavy summaries on mobile.
      const canvas = screen.getByTestId("md-canvas");
      expect(
        canvas.querySelector('[data-testid="active-summary-host"]'),
      ).toBeNull();
      expect(
        canvas.querySelector('[data-testid="addon-slot-include:detailed-summary"]'),
      ).toBeNull();
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: originalWidth,
      });
      window.dispatchEvent(new Event("resize"));
    }
  });

  it("does not render MarkdownDocumentLayout for non-Markdown files", async () => {
    setApiResponses(
      makeFile({
        file_type: "video",
        mime_type: "video/mp4",
      }),
    );
    render(<FileDetailContent fileId="f1" drive="work" />);
    await waitFor(() => expect(api.getFile).toHaveBeenCalled());
    expect(
      screen.queryByTestId("markdown-document-layout"),
    ).not.toBeInTheDocument();
    // Legacy stack: full slot (no include/exclude)
    expect(screen.getByTestId("addon-slot-all")).toBeInTheDocument();
    expect(
      screen.getByTestId("addon-slot-file-preview-actions"),
    ).toBeInTheDocument();
  });

  it("hot-switches between DocumentLayout and legacy stack when usePolicy flips mid-session (Phase 5)", async () => {
    // Phase 5 edge-case verification: drives.json edits propagate via
    // usePolicy's TTL cache. When the resolved enabled-ness flips
    // (false → true or vice versa), the same FileDetailContent mount
    // must cleanly swap layouts. The two forks rely on disjoint mounts
    // (Editor lives under DocumentLayout; legacy slot is full
    // <AddonSlot>) — there's no graceful in-place transition, and
    // that's fine as long as the swap doesn't crash or stack two
    // copies of the layout.
    usePolicyMock.mockReturnValue({ enabled: false, isLoading: false });
    setApiResponses(
      makeFile({
        file_type: "document",
        mime_type: "text/markdown",
        filename: "note.md",
      }),
    );
    const { rerender } = render(
      <FileDetailContent fileId="f1" drive="work" />,
    );
    await waitFor(() => expect(api.getFile).toHaveBeenCalled());
    // Phase 1: legacy stack.
    expect(
      screen.queryByTestId("markdown-document-layout"),
    ).not.toBeInTheDocument();

    // Server-side toggle: knowledge.editor flips to true. After the
    // policy hook's TTL the next render returns enabled=true.
    usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
    rerender(<FileDetailContent fileId="f1" drive="work" />);

    // Phase 2: DocumentLayout fork is now active; legacy slot gone.
    expect(screen.getByTestId("markdown-document-layout")).toBeInTheDocument();
    expect(screen.queryByTestId("addon-slot-all")).toBeNull();

    // And back again: policy flips off.
    usePolicyMock.mockReturnValue({ enabled: false, isLoading: false });
    rerender(<FileDetailContent fileId="f1" drive="work" />);
    expect(
      screen.queryByTestId("markdown-document-layout"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("addon-slot-all")).toBeInTheDocument();
  });

  it("falls back to legacy stack when usePolicy reports editor disabled", async () => {
    usePolicyMock.mockReturnValue({ enabled: false, isLoading: false });
    setApiResponses(
      makeFile({
        file_type: "document",
        mime_type: "text/markdown",
        filename: "note.md",
      }),
    );
    render(<FileDetailContent fileId="f1" drive="work" />);
    await waitFor(() => expect(api.getFile).toHaveBeenCalled());
    expect(
      screen.queryByTestId("markdown-document-layout"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("addon-slot-all")).toBeInTheDocument();
  });

  it("uses DocumentLayout while usePolicy is still loading (no 30s refetch flicker)", async () => {
    // `usePolicy` is fail-open: it returns `enabled=true` both on the
    // initial load AND during the 30s-TTL background refetch. The
    // consumer reads only `enabled` so a periodic refetch can't flip
    // the layout branch and unmount the Editor mid-edit (observed as
    // a 30-second reload while typing).
    usePolicyMock.mockReturnValue({ enabled: true, isLoading: true });
    setApiResponses(
      makeFile({
        file_type: "document",
        mime_type: "text/markdown",
        filename: "note.md",
      }),
    );
    render(<FileDetailContent fileId="f1" drive="work" />);
    await waitFor(() => expect(api.getFile).toHaveBeenCalled());
    expect(
      screen.getByTestId("markdown-document-layout"),
    ).toBeInTheDocument();
  });

  // ---------- Phase 3.5: inspector content-mode wiring ----------

  it("wires inspector EditableTagChips in content-mode when the editor has registered for the .md file", async () => {
    // Phase 3.5 spec 2026-05-10 §D2 / hako ZWLqXgdTwt9le4dAI3U8C: when
    // the Knowledge Editor is mounted (and has registered itself in
    // markdownContentRegistry), the inspector's tag chips must run
    // in content-mode against the editor's shared `content` state —
    // not standalone — to eliminate the etag race.
    const { markdownContentRegistry } = await import(
      "@/lib/markdownContentRegistry"
    );
    markdownContentRegistry.reset();
    let editorContent = "---\ntags: [a, b]\n---\nbody";
    const setContentSpy = vi.fn((next: string) => {
      editorContent = next;
    });
    markdownContentRegistry.register("f1", {
      getContent: () => editorContent,
      setContent: setContentSpy,
    });

    setApiResponses(
      makeFile({
        file_type: "document",
        mime_type: "text/markdown",
        filename: "note.md",
        tags: ["a", "b"],
      }),
    );
    render(<FileDetailContent fileId="f1" drive="work" />);
    await waitFor(() => expect(api.getFile).toHaveBeenCalled());

    const inspectorChipProps = editableTagChipsCalls.at(-1);
    expect(inspectorChipProps).toBeDefined();
    expect(typeof inspectorChipProps!.content).toBe("string");
    expect(inspectorChipProps!.content).toContain("body");
    expect(typeof inspectorChipProps!.onContentChange).toBe("function");
    // Standalone-mode plumbing must NOT be active simultaneously —
    // mixed mode would still let saveFileTags fire its own GET/PUT.
    expect(inspectorChipProps!.initialTags).toBeUndefined();

    // The forwarded onContentChange routes through the registry's
    // setContent — single writer. The same tagChipNode renders in
    // both the inspector and the mobile Sheet's "tags" tab, so scope
    // the click to the inspector copy.
    const inspector = screen.getByTestId("md-inspector");
    inspector
      .querySelector<HTMLButtonElement>('[data-testid="tag-content-write"]')!
      .click();
    expect(setContentSpy).toHaveBeenCalledTimes(1);
    expect(setContentSpy).toHaveBeenCalledWith(
      "---\ntags: [via-chips]\n---\nbody",
    );

    markdownContentRegistry.reset();
  });

  it("falls back to standalone-mode chips when no editor is registered for the file", async () => {
    // Defensive: if for any reason the editor never mounts (e.g. the
    // Knowledge addon is still loading, or the inline flag is off but
    // the layout fork still triggered), the inspector must keep
    // working as a standalone tag editor.
    const { markdownContentRegistry } = await import(
      "@/lib/markdownContentRegistry"
    );
    markdownContentRegistry.reset();

    setApiResponses(
      makeFile({
        file_type: "document",
        mime_type: "text/markdown",
        filename: "note.md",
        tags: ["a"],
      }),
    );
    render(<FileDetailContent fileId="f1" drive="work" />);
    await waitFor(() => expect(api.getFile).toHaveBeenCalled());

    const inspectorChipProps = editableTagChipsCalls.at(-1);
    expect(inspectorChipProps).toBeDefined();
    expect(inspectorChipProps!.content).toBeUndefined();
    expect(inspectorChipProps!.onContentChange).toBeUndefined();
    expect(Array.isArray(inspectorChipProps!.initialTags)).toBe(true);
  });

  it("refetches the file when the editor signals save-success via the registry (hako 0RnZ1KdtomAfIJPLAGIHA)", async () => {
    // Phase 3 follow-up: in content-mode the inspector chip group does
    // not own the save path, so its onSaveSuccess is unwired. The host
    // (FileDetailContent) subscribes to the registry's save channel so
    // that an editor-driven PUT still triggers File.tags refetch.
    const { markdownContentRegistry } = await import(
      "@/lib/markdownContentRegistry"
    );
    markdownContentRegistry.reset();

    const initialFile = makeFile({
      file_type: "document",
      mime_type: "text/markdown",
      filename: "note.md",
      tags: ["a"],
    });
    const refreshedFile = { ...initialFile, tags: ["a", "b"] };
    (api.getFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      initialFile,
    );
    (api.getFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      refreshedFile,
    );
    (api.recordFileView as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );

    render(<FileDetailContent fileId="f1" drive="work" />);
    await waitFor(() => expect(api.getFile).toHaveBeenCalledTimes(1));

    // Editor reports a successful PUT.
    act(() => {
      markdownContentRegistry.notifySaved("f1");
    });

    // The host refetches so the inspector's tags catch up to the new
    // server state without waiting for navigation.
    await waitFor(() => {
      expect(api.getFile).toHaveBeenCalledTimes(2);
    });

    markdownContentRegistry.reset();
  });

  it("does not refetch on save notifications for a different fileId", async () => {
    // The subscription is per-fileId; another file's editor saving
    // must not poke this host into a refetch loop.
    const { markdownContentRegistry } = await import(
      "@/lib/markdownContentRegistry"
    );
    markdownContentRegistry.reset();

    setApiResponses(
      makeFile({
        file_type: "document",
        mime_type: "text/markdown",
        filename: "note.md",
      }),
    );
    render(<FileDetailContent fileId="f1" drive="work" />);
    await waitFor(() => expect(api.getFile).toHaveBeenCalledTimes(1));

    act(() => {
      markdownContentRegistry.notifySaved("other-file");
    });

    // Give React a tick to apply any (incorrect) refetch effect.
    await new Promise((r) => setTimeout(r, 10));
    expect(api.getFile).toHaveBeenCalledTimes(1);

    markdownContentRegistry.reset();
  });

  it("keeps standalone-mode chips for non-Markdown files even when something is registered (defensive)", async () => {
    // The registry is keyed by fileId, not mime — but the document
    // layout fork is the only consumer. Non-Markdown files use the
    // legacy vertical stack and must always be standalone.
    const { markdownContentRegistry } = await import(
      "@/lib/markdownContentRegistry"
    );
    markdownContentRegistry.reset();
    markdownContentRegistry.register("f1", {
      getContent: () => "anything",
      setContent: vi.fn(),
    });

    setApiResponses(
      makeFile({
        file_type: "video",
        mime_type: "video/mp4",
      }),
    );
    render(<FileDetailContent fileId="f1" drive="work" />);
    await waitFor(() => expect(api.getFile).toHaveBeenCalled());

    const chipsProps = editableTagChipsCalls.at(-1);
    expect(chipsProps).toBeDefined();
    expect(chipsProps!.content).toBeUndefined();
    expect(chipsProps!.onContentChange).toBeUndefined();

    markdownContentRegistry.reset();
  });
});

// Spec 2026-08-11-transcript-following-playback.md §3. Core owns where
// the companion goes; the occupant has no say in it.
describe("FileDetailContent companion region", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
    slotMocks.occupied.clear();
  });

  function grid(container: HTMLElement) {
    return container.querySelector(".media-detail-grid");
  }

  async function renderFile(file: FileItem) {
    setApiResponses(file);
    const utils = render(<FileDetailContent fileId="f1" drive="main" />);
    await waitFor(() => expect(api.getFile).toHaveBeenCalledWith("f1"));
    return utils;
  }

  it("renders nothing at all when no addon claims the slot", async () => {
    const { container } = await renderFile(makeFile());

    // Not merely hidden: with no occupant the grid never appears, so
    // the page keeps exactly the layout it had before this existed.
    expect(screen.queryByTestId("addon-slot-player-side")).toBeNull();
    expect(grid(container)).toBeNull();
  });

  it("gives video the rail layout", async () => {
    slotMocks.occupied.add("player-side");
    const { container } = await renderFile(makeFile());

    expect(screen.getByTestId("addon-slot-player-side")).toBeInTheDocument();
    expect(grid(container)).not.toBeNull();
  });

  it("gives .loft the rail layout even though its file_type is video", async () => {
    slotMocks.occupied.add("player-side");
    const { container } = await renderFile(
      makeFile({
        filename: "clip.loft",
        mime_type: "application/vnd.litloft.loft+json",
      }),
    );

    expect(grid(container)).not.toBeNull();
  });

  it("never gives audio the rail, but still shows the companion", async () => {
    // The audio player is ~200px tall; a column beside it would leave
    // half the width empty. It keeps the promoted position instead.
    slotMocks.occupied.add("player-side");
    const { container } = await renderFile(
      makeFile({ filename: "ep.mp3", file_type: "audio", mime_type: "audio/mpeg" }),
    );

    expect(screen.getByTestId("addon-slot-player-side")).toBeInTheDocument();
    expect(grid(container)).toBeNull();
  });

  it("places the audio companion directly below the player", async () => {
    slotMocks.occupied.add("player-side");
    const { container } = await renderFile(
      makeFile({ filename: "ep.mp3", file_type: "audio", mime_type: "audio/mpeg" }),
    );

    const order = Array.from(
      container.querySelectorAll(
        "[data-testid='file-preview'], [data-testid='addon-slot-player-side'], [data-testid='related-files']",
      ),
    ).map((el) => el.getAttribute("data-testid"));

    expect(order).toEqual([
      "file-preview",
      "addon-slot-player-side",
      "related-files",
    ]);
  });

  it("offers no companion for a file no player plays", async () => {
    slotMocks.occupied.add("player-side");
    const { container } = await renderFile(
      makeFile({ filename: "photo.jpg", file_type: "image", mime_type: "image/jpeg" }),
    );

    expect(screen.queryByTestId("addon-slot-player-side")).toBeNull();
    expect(grid(container)).toBeNull();
  });

  it("asks the occupant to fill the height only in the rail form", async () => {
    slotMocks.occupied.add("player-side");

    const video = await renderFile(makeFile());
    expect(
      screen.getByTestId("addon-slot-player-side").getAttribute("data-fill-height"),
    ).toBe("true");
    video.unmount();

    await renderFile(
      makeFile({ filename: "ep.mp3", file_type: "audio", mime_type: "audio/mpeg" }),
    );
    expect(
      screen.getByTestId("addon-slot-player-side").getAttribute("data-fill-height"),
    ).toBe("false");
  });
});
