/**
 * Leaves `markdown/MarkdownDocumentLayout` real and stubs the leaves below
 * it, as FileDetailPageRow.test.tsx does. The `knowledge-edit` slot is a
 * recorder, so the props core hands the addon are observable without it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, type ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { FileDetailContent } from "../../FileDetailContent";
import * as api from "@/lib/api";
import { putFileTextContent } from "@/lib/fileContent";
import type { SlotEntry } from "@/lib/addons";
import {
  makeFile,
  relationMocks,
  setApiResponses,
  setViewport,
  usePolicyMock,
} from "./harness";

const h = vi.hoisted(() => ({
  search: "" as string,
  slots: {
    loading: false,
    catalogueDrive: "main" as string | null | undefined,
    hasKnowledgeEdit: true,
  },
  slotRenders: [] as Array<Record<string, unknown>>,
  mounts: { count: 0 },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/notes",
  useSearchParams: () => new URLSearchParams(h.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
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
vi.mock("../../ExifSection", async () => ({
  ExifSection: (await import("./harness")).ExifSectionStub,
}));
vi.mock("../../AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    catalogueDrive: h.slots.catalogueDrive,
    slots: {},
    loading: h.slots.loading,
    getSlotEntries: (slotId: string): SlotEntry[] =>
      slotId === "file-detail-sections" && h.slots.hasKnowledgeEdit
        ? [{ id: "knowledge-edit", label: "Edit" } as SlotEntry]
        : [],
    hasSlot: (slotId: string) =>
      slotId === "file-detail-sections" && h.slots.hasKnowledgeEdit,
  }),
}));
vi.mock("../../AddonSlot", async () => {
  const harness = await import("./harness");
  function KnowledgeEditProbe({ props }: { props: Record<string, unknown> }) {
    useEffect(() => {
      h.mounts.count += 1;
    }, []);
    h.slotRenders.push(props);
    return (
      <div
        data-testid="knowledge-edit-stub"
        data-plain-text={props.plainTextDocument === true ? "true" : "false"}
        data-highlight={
          typeof props.highlight === "string" ? props.highlight : ""
        }
      />
    );
  }
  return {
    SlotEntryRenderer: harness.SlotEntryRendererStub,
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
    }): ReactNode => {
      if (id !== "file-detail-sections" || !h.slots.hasKnowledgeEdit) return null;
      const shown = includeIds
        ? includeIds.includes("knowledge-edit")
        : !excludeIds?.includes("knowledge-edit");
      return shown ? <KnowledgeEditProbe props={props ?? {}} /> : null;
    },
  };
});
vi.mock("@/hooks/usePolicy", async () => ({
  usePolicy: (await import("./harness")).usePolicyMock,
}));
vi.mock("../../CommentSection", async () => ({
  CommentSection: (await import("./harness")).CommentSectionStub,
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
  getFileShared: (id: string) =>
    (vi.mocked(api.getFile) as unknown as (id: string) => unknown)(id),
  recordFileView: vi.fn(),
  likeFile: vi.fn(),
  dislikeFile: vi.fn(),
  updateFile: vi.fn(),
  renameFile: vi.fn(),
  updateFileTags: vi.fn().mockResolvedValue(undefined),
  getDriveTags: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/fileContent", () => ({
  getFileTextContent: vi.fn(),
  putFileTextContent: vi.fn(),
  ConflictError: class ConflictError extends Error {},
}));
vi.mock("@/lib/recentlyPlayed", () => ({ addRecentlyPlayed: vi.fn() }));
vi.mock("../../SidebarProvider", async () => {
  const harness = await import("./harness");
  return {
    useSidebar: harness.useSidebarStub,
    useOverlaySidebar: harness.overlaySidebarSpy,
  };
});

const txtFile = (over: Parameters<typeof makeFile>[0] = {}) =>
  makeFile({
    filename: "notes.txt",
    title: "Some Title",
    mime_type: "text/plain",
    file_type: "document",
    file_size: 120,
    folder_path: "",
    ...over,
  });

const MAX = 1_048_576;

function mount(file = txtFile(), surface: "canonical" | "collection" = "canonical", extra = {}) {
  setApiResponses(file);
  return render(
    <FileDetailContent
      fileId="f1"
      drive="main"
      surface={surface}
      {...extra}
    />,
  );
}

async function isDocument() {
  await waitFor(() =>
    expect(
      screen
        .queryAllByTestId("knowledge-edit-stub")
        .some((el) => el.dataset.plainText === "true"),
    ).toBe(true),
  );
  return screen
    .getAllByTestId("knowledge-edit-stub")
    .find((el) => el.dataset.plainText === "true")!;
}
const isCanvasText = () => screen.findByTestId("file-preview");
const pressed = (id: string) =>
  screen.getByTestId(`view-mode-${id}`).getAttribute("aria-pressed");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR", "true");
  h.search = "";
  h.slots.loading = false;
  h.slots.catalogueDrive = "main";
  h.slots.hasKnowledgeEdit = true;
  h.slotRenders.length = 0;
  h.mounts.count = 0;
  relationMocks.value = [];
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  setViewport();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("SPEC-CORE-020 which files take the document layout", () => {
  it("opens a .txt in the document layout and mounts the knowledge-edit slot with plainTextDocument and the search term", async () => {
    mount(txtFile(), "canonical", { highlight: "needle" });
    const stub = await isDocument();
    expect(stub.dataset.plainText).toBe("true");
    expect(stub.dataset.highlight).toBe("needle");
    expect(screen.queryByTestId("file-preview")).toBeNull();
    expect(screen.getAllByTestId("knowledge-edit-stub")).toHaveLength(1);
  });

  it("decides on the name case-insensitively", async () => {
    mount(txtFile({ filename: "NOTES.TXT" }));
    expect((await isDocument()).dataset.plainText).toBe("true");
  });

  it("takes a file of exactly 1,048,576 bytes", async () => {
    mount(txtFile({ file_size: MAX }));
    expect((await isDocument()).dataset.plainText).toBe("true");
  });

  it("takes an empty .txt", async () => {
    mount(txtFile({ file_size: 0 }));
    expect((await isDocument()).dataset.plainText).toBe("true");
  });

  it("does the same on the collection surface", async () => {
    mount(txtFile(), "collection");
    expect((await isDocument()).dataset.plainText).toBe("true");
    expect(screen.queryByTestId("file-preview")).toBeNull();
  });

  const control = async () => {
    const view = mount(txtFile());
    expect((await isDocument()).dataset.plainText).toBe("true");
    view.unmount();
    h.slotRenders.length = 0;
  };

  const fallbacks: Array<[string, () => void, ReturnType<typeof txtFile>]> = [
    ["a .txt one byte over 1 MiB", () => undefined, txtFile({ file_size: MAX + 1 })],
    ["a .bat sharing text/plain", () => undefined, txtFile({ filename: "run.bat" })],
    ["a .c sharing text/plain", () => undefined, txtFile({ filename: "main.c" })],
    ["a .md recorded as text/plain", () => undefined, txtFile({ filename: "note.md" })],
    [
      "a .txt on a drive whose editor policy is off",
      () => usePolicyMock.mockReturnValue({ enabled: false, isLoading: false }),
      txtFile(),
    ],
    [
      "a .txt with the inline editor flag off",
      () => vi.stubEnv("NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR", "false"),
      txtFile(),
    ],
    [
      "a .txt with the knowledge addon absent",
      () => {
        h.slots.hasKnowledgeEdit = false;
      },
      txtFile(),
    ],
  ];

  it.each(fallbacks)(
    "leaves %s on the canvas viewer with no editor",
    async (_label, arrange, file) => {
      await control();
      arrange();
      mount(file);
      await isCanvasText();
      expect(screen.queryByTestId("view-mode-edit")).toBeNull();
      for (const stub of screen.queryAllByTestId("knowledge-edit-stub")) {
        expect(stub.dataset.plainText).toBe("false");
      }
    },
  );
});

describe("SPEC-CORE-020 deciding needs the addon's slot list for this drive (I8)", () => {
  it("draws the skeleton, and neither viewer nor editor, until the slot list arrives", async () => {
    h.slots.loading = true;
    h.slots.catalogueDrive = undefined;
    const view = mount();
    await waitFor(() => expect(api.getFile).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("file-detail-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("file-preview")).toBeNull();
    expect(screen.queryByTestId("knowledge-edit-stub")).toBeNull();

    h.slots.loading = false;
    h.slots.catalogueDrive = "main";
    view.rerender(<FileDetailContent fileId="f1" drive="main" />);
    expect((await isDocument()).dataset.plainText).toBe("true");
  });

  it("keeps waiting while the catalogue belongs to another drive", async () => {
    h.slots.catalogueDrive = "other";
    mount();
    await waitFor(() => expect(api.getFile).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("file-detail-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("file-preview")).toBeNull();
    expect(screen.queryByTestId("knowledge-edit-stub")).toBeNull();
  });

  it("falls back to the canvas viewer when the slot list request failed (empty catalogue)", async () => {
    mount();
    await isDocument();
    cleanup();
    h.slots.hasKnowledgeEdit = false;
    mount();
    await isCanvasText();
  });

  it("falls back to the canvas viewer when the editor policy turns out off after loading", async () => {
    usePolicyMock.mockReturnValue({ enabled: true, isLoading: true });
    const view = mount();
    await waitFor(() => expect(api.getFile).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });

    usePolicyMock.mockReturnValue({ enabled: false, isLoading: false });
    view.rerender(<FileDetailContent fileId="f1" drive="main" />);

    await isCanvasText();
    for (const stub of screen.queryAllByTestId("knowledge-edit-stub")) {
      expect(stub.dataset.plainText).toBe("false");
    }
  });

  it("keeps the canvas viewer of a policy-off .txt while the policy is refetched", async () => {
    usePolicyMock.mockReturnValue({ enabled: false, isLoading: false });
    const view = mount();
    await isCanvasText();

    usePolicyMock.mockReturnValue({ enabled: true, isLoading: true });
    view.rerender(<FileDetailContent fileId="f1" drive="main" />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("file-preview")).toBeInTheDocument();
  });

  it("does not unmount a mounted plain-text document when the catalogue reloads", async () => {
    const view = mount();
    await isDocument();
    const mounted = h.mounts.count;

    h.slots.loading = true;
    h.slots.catalogueDrive = "other";
    view.rerender(<FileDetailContent fileId="f1" drive="main" />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("knowledge-edit-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("file-preview")).toBeNull();
    expect(h.mounts.count).toBe(mounted);
  });
});

describe("SPEC-CORE-020 the page row and the two-way switch (I5)", () => {
  it("draws one page row on the canonical surface", async () => {
    mount();
    await isDocument();
    expect(screen.getAllByTestId("file-detail-chrome")).toHaveLength(1);
    expect(screen.getAllByTestId("file-detail-back")).toHaveLength(1);
  });

  it("draws the same number of page rows on the collection surface as a .md does", async () => {
    const md = mount(
      makeFile({
        filename: "note.md",
        mime_type: "text/markdown",
        file_type: "document",
      }),
      "collection",
    );
    await screen.findByTestId("view-mode-edit");
    const expected = screen.queryAllByTestId("file-detail-chrome").length;
    md.unmount();

    mount(txtFile(), "collection");
    await isDocument();
    expect(screen.queryAllByTestId("file-detail-chrome")).toHaveLength(expected);
  });

  it.each([1400, 400])("offers Read and Edit only, at %ipx", async (width) => {
    setViewport(width);
    mount();
    await isDocument();
    expect(screen.getByTestId("view-mode-edit")).toBeInTheDocument();
    expect(screen.getByTestId("view-mode-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("view-mode-split")).toBeNull();
  });

  it("opens in Read", async () => {
    mount();
    await isDocument();
    expect(pressed("preview")).toBe("true");
    expect(pressed("edit")).toBe("false");
  });

  it("opens in Edit when the URL carries ?edit=1", async () => {
    h.search = "edit=1";
    mount();
    await isDocument();
    expect(pressed("edit")).toBe("true");
  });

  it("switches between Read and Edit", async () => {
    mount();
    await isDocument();
    fireEvent.click(screen.getByTestId("view-mode-edit"));
    expect(pressed("edit")).toBe("true");
    fireEvent.click(screen.getByTestId("view-mode-preview"));
    expect(pressed("preview")).toBe("true");
  });
});

describe("SPEC-CORE-020 the title row of a plain-text document (I3)", () => {
  async function openRename(filename: string) {
    mount(txtFile({ filename }));
    await isDocument();
    return screen.getByRole("button", { name: "Click to rename" });
  }

  it("shows the filename's stem as the editable part and the suffix fixed beside it", async () => {
    const button = await openRename("report.txt");
    expect(button).toHaveTextContent(/^report$/);
    const row = button.parentElement!;
    expect(row).toHaveTextContent("report.txt");
    expect(row).not.toHaveTextContent("Some Title");
  });

  it.each([
    ["report.txt", "renamed", "renamed.txt"],
    ["REPORT.TXT", "renamed", "renamed.TXT"],
  ])("renaming %s with %s sends %s", async (filename, typed, sent) => {
    (api.renameFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      txtFile({ filename: sent }),
    );
    const button = await openRename(filename);
    const mounted = h.mounts.count;
    fireEvent.click(button);
    const input = screen.getByLabelText("Filename") as HTMLInputElement;
    expect(input.value).toBe(filename.replace(/\.txt$/i, ""));
    expect(input.closest("form")).toHaveTextContent(filename.slice(-4));
    fireEvent.change(input, { target: { value: typed } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(api.renameFile).toHaveBeenCalledWith("f1", sent));
    await screen.findByText(sent.replace(/^[^.]*/, ""));
    expect(screen.getByTestId("knowledge-edit-stub")).toBeInTheDocument();
    expect(h.mounts.count).toBe(mounted);
  });
});

describe("SPEC-CORE-020 tag chips on a plain-text document (I3)", () => {
  it("write File.tags through the flat endpoint and never the file's content", async () => {
    mount(txtFile({ tags: ["old"] }));
    await isDocument();
    expect(screen.getByTestId("view-mode-edit")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Remove old" }));
    await waitFor(() => expect(api.updateFileTags).toHaveBeenCalledWith("f1", []));
    expect(putFileTextContent).not.toHaveBeenCalled();
  });
});
