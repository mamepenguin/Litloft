/**
 * SPEC-CORE-094 on the canonical route when the file cannot be read:
 * `RightPaneFile`'s error state, inside the real `AppShell`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";

import { _resetFileSeedForTests } from "@/lib/fileSeed";
import {
  appHeader,
  belowHeader,
  installMatchMedia,
  linksTo,
  setWidth,
} from "../../FileDetail/__tests__/headerRowHarness";

const mockGetFile = vi.fn();
vi.mock("@/lib/api", () => ({
  getFile: vi.fn(),
  getFileShared: (...args: unknown[]) => mockGetFile(...args),
  getFileNeighbors: vi.fn().mockResolvedValue({ prev_id: null, next_id: null }),
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
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

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
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

vi.mock("@/components/CurrentDriveProvider", async (orig) => ({
  ...(await orig<object>()),
  useCurrentDrive: () => "work",
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
vi.mock("@/hooks/useFileNav", () => ({
  useFileNav: () => ({
    prevId: null,
    nextId: null,
    position: null,
    total: null,
    navigatePrev: vi.fn(),
    navigateNext: vi.fn(),
  }),
}));
vi.mock("@/hooks/useSelectedFile", () => ({
  useSelectedFile: () => ({ fileId: null, selectFile: vi.fn(), clearFile: vi.fn() }),
}));

import { AppShell } from "@/components/AppShell";
import { RightPaneFile } from "../RightPaneFile";

beforeEach(() => {
  mockGetFile.mockReset();
  _resetFileSeedForTests();
  installMatchMedia();
});

afterEach(() => {
  cleanup();
});

describe("SPEC-CORE-094 the canonical route when the file cannot be read", () => {
  for (const width of [1024, 390]) {
    it(`SPEC-CORE-094 failure case (canonical failed, ${width}px) / I1: the drive crumb alone is in the header, and the pane keeps its not-found text`, async () => {
      setWidth(width);
      mockGetFile.mockRejectedValue(new Error("API error: 404"));
      render(
        <AppShell>
          <RightPaneFile fileId="abc123" drive="work" />
        </AppShell>,
      );

      expect(await screen.findByText("File not found")).toBeInTheDocument();
      expect(within(belowHeader()).getByText("File not found")).toBeInTheDocument();

      await waitFor(() =>
        expect(
          linksTo(appHeader(), "/drive/work").some((a) =>
            (a.textContent ?? "").includes("work"),
          ),
        ).toBe(true),
      );
      expect(linksTo(appHeader(), "/drive/work/Q1")).toHaveLength(0);
      expect(linksTo(belowHeader(), "/drive/work")).toHaveLength(0);
    });
  }
});
