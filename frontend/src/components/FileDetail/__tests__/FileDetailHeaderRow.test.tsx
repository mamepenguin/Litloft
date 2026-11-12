/**
 * SPEC-CORE-094 and SPEC-CORE-095, observed through the real `AppShell` around
 * the real canonical-route file page. jsdom applies no stylesheet, so these
 * cases assert only where things are in the tree and what they do, never
 * which of them a width shows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState, type ReactNode } from "react";

import { AppShell } from "../../AppShell";
import { FileDetailContent } from "../../FileDetailContent";
import * as api from "@/lib/api";
import type { FileItem } from "@/types";
import enMessages from "@/messages-core/en.json";
import { makeFile, relationMocks, usePolicyMock } from "./harness";
import {
  appHeader,
  belowHeader,
  installMatchMedia,
  linksTo,
  setWidth,
} from "./headerRowHarness";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/drive/main/videos/clips",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock("../../CurrentDriveProvider", async (orig) => ({
  ...(await orig<object>()),
  useCurrentDrive: () => "main",
  useSetOverrideDrive: () => () => {},
}));
vi.mock("../../ProfileProvider", () => ({
  useProfile: () => ({ nickname: null, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));
vi.mock("../../Sidebar", () => ({ Sidebar: () => null }));
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
vi.mock("../../AddonSlotsProvider", async () => ({
  useAddonSlots: (await import("./harness")).useAddonSlotsStub,
}));
vi.mock("../../AddonSlot", async () => {
  const harness = await import("./harness");
  return {
    AddonSlot: harness.AddonSlotStub,
    SlotEntryRenderer: harness.SlotEntryRendererStub,
  };
});
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
vi.mock("@/lib/recentlyPlayed", () => ({ addRecentlyPlayed: vi.fn() }));
// Every export is a mock, so a write this suite did not foresee is still
// recorded rather than sent, and `writesSent` can see it.
vi.mock("@/lib/api", async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  const mocked = Object.fromEntries(
    Object.entries(actual).map(([name, value]) => [
      name,
      typeof value === "function" ? vi.fn().mockResolvedValue(undefined) : value,
    ]),
  );
  return {
    ...mocked,
    getFileShared: vi.fn((id: string) => (mocked.getFile as (i: string) => unknown)(id)),
    getDrives: vi.fn().mockResolvedValue([]),
    getDriveFiles: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 8 } }),
    getWatchHistory: vi.fn().mockResolvedValue([]),
    getDriveTags: vi.fn().mockResolvedValue([]),
    getPins: vi.fn().mockResolvedValue([]),
    getCollections: vi.fn().mockResolvedValue([]),
    getSmartFolders: vi.fn().mockResolvedValue([]),
    getDriveSummary: vi.fn().mockResolvedValue({ missing_count: 0 }),
    getAuthStatus: vi.fn().mockResolvedValue({ is_admin: false }),
    getFileNeighbors: vi.fn().mockResolvedValue({ prev_id: null, next_id: null }),
  };
});

const getFile = api.getFile as unknown as ReturnType<typeof vi.fn>;

const WIDE = 1024;
const NARROW = 600;

const video = (overrides: Partial<FileItem> = {}) =>
  makeFile({
    id: "f1",
    filename: "holiday.mp4",
    title: "holiday.mp4",
    folder_path: "videos/clips",
    ...overrides,
  });

const note = (overrides: Partial<FileItem> = {}) =>
  makeFile({
    id: "f1",
    filename: "note.md",
    title: "note.md",
    mime_type: "text/markdown",
    file_type: "document",
    folder_path: "notes",
    ...overrides,
  });

function serve(...files: FileItem[]) {
  getFile.mockImplementation((id: string) => {
    const file = files.find((f) => f.id === id);
    return file ? Promise.resolve(file) : Promise.reject(new Error("API error: 404"));
  });
}

function page(fileId = "f1") {
  return (
    <AppShell>
      <FileDetailContent fileId={fileId} drive="main" />
    </AppShell>
  );
}

/** Mounts the file page and takes it away again without leaving the shell. */
function Leavable({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(true);
  return (
    <AppShell>
      <button type="button" onClick={() => setShown(false)}>
        leave-file-page
      </button>
      {shown ? children : <p>folder listing</p>}
    </AppShell>
  );
}

const inspectorToggle = (root: HTMLElement) =>
  within(root).queryAllByRole("button", { name: /inspector/i });

const treeButtons = () => screen.queryAllByRole("button", { name: /tree/i });

/** A request that would change the file, sent through any mocked export. */
function writesSent(): string[] {
  return Object.entries(api)
    .filter(
      ([name, fn]) =>
        /rename|update|move|put|write|save|patch/i.test(name) &&
        typeof fn === "function" &&
        "mock" in fn &&
        (fn as ReturnType<typeof vi.fn>).mock.calls.length > 0,
    )
    .map(([name]) => name);
}

beforeEach(() => {
  vi.clearAllMocks();
  installMatchMedia();
  relationMocks.value = [];
  usePolicyMock.mockReturnValue({ enabled: true, isLoading: false });
  setWidth(WIDE);
});

afterEach(() => {
  cleanup();
});

describe("SPEC-CORE-094 the file page draws its row in the app header", () => {
  it("SPEC-CORE-094 flow 2 / I1: a loaded file's trail and inspector toggle are in the header, and no row of their own is drawn below it", async () => {
    serve(video());
    render(page());

    await waitFor(() =>
      expect(linksTo(appHeader(), "/drive/main/videos/clips")).not.toHaveLength(0),
    );
    expect(within(appHeader()).getByText("holiday.mp4")).toBeInTheDocument();
    expect(inspectorToggle(appHeader())).toHaveLength(1);

    expect(linksTo(belowHeader(), "/drive/main/videos/clips")).toHaveLength(0);
    expect(linksTo(belowHeader(), "/drive/main")).toHaveLength(0);
    expect(inspectorToggle(belowHeader())).toHaveLength(0);
  });

  it("SPEC-CORE-094 failure case (canonical loading): the skeleton's drive crumb is in the header, not in a row below it", async () => {
    getFile.mockReturnValue(new Promise(() => {}));
    render(page());

    await waitFor(() => expect(linksTo(appHeader(), "/drive/main")).not.toHaveLength(0));
    expect(linksTo(belowHeader(), "/drive/main")).toHaveLength(0);
  });

  it("SPEC-CORE-094 I1: loading → loaded never passes through the ordinary header", async () => {
    let answer: (f: FileItem) => void = () => {};
    getFile.mockReturnValue(new Promise<FileItem>((resolve) => (answer = resolve)));
    render(page());

    const header = appHeader();
    await waitFor(() => expect(linksTo(header, "/drive/main")).not.toHaveLength(0));

    const ordinarySeen: boolean[] = [];
    const observer = new MutationObserver(() => {
      ordinarySeen.push(linksTo(header, "/drive/main").length === 0);
    });
    observer.observe(header, { childList: true, subtree: true, attributes: true });

    await act(async () => answer(video()));
    await waitFor(() =>
      expect(linksTo(header, "/drive/main/videos/clips")).not.toHaveLength(0),
    );
    observer.disconnect();

    expect(ordinarySeen).not.toContain(true);
  });

  it("SPEC-CORE-094 I1: a file → file change never passes through the ordinary header", async () => {
    serve(video(), video({ id: "f2", filename: "other.mp4", title: "other.mp4", folder_path: "videos/other" }));
    const { rerender } = render(page("f1"));

    const header = appHeader();
    await waitFor(() =>
      expect(linksTo(header, "/drive/main/videos/clips")).not.toHaveLength(0),
    );

    const ordinarySeen: boolean[] = [];
    const observer = new MutationObserver(() => {
      ordinarySeen.push(linksTo(header, "/drive/main").length === 0);
    });
    observer.observe(header, { childList: true, subtree: true, attributes: true });

    rerender(page("f2"));
    await waitFor(() =>
      expect(linksTo(header, "/drive/main/videos/other")).not.toHaveLength(0),
    );
    observer.disconnect();

    expect(ordinarySeen).not.toContain(true);
    expect(within(header).queryByText("holiday.mp4")).toBeNull();
  });

  it("SPEC-CORE-094 I3 (wide): search, quick note, the avatar, the tree button and the inspector toggle are all there beside the file row", async () => {
    serve(video());
    render(page());
    await waitFor(() =>
      expect(linksTo(appHeader(), "/drive/main/videos/clips")).not.toHaveLength(0),
    );

    const header = within(appHeader());
    expect(header.getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(header.getByRole("button", { name: "Quick note" })).toBeInTheDocument();
    expect(header.getByRole("button", { name: "Profile Setup" })).toBeInTheDocument();
    expect(inspectorToggle(appHeader())).toHaveLength(1);
    expect(treeButtons()).not.toHaveLength(0);
  });

  it("SPEC-CORE-094 I3 (wide): a rename in progress hides none of them", async () => {
    serve(note());
    render(page());
    const rename = await waitFor(() =>
      within(appHeader()).getByRole("button", { name: "Click to rename" }),
    );
    fireEvent.click(rename);
    expect(within(appHeader()).getByRole("textbox")).toBeInTheDocument();

    const header = within(appHeader());
    expect(header.getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(header.getByRole("button", { name: "Quick note" })).toBeInTheDocument();
    expect(header.getByRole("button", { name: "Profile Setup" })).toBeInTheDocument();
    expect(inspectorToggle(appHeader())).toHaveLength(1);
    expect(header.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(treeButtons()).not.toHaveLength(0);
  });

  for (const width of [WIDE]) {
    it(`SPEC-CORE-094 I4 at ${width}px: leaving the file page leaves no part of its row in the header, and the ordinary controls are back`, async () => {
      setWidth(width);
      serve(video());
      render(
        <Leavable>
          <FileDetailContent fileId="f1" drive="main" />
        </Leavable>,
      );
      await waitFor(() =>
        expect(linksTo(appHeader(), "/drive/main/videos/clips")).not.toHaveLength(0),
      );

      fireEvent.click(screen.getByRole("button", { name: "leave-file-page" }));
      await screen.findByText("folder listing");

      const header = appHeader();
      expect(linksTo(header, "/drive/main/videos/clips")).toHaveLength(0);
      expect(linksTo(header, "/drive/main")).toHaveLength(0);
      expect(within(header).queryByText("holiday.mp4")).toBeNull();
      expect(inspectorToggle(header)).toHaveLength(0);
      expect(within(header).queryAllByRole("button", { name: /^Back/ })).toHaveLength(0);
      expect(within(header).getByRole("button", { name: "Search" })).toBeInTheDocument();
      expect(within(header).getByRole("button", { name: "Quick note" })).toBeInTheDocument();
      expect(within(header).getByRole("button", { name: "Profile Setup" })).toBeInTheDocument();
      expect(treeButtons()).not.toHaveLength(0);
    });
  }

  it("SPEC-CORE-094 I5 (wide): every crumb in the header goes where today's row linked", async () => {
    serve(video());
    render(page());
    await waitFor(() =>
      expect(linksTo(appHeader(), "/drive/main/videos/clips")).not.toHaveLength(0),
    );

    const header = within(appHeader());
    expect(header.getByRole("link", { name: "main" })).toHaveAttribute("href", "/drive/main");
    expect(header.getByRole("link", { name: "videos" })).toHaveAttribute(
      "href",
      "/drive/main/videos",
    );
    expect(header.getByRole("link", { name: "clips" })).toHaveAttribute(
      "href",
      "/drive/main/videos/clips",
    );
  });

  it("SPEC-CORE-094 D4 (narrow): the header-actions slot stays mounted in the file page's row", async () => {
    setWidth(NARROW);
    serve(video());
    render(page());

    await waitFor(() =>
      expect(within(appHeader()).getAllByText("holiday.mp4").length).toBeGreaterThan(0),
    );
    expect(within(appHeader()).getByTestId("addon-slot-header-actions")).toBeInTheDocument();
  });

  it("SPEC-CORE-094 flow 4: the most recently mounted file page owns the row, and the one before it returns when it unmounts", async () => {
    serve(
      video({ id: "f1", folder_path: "alpha", filename: "a.mp4", title: "a.mp4" }),
      video({ id: "f2", folder_path: "beta", filename: "b.mp4", title: "b.mp4" }),
    );
    function Two() {
      const [second, setSecond] = useState(false);
      return (
        <AppShell>
          <button type="button" onClick={() => setSecond((s) => !s)}>
            toggle-second
          </button>
          <FileDetailContent fileId="f1" drive="main" />
          {second && <FileDetailContent fileId="f2" drive="main" />}
        </AppShell>
      );
    }
    render(<Two />);
    await waitFor(() => expect(linksTo(appHeader(), "/drive/main/alpha")).not.toHaveLength(0));

    fireEvent.click(screen.getByRole("button", { name: "toggle-second" }));
    await waitFor(() => expect(linksTo(appHeader(), "/drive/main/beta")).not.toHaveLength(0));
    expect(linksTo(appHeader(), "/drive/main/alpha")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "toggle-second" }));
    await waitFor(() => expect(linksTo(appHeader(), "/drive/main/alpha")).not.toHaveLength(0));
    expect(linksTo(appHeader(), "/drive/main/beta")).toHaveLength(0);
  });

  it("SPEC-CORE-094 I6 / failure case (crossing 768px): a rename in progress keeps its typed text and sends nothing", async () => {
    serve(note());
    render(page());
    const rename = await waitFor(() =>
      within(appHeader()).getByRole("button", { name: "Click to rename" }),
    );
    fireEvent.click(rename);
    const input = within(appHeader()).getByRole("textbox");
    fireEvent.change(input, { target: { value: "renamed-while-rotating" } });

    setWidth(NARROW);
    expect(within(appHeader()).getByRole("textbox")).toHaveValue("renamed-while-rotating");
    expect(within(appHeader()).getByRole("textbox")).toBe(input);

    setWidth(WIDE);
    expect(within(appHeader()).getByRole("textbox")).toHaveValue("renamed-while-rotating");
    expect(within(appHeader()).getByRole("textbox")).toBe(input);

    expect(writesSent()).toEqual([]);
  });

  it("SPEC-CORE-094 I9: the note's view-mode control and save indicator drawn in the header belong to that page's editor", async () => {
    serve(note());
    render(page());
    const edit = await waitFor(() =>
      within(appHeader()).getByRole("button", { name: "Edit" }),
    );
    expect(within(appHeader()).getByTestId("save-dot")).toBeInTheDocument();

    fireEvent.click(edit);
    await waitFor(() =>
      expect(within(appHeader()).getByRole("button", { name: "Edit" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });
});

describe("SPEC-CORE-095 the resting strip raises the sheet", () => {
  const expandLabel = enMessages.inspector.expandSheet;

  const stripButton = () =>
    within(screen.getByTestId("mobile-inspector-peek")).queryByRole("button", {
      name: expandLabel,
    });

  beforeEach(() => {
    setWidth(NARROW);
  });

  it("SPEC-CORE-095 flow 2 / I7 / D8: the strip's file name is one button that raises the sheet to half", async () => {
    serve(video());
    render(page());

    await waitFor(() => expect(stripButton()).not.toBeNull());
    const button = stripButton()!;
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveTextContent("holiday.mp4");

    fireEvent.click(button);
    await screen.findByTestId("mobile-inspector-sheet");
    expect(screen.queryByTestId("mobile-inspector-peek")).toBeNull();
    expect(screen.queryByRole("button", { name: expandLabel })).toBeNull();
  });

  it("SPEC-CORE-095 I7 / D8: the like button beside the name stays separate from it and leaves the sheet at peek", async () => {
    serve(video());
    render(page());
    await waitFor(() => expect(stripButton()).not.toBeNull());

    const strip = within(screen.getByTestId("mobile-inspector-peek"));
    const like = strip.getByRole("button", { name: /like/i });
    expect(stripButton()!.contains(like)).toBe(false);

    fireEvent.click(like);
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByTestId("mobile-inspector-sheet")).toBeNull();
    expect(stripButton()).not.toBeNull();
  });

  it("SPEC-CORE-095 I7 / failure case (loading): the skeleton strip is not a button, and the loaded strip is", async () => {
    let answer: (f: FileItem) => void = () => {};
    getFile.mockReturnValue(new Promise<FileItem>((resolve) => (answer = resolve)));
    render(page());

    expect(screen.queryByRole("button", { name: expandLabel })).toBeNull();

    await act(async () => answer(video()));
    await waitFor(() => expect(stripButton()).not.toBeNull());
  });

  it("SPEC-CORE-095 / SPEC-CORE-094 I3: on a narrow file page the header holds no way to raise the sheet", async () => {
    serve(video());
    render(page());
    await waitFor(() => expect(stripButton()).not.toBeNull());

    expect(within(appHeader()).queryByRole("button", { name: expandLabel })).toBeNull();
    expect(
      within(appHeader()).queryByRole("button", { name: enMessages.inspector.collapseSheet }),
    ).toBeNull();
  });
});
