/**
 * SPEC-CORE-094 on the collection route (`/files/{id}`) before a file is
 * there: loading, and failed. The real `AppShell` draws the header.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { _resetFileSeedForTests } from "@/lib/fileSeed";
import {
  appHeader,
  belowHeader,
  installMatchMedia,
  setWidth,
} from "../FileDetail/__tests__/headerRowHarness";

const mockGetFile = vi.fn();
vi.mock("@/lib/api", () => ({
  getFile: vi.fn(),
  getFileShared: (...args: unknown[]) => mockGetFile(...args),
  getFileNeighbors: vi.fn().mockResolvedValue({ prev_id: null, next_id: null }),
  recordFileView: vi.fn(),
  likeFile: vi.fn(),
  dislikeFile: vi.fn(),
  updateFile: vi.fn(),
  getDrives: vi.fn().mockResolvedValue([]),
  getDriveFiles: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 8 } }),
  getWatchHistory: vi.fn().mockResolvedValue([]),
  getDriveTags: vi.fn().mockResolvedValue([]),
  getPins: vi.fn().mockResolvedValue([]),
  getCollections: vi.fn().mockResolvedValue([]),
  getSmartFolders: vi.fn().mockResolvedValue([]),
  getDriveSummary: vi.fn().mockResolvedValue({ missing_count: 0 }),
  getAuthStatus: vi.fn().mockResolvedValue({ is_admin: false }),
  createTextFile: vi.fn(),
}));

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockBack = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: mockBack,
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/files/abc",
  useParams: () => ({ id: "abc" }),
}));

vi.mock("@/components/SidebarProvider", async (orig) => ({
  ...(await orig<object>()),
  useOverlaySidebar: vi.fn(),
}));
vi.mock("@/components/CurrentDriveProvider", async (orig) => ({
  ...(await orig<object>()),
  useCurrentDrive: () => null,
  useSetOverrideDrive: () => vi.fn(),
}));
vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname: null, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));
vi.mock("@/components/Sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null, SlotEntryRenderer: () => null }));
vi.mock("@/components/FileDetailContent", () => ({
  FileDetailContent: () => <div data-testid="file-detail-content" />,
}));
vi.mock("@/components/ImageGallery", () => ({ ImageGallery: () => null }));
vi.mock("@/components/CollectionPanel", () => ({
  CollectionPanel: () => null,
  getCollectionOnEnded: () => null,
}));
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    catalogueDrive: null,
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
  }),
}));
vi.mock("@/hooks/usePolicy", () => ({
  usePolicy: () => ({ enabled: true, isLoading: false }),
}));
vi.mock("@/hooks/useFileNav", () => ({
  useFileNav: vi.fn(() => ({ prevId: null, nextId: null })),
}));

import { AppShell } from "../AppShell";
import { FileDetailFullScreen } from "../FileDetailFullScreen";

const backControls = (root: HTMLElement) =>
  within(root).queryAllByRole("button", { name: /back/i });

function renderPage() {
  return render(
    <AppShell>
      <FileDetailFullScreen fileId="abc" />
    </AppShell>,
  );
}

const STATES: [string, () => void][] = [
  ["loading", () => mockGetFile.mockReturnValue(new Promise(() => {}))],
  ["failed", () => mockGetFile.mockRejectedValue(new Error("API error: 404"))],
];

beforeEach(() => {
  mockGetFile.mockReset();
  mockPush.mockReset();
  mockReplace.mockReset();
  mockBack.mockReset();
  _resetFileSeedForTests();
  installMatchMedia();
});

afterEach(() => {
  cleanup();
});

describe("SPEC-CORE-094 the collection route with no file yet", () => {
  for (const width of [1024, 390]) {
    for (const [state, arrange] of STATES) {
      it(`SPEC-CORE-094 failure case (collection ${state}, ${width}px) / I1: the back control is in the header, with no trail after it and no row below it`, async () => {
        setWidth(width);
        arrange();
        renderPage();

        await waitFor(() => expect(backControls(appHeader())).not.toHaveLength(0));
        expect(backControls(belowHeader())).toHaveLength(0);
        expect(within(appHeader()).queryAllByRole("navigation")).toHaveLength(0);
      });
    }
  }

  it("SPEC-CORE-094 I5: the header's back control is the host's handler, not a link to a folder", async () => {
    setWidth(1024);
    mockGetFile.mockReturnValue(new Promise(() => {}));
    renderPage();

    await waitFor(() => expect(backControls(appHeader())).not.toHaveLength(0));
    const back = backControls(appHeader())[0];
    expect(back.tagName).toBe("BUTTON");
    fireEvent.click(back);
    expect(mockPush.mock.calls.flat().filter((url) => String(url).startsWith("/drive/"))).toEqual(
      [],
    );
  });

  it("SPEC-CORE-094 I4: leaving the collection route restores the ordinary header", async () => {
    setWidth(390);
    mockGetFile.mockReturnValue(new Promise(() => {}));
    const view = renderPage();
    await waitFor(() => expect(backControls(appHeader())).not.toHaveLength(0));

    view.rerender(
      <AppShell>
        <p>another screen</p>
      </AppShell>,
    );
    expect(backControls(appHeader())).toHaveLength(0);
    expect(within(appHeader()).getByRole("button", { name: "Quick note" })).toBeInTheDocument();
    expect(within(appHeader()).getByRole("button", { name: "Profile Setup" })).toBeInTheDocument();
    expect(screen.getByText("another screen")).toBeInTheDocument();
  });
});
