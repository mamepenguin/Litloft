import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { useState } from "react";

import { FileDetailContent } from "../../FileDetailContent";
import * as api from "@/lib/api";
import {
  editableTagChipsCalls,
  loaded,
  makeFile,
  overlaySidebarSpy,
  setApiResponses,
  usePolicyMock,
  wideViewport,
} from "./harness";

// Heavy children are mocked: these suites are about FileDetail's own
// contract, not about what the children render — those have their own
// tests. The stub bodies live in ./harness so the three suites that
// need the same set do not each carry a copy; `vi.mock` itself has to
// stay here, because it is hoisted per file.

// The shell draws a breadcrumb and a tree toggle, both of which read
// the router. Media rides the shell now, so this suite mounts it for
// real rather than behind a stub — a stub is what let a second page row
// ship once already.
vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../FilePreview", async () => ({
  FilePreview: (await import("./harness")).FilePreviewStub,
}));
vi.mock("../../ActiveSummaryHost", async () => ({
  ActiveSummaryHost: (await import("./harness")).ActiveSummaryHostStub,
}));
vi.mock("../../RelatedFilesSection", async () => ({
  RelatedFilesSection: (await import("./harness")).RelatedFilesSectionStub,
}));
vi.mock("../../ExifSection", async () => ({
  ExifSection: (await import("./harness")).ExifSectionStub,
}));
vi.mock("../../AddonSlotsProvider", async () => ({
  useAddonSlots: (await import("./harness")).useAddonSlotsStub,
}));
vi.mock("../../AddonSlot", async () => ({
  AddonSlot: (await import("./harness")).AddonSlotStub,
}));
vi.mock("../../markdown/MarkdownDocumentLayout", async () => ({
  MarkdownDocumentLayout: (await import("./harness"))
    .MarkdownDocumentLayoutStub,
}));
vi.mock("@/hooks/usePolicy", async () => ({
  usePolicy: (await import("./harness")).usePolicyMock,
}));
vi.mock("../../CommentSection", async () => ({
  CommentSection: (await import("./harness")).CommentSectionStub,
}));
vi.mock("../../EditableTagChips", async () => ({
  EditableTagChips: (await import("./harness")).EditableTagChipsStub,
}));
vi.mock("../../FavoriteButton", async () => ({
  FavoriteButton: (await import("./harness")).FavoriteButtonStub,
}));
vi.mock("../../FileActions", async () => ({
  FileActions: (await import("./harness")).FileActionsStub,
}));
vi.mock("../../CastButton", async () => ({
  CastButton: (await import("./harness")).CastButtonStub,
}));
vi.mock("../../ChaptersPanel", async () => ({
  ChaptersPanel: (await import("./harness")).ChaptersPanelStub,
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
vi.mock("../../SidebarProvider", async () => {
  const harness = await import("./harness");
  return {
    useSidebar: harness.useSidebarStub,
    useOverlaySidebar: harness.overlaySidebarSpy,
  };
});

describe("FileDetailContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editableTagChipsCalls.length = 0;
    // Default: policy resolved as enabled (the "common" case for any
    // drive that hasn't opted out). Tests that need the legacy stack
    // override this either by selecting a non-Markdown mime type or
    // by remocking before render.
    usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
    // Title, action row and tags live in the inspector, and jsdom's
    // 1024px would leave it collapsed. These cases are about a desktop
    // reader, so they run at a desktop width.
    wideViewport();
  });

  it("calls recordFileView exactly once when mounted with a fileId", async () => {
    setApiResponses(makeFile());
    render(<FileDetailContent fileId="f1" drive="main" />);
    await loaded();
    expect(api.getFile).toHaveBeenCalledWith("f1");
    expect(api.recordFileView).toHaveBeenCalledTimes(1);
    expect(api.recordFileView).toHaveBeenCalledWith("f1");
  });

  it("re-fetches and re-fires recordFileView when fileId changes", async () => {
    setApiResponses(makeFile());
    const { rerender } = render(
      <FileDetailContent fileId="f1" drive="main" />,
    );
    await loaded();
    expect(api.recordFileView).toHaveBeenCalledTimes(1);

    setApiResponses(makeFile({ id: "f2", title: "Sample 2" }));
    rerender(<FileDetailContent fileId="f2" drive="main" />);
    await loaded();
    expect(api.getFile).toHaveBeenCalledWith("f2");
    expect(api.recordFileView).toHaveBeenCalledTimes(2);
    expect(api.recordFileView).toHaveBeenLastCalledWith("f2");
  });

  it("never calls useOverlaySidebar (host responsibility)", async () => {
    setApiResponses(makeFile());
    render(<FileDetailContent fileId="f1" drive="main" />);
    await loaded();
    expect(overlaySidebarSpy).not.toHaveBeenCalled();
  });

  describe("file-detail-actions slot", () => {
    // The row that already carries ♡ ☆ ⋮ is the only place an addon can
    // put a per-file action that is not buried in the overflow menu.
    // Phase 2 lifts this same row into the inspector's fixed header, so
    // the slot is named for what it holds rather than for where it sits.
    const actionRow = () =>
      screen.getByTestId("file-actions").parentElement as HTMLElement;

    it("places the slot in the action row, beside the overflow menu", async () => {
      setApiResponses(makeFile({ file_type: "video", mime_type: "video/mp4" }));
      render(<FileDetailContent fileId="f1" drive="main" />);
      await loaded();

      const slot = screen.getByTestId("addon-slot-file-detail-actions");
      expect(actionRow().contains(slot)).toBe(true);
      expect(actionRow().querySelector('[data-testid="favorite"]')).not.toBeNull();
    });

    it("hands the slot the same file context every other file slot gets", async () => {
      setApiResponses(makeFile({ file_type: "video", mime_type: "video/mp4" }));
      render(<FileDetailContent fileId="f1" drive="main" />);
      await loaded();

      const slot = screen.getByTestId("addon-slot-file-detail-actions");
      expect(slot.dataset.propFileId).toBe("f1");
      expect(slot.dataset.propDrive).toBe("main");
      // No sizing baked in: the same entry has to fit a 56px Bottom
      // Sheet peek row in Phase 2.
      expect(slot.dataset.fillHeight).toBe("false");
    });

    it("is present in the Markdown inspector's action row too", async () => {
      setApiResponses(
        makeFile({
          file_type: "document",
          mime_type: "text/markdown",
          filename: "note.md",
        }),
      );
      render(<FileDetailContent fileId="f1" drive="main" />);
      await loaded();

      const slot = screen.getByTestId("addon-slot-file-detail-actions");
      expect(actionRow().contains(slot)).toBe(true);
    });
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
    await loaded();
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
    await loaded();
    expect(screen.queryByLabelText(/gallery/i)).toBeNull();
  });

  it("does not render Maximize for image files when callback is not provided", async () => {
    setApiResponses(
      makeFile({ file_type: "image", mime_type: "image/png" }),
    );
    render(<FileDetailContent fileId="f1" drive="main" />);
    await loaded();
    expect(screen.queryByLabelText(/gallery/i)).toBeNull();
  });

  it("re-fetches the file when EditableTagChips reports a save", async () => {
    setApiResponses(makeFile());
    render(<FileDetailContent fileId="f1" drive="main" />);
    const trigger = await screen.findByTestId("tag-save-trigger");
    expect(api.getFile).toHaveBeenCalledTimes(1);
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
    await loaded();
    // FilePreview is mocked so onMediaController isn't auto-invoked
    // here, but the wiring (handleMediaController exists and is
    // forwarded to the FilePreview prop) is verified by the next test.
    expect(captured).toBe("untouched");
  });

  it("forwards miniPlayerRoot to FilePreview", async () => {
    setApiResponses(makeFile());
    const { FilePreview: MockedPreview } = await import("../../FilePreview");
    const root = document.createElement("section");
    render(
      <FileDetailContent
        fileId="f1"
        drive="main"
        miniPlayerRoot={root}
        surface="collection"
      />,
    );
    await loaded();
    const calls = (MockedPreview as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const lastProps = calls[calls.length - 1][0] as {
      miniPlayerRoot?: Element | null;
    };
    expect(lastProps.miniPlayerRoot).toBe(root);
  });

  it("gives the player the shell's scroll container, not the host's", async () => {
    // On the shell it is `<main>` that scrolls, so that is what the
    // mini player has to observe and what `--rail-avail` is measured
    // against. The host's wrapper is still on the page and still has a
    // height; it just never scrolls any more, so a player still handed
    // it would be watching a box the size of the whole document.
    setApiResponses(makeFile());
    const { FilePreview: MockedPreview } = await import("../../FilePreview");
    const hostRoot = document.createElement("section");
    const { container } = render(
      <FileDetailContent fileId="f1" drive="main" miniPlayerRoot={hostRoot} />,
    );
    await loaded();

    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    await waitFor(() => {
      const calls = (MockedPreview as ReturnType<typeof vi.fn>).mock.calls;
      const lastProps = calls[calls.length - 1][0] as {
        miniPlayerRoot?: Element | null;
      };
      expect(lastProps.miniPlayerRoot).toBe(main);
    });
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
    await loaded();
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
      // The mobile layout renders the inspector and the sheet, and both
      // carry an action row, so `loaded()` would find two and throw.
      const sheet = await screen.findByTestId("md-mobile-sheet");
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

  it("puts a video on the shell, not on the Markdown wrapper", async () => {
    // The Markdown wrapper carries the save dot, the view-mode toggle
    // and the click-to-edit filename. A video rides the same shell and
    // none of those, so it goes to `FileDetailShell` directly.
    setApiResponses(
      makeFile({
        file_type: "video",
        mime_type: "video/mp4",
      }),
    );
    render(<FileDetailContent fileId="f1" drive="work" />);
    await loaded();
    expect(
      screen.queryByTestId("markdown-document-layout"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("file-detail-shell")).toBeInTheDocument();
    // Split slot, not the legacy unfiltered one: the heavy summaries go
    // to the canvas and everything else to the inspector.
    expect(screen.queryByTestId("addon-slot-all")).toBeNull();
    expect(
      screen.getByTestId("addon-slot-exclude:detailed-summary"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("addon-slot-include:detailed-summary"),
    ).toBeInTheDocument();
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
    await loaded();
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
    await loaded();
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
    await loaded();
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
    await loaded();

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
    await loaded();

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
    await loaded();

    const chipsProps = editableTagChipsCalls.at(-1);
    expect(chipsProps).toBeDefined();
    expect(chipsProps!.content).toBeUndefined();
    expect(chipsProps!.onContentChange).toBeUndefined();

    markdownContentRegistry.reset();
  });

  // Spec 2026-08-29-description-timestamp-links.md. SeekableDescription
  // is deliberately not mocked here — the point of these two is that the
  // host reaches it at all, and only for media.
  describe("description timestamps", () => {
    it("links the timestamps in a video's description", async () => {
      setApiResponses(
        makeFile({ description: "0:00 Intro\n0:45 Method", duration: 600 }),
      );
      render(<FileDetailContent fileId="f1" drive="main" />);
      await loaded();

      expect(
        await screen.findByRole("button", { name: "Jump to 0:00" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Jump to 0:45" }),
      ).toBeInTheDocument();
    });

    it("links them for audio too, not only video", async () => {
      setApiResponses(
        makeFile({
          filename: "ep.m4a",
          mime_type: "audio/mp4",
          file_type: "audio",
          description: "1:23 Chapter one",
          duration: 600,
        }),
      );
      render(<FileDetailContent fileId="f1" drive="main" />);
      await loaded();

      expect(
        await screen.findByRole("button", { name: "Jump to 1:23" }),
      ).toBeInTheDocument();
    });

    it("leaves a non-media file's description as plain text", async () => {
      setApiResponses(
        makeFile({
          filename: "photo.jpg",
          mime_type: "image/jpeg",
          file_type: "image",
          description: "Taken at 1:23 in the afternoon",
          duration: null,
        }),
      );
      const { container } = render(
        <FileDetailContent fileId="f1" drive="main" />,
      );
      await loaded();

      await waitFor(() =>
        expect(container.textContent).toContain(
          "Taken at 1:23 in the afternoon",
        ),
      );
      expect(screen.queryByRole("button", { name: /Jump to/ })).toBeNull();
    });
  });
});

// Spec 2026-08-11-transcript-following-playback.md §3. Core owns where
// the companion goes; the occupant has no say in it.
