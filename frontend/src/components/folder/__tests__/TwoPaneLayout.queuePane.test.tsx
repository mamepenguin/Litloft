/**
 * SPEC-CORE-190 step 12 / I13: a queue started with the tree setting off
 * shows its pane for the visit, yields like any pane, and is hidden and
 * re-shown by the button without writing `tree:enabled`.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { treeEnabledStore } from "@/lib/treeEnabledStore";
import { treeVisitStore } from "@/lib/treeVisitStore";
import { treeYieldStore } from "@/lib/treeYieldStore";
import type { FileItem } from "@/types";

const route = {
  pathname: "/drive/work/collections/c1",
  params: new URLSearchParams("file=f1"),
};
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => route.pathname,
  useSearchParams: () => route.params,
}));

vi.mock("@/components/SidebarProvider", () => ({
  useSidebar: () => ({ requestRefresh: vi.fn() }),
  useOverlaySidebarWhen: () => {},
}));
vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({
    clipboard: null,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    clear: vi.fn(),
    isCut: () => false,
  }),
}));
vi.mock("@/components/FileDetailContent", () => ({
  FileDetailContent: ({ fileId }: { fileId: string }) => <div data-testid="file-view">{fileId}</div>,
}));
vi.mock("@/components/ImageGallery", () => ({ ImageGallery: () => null }));

const file: FileItem = {
  image_width: null,
  image_height: null,
  id: "f1",
  filename: "f1.mp4",
  title: "File f1",
  description: "",
  drive: "work",
  folder_path: "Q1",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 100,
  duration: 60,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "",
  updated_at: "",
  modified_at: null,
};

vi.mock("@/lib/api", () => ({
  getFileShared: () => Promise.resolve(file),
  getFile: () => Promise.resolve(file),
  getFileNeighbors: () => Promise.resolve({ prev_id: null, next_id: null, position: null, total: null }),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  recordFileView: vi.fn(),
  likeFile: vi.fn(),
  dislikeFile: vi.fn(),
  updateFile: vi.fn(),
  getDriveFiles: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 8 } }),
  getDrives: vi.fn().mockResolvedValue([]),
  getWatchHistory: vi.fn().mockResolvedValue([]),
  getDriveTags: vi.fn().mockResolvedValue([]),
  getPins: vi.fn().mockResolvedValue([]),
  getCollections: vi.fn().mockResolvedValue([]),
  getSmartFolders: vi.fn().mockResolvedValue([]),
  getDriveSummary: vi.fn().mockResolvedValue({ missing_count: 0 }),
  getAuthStatus: vi.fn().mockResolvedValue({ is_admin: false }),
  createTextFile: vi.fn(),
}));

import { TreeToggle } from "../../TreeToggle";
import { useLeftPane } from "@/lib/leftPaneContext";

import { TwoPaneLayout } from "../TwoPaneLayout";

function PaneProbe() {
  const pane = useLeftPane();
  return (
    <div data-testid="pane-rows" data-shown={String(pane?.shownBySetting)}>
      rows
    </div>
  );
}

const aside = () => document.querySelector("aside")!;

/** The toolbar toggle, not the pane's own narrow close button. */
const treeToggleButton = () =>
  screen
    .getAllByRole("button", { name: /^(Hide|Show) tree$/ })
    .find((button) => !aside().contains(button))!;

function renderQueue({ queuePane }: { queuePane: boolean }) {
  return render(
    <>
      <TwoPaneLayout
        drive="work"
        folderPath=""
        queuePane={queuePane}
        leftPane={<PaneProbe />}
        leftPaneAriaLabel="Queue"
      >
        <div data-testid="listing" />
      </TwoPaneLayout>
      <TreeToggle drive="work" />
    </>,
  );
}

beforeEach(() => {
  localStorage.clear();
  treeEnabledStore.reset();
  treeVisitStore.reset();
  treeYieldStore.reset();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  });
});

afterEach(() => {
  treeEnabledStore.reset();
  treeVisitStore.reset();
  treeYieldStore.reset();
});

describe("SPEC-CORE-190 step 12 / I13 a queue pane shown for the visit", () => {
  it("is shown and reported to the left-pane context with the setting off, and the button hides and re-shows it without writing", async () => {
    renderQueue({ queuePane: true });

    await waitFor(() =>
      expect(screen.getByTestId("pane-rows")).toHaveAttribute("data-shown", "true"),
    );
    expect(aside().getAttribute("aria-hidden")).not.toBe("true");
    expect(aside().className).toContain("md:w-[280px]");
    expect(localStorage.getItem("tree:enabled:work")).toBeNull();

    fireEvent.click(treeToggleButton());
    await waitFor(() => expect(aside().getAttribute("aria-hidden")).toBe("true"));
    expect(localStorage.getItem("tree:enabled:work")).toBeNull();

    fireEvent.click(treeToggleButton());
    await waitFor(() => expect(aside().getAttribute("aria-hidden")).not.toBe("true"));
    expect(localStorage.getItem("tree:enabled:work")).toBeNull();
  });

  it("leaves the pane hidden without a queue", async () => {
    renderQueue({ queuePane: false });

    await waitFor(() => expect(screen.getByTestId("file-view")).toHaveTextContent("f1"));
    expect(screen.queryByTestId("pane-rows")).toBeNull();
    expect(aside().getAttribute("aria-hidden")).toBe("true");
    expect(treeToggleButton()).toHaveAttribute("aria-pressed", "false");
    expect(localStorage.getItem("tree:enabled:work")).toBeNull();
  });
});
