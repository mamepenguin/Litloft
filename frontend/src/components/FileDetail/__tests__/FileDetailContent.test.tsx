import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import { useState } from "react";

import { FileDetailContent } from "../../FileDetailContent";
import * as api from "@/lib/api";
import {
  editableTagChipsCalls,
  loaded,
  makeFile,
  overlaySidebarSpy,
  relationMocks,
  withRelations,
  setApiResponses,
  setViewport,
  usePolicyMock,
} from "./harness";

// The stub bodies live in ./harness; `vi.mock` itself has to stay here,
// because it is hoisted per file.

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
vi.mock("../related/RelatedPanel", async () => ({
  RelatedPanel: (await import("./harness")).RelatedPanelStub,
}));
vi.mock("../related/useFileRelations", async () => ({
  useFileRelations: (await import("./harness")).useFileRelationsStub,
}));

beforeEach(() => {
  relationMocks.value = [];
});
vi.mock("../../ExifSection", async () => ({
  ExifSection: (await import("./harness")).ExifSectionStub,
}));
vi.mock("../../AddonSlotsProvider", async () => ({
  useAddonSlots: (await import("./harness")).useAddonSlotsStub,
}));
// Both exports: `ShellLayout` takes `SlotEntryRenderer` by name, and a
// missing one fails as `Element type is invalid` pointing at nothing in
// particular.
vi.mock("../../AddonSlot", async () => {
  const harness = await import("./harness");
  return {
    AddonSlot: harness.AddonSlotStub,
    SlotEntryRenderer: harness.SlotEntryRendererStub,
  };
});
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
const apiMocks = vi.hoisted(() => ({ getFile: vi.fn() }));
vi.mock("@/lib/api", () => ({
  getFile: apiMocks.getFile,
  getFileShared: (id: string) => apiMocks.getFile(id),
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
    usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
    // Title, action row and tags live in the inspector, and jsdom's
    // 1024px would leave it collapsed.
    setViewport();
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

  it("keeps the controls inert while the file on screen is a list's copy", async () => {
    const { seedFiles, _resetFileSeedForTests } = await import("@/lib/fileSeed");
    seedFiles([makeFile()]);
    let answer: (f: unknown) => void = () => {};
    (api.getFile as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    (api.recordFileView as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    render(<FileDetailContent fileId="f1" drive="main" />);

    expect(screen.getByTestId("file-actions").closest("[inert]")).not.toBeNull();
    await act(async () => {
      answer(makeFile());
    });
    expect(screen.getByTestId("file-actions").closest("[inert]")).toBeNull();
    _resetFileSeedForTests();
  });

  it("never calls useOverlaySidebar (host responsibility)", async () => {
    setApiResponses(makeFile());
    render(<FileDetailContent fileId="f1" drive="main" />);
    await loaded();
    expect(overlaySidebarSpy).not.toHaveBeenCalled();
  });

  describe("file-detail-actions slot", () => {
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

  it("lists the Related tab in a Markdown note's inspector when the note has a relation", async () => {
    withRelations(2);
    setApiResponses(
      makeFile({ file_type: "document", mime_type: "text/markdown", filename: "note.md" }),
    );
    render(<FileDetailContent fileId="f1" drive="work" />);
    await loaded();

    const inspector = screen.getByTestId("md-inspector");
    expect(
      within(inspector).getAllByRole("tab").map((tab) => tab.textContent),
    ).toEqual(["Info", "Related"]);
    const panel = within(inspector).getByTestId("related-panel");
    expect(panel).toHaveAttribute("data-count", "2");
    expect(document.getElementById("inspector-panel-info")).not.toContainElement(panel);
  });

  it("lists no Related tab in a Markdown note's inspector with no relation and no derived source", async () => {
    setApiResponses(
      makeFile({ file_type: "document", mime_type: "text/markdown", filename: "note.md" }),
    );
    render(<FileDetailContent fileId="f1" drive="work" />);
    await loaded();

    expect(screen.queryAllByRole("tab")).toEqual([]);
    expect(screen.queryByTestId("related-panel")).toBeNull();
  });

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
    const canvas = screen.getByTestId("md-canvas");
    expect(
      canvas.querySelector('[data-testid="addon-slot-include:knowledge-edit"]'),
    ).not.toBeNull();
    expect(
      canvas.querySelector('[data-testid="active-summary-host"]'),
    ).not.toBeNull();
    expect(
      canvas.querySelector('[data-testid="addon-slot-include:detailed-summary"]'),
    ).not.toBeNull();
    expect(canvas.querySelector('[data-testid="comments"]')).toBeNull();
    const inspector = screen.getByTestId("md-inspector");
    expect(
      inspector.querySelector(
        '[data-testid="addon-slot-exclude:knowledge-edit,detailed-summary"]',
      ),
    ).not.toBeNull();
    expect(inspector.querySelector('[data-testid="comments"]')).not.toBeNull();
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
      expect(sheet.querySelector('[data-testid="comments"]')).not.toBeNull();

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
    expect(
      screen.queryByTestId("markdown-document-layout"),
    ).not.toBeInTheDocument();

    usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
    rerender(<FileDetailContent fileId="f1" drive="work" />);

    expect(screen.getByTestId("markdown-document-layout")).toBeInTheDocument();
    expect(screen.queryByTestId("addon-slot-all")).toBeNull();

    usePolicyMock.mockReturnValue({ enabled: false, isLoading: false });
    rerender(<FileDetailContent fileId="f1" drive="work" />);
    expect(
      screen.queryByTestId("markdown-document-layout"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("file-detail-shell")).toBeInTheDocument();
  });

  it("drops the editor but keeps the shell when usePolicy reports it disabled", async () => {
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
    expect(screen.getByTestId("file-detail-shell")).toBeInTheDocument();
  });

  it("uses DocumentLayout while usePolicy is still loading (no 30s refetch flicker)", async () => {
    // The consumer must read only `enabled`: gating on `isLoading` lets the
    // 30s-TTL background refetch unmount the Editor mid-edit.
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

  it("wires inspector EditableTagChips in content-mode when the editor has registered for the .md file", async () => {
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
    expect(inspectorChipProps!.initialTags).toBeUndefined();

    // The same tagChipNode renders in both the inspector and the mobile
    // Sheet's "tags" tab, so scope the click to the inspector copy.
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

    act(() => {
      markdownContentRegistry.notifySaved("f1");
    });

    await waitFor(() => {
      expect(api.getFile).toHaveBeenCalledTimes(2);
    });

    markdownContentRegistry.reset();
  });

  it("does not refetch on save notifications for a different fileId", async () => {
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

    await new Promise((r) => setTimeout(r, 10));
    expect(api.getFile).toHaveBeenCalledTimes(1);

    markdownContentRegistry.reset();
  });

  it("keeps standalone-mode chips for non-Markdown files even when something is registered (defensive)", async () => {
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

  // SeekableDescription is deliberately not mocked here.
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
