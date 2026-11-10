/**
 * Home's Continue row as a desk: SPEC-CORE-069 (the row and its See all)
 * and SPEC-CORE-070 (set-aside), invariants I9 and I10 of
 * docs/specs/home-continue-desk.md. Labels are the English messages.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { ToastProvider } from "@/components/ToastProvider";
import type { WatchHistoryItem } from "@/types";

const mockProfile = { nickname: "Alice" as string | null, setNickname: vi.fn(), clearNickname: vi.fn() };
vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => mockProfile,
  ProfileProvider: ({ children }: { children: React.ReactNode }) => children,
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

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
  }),
}));
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => null }));
vi.mock("@/components/TreeRefreshContext", () => ({ useTreeRefresh: () => vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

const mockGetDriveFiles = vi.fn();
const mockGetWatchHistory = vi.fn();
const mockDismiss = vi.fn();
const mockDeleteProgress = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
  getWatchHistory: (...args: unknown[]) => mockGetWatchHistory(...args),
  dismissContinueItem: (...args: unknown[]) => mockDismiss(...args),
  deleteWatchProgress: (...args: unknown[]) => mockDeleteProgress(...args),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

import { DriveHome } from "@/components/DriveHome";

const item = (id: string): WatchHistoryItem => ({
  image_width: null,
  image_height: null,
  id,
  filename: `${id}.mp4`,
  title: `Video ${id}`,
  description: "",
  drive: "media",
  folder_path: "",
  file_type: "video",
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: false,
  file_size: 1024,
  duration: 300,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified",
  trust_reviewed_at: null,
  created_at: "2026-01-01T00:00:00",
  updated_at: "2026-01-01T00:00:00",
  watch_progress: { position: 60, duration: 300 },
});

function renderHome() {
  return render(
    <ToastProvider>
      <DriveHome driveName="media" />
    </ToastProvider>,
  );
}

async function section(name: string): Promise<HTMLElement> {
  const heading = await screen.findByRole("heading", { level: 2, name });
  return heading.closest("section") as HTMLElement;
}

function menuLabels(): string[] {
  return screen.getAllByRole("menuitem").map((el) => el.textContent?.trim() ?? "");
}

async function openMenuOn(row: string, title: string) {
  fireEvent.contextMenu(within(await section(row)).getByText(title));
  await screen.findAllByRole("menuitem");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockProfile.nickname = "Alice";
  mockGetDriveFiles.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 12 } });
  mockGetWatchHistory.mockImplementation(async (_drive: string, _limit: number, filter?: string) =>
    filter === "continue" || filter === "all" ? [item("v1"), item("v2")] : [],
  );
  mockDismiss.mockResolvedValue(undefined);
  mockDeleteProgress.mockResolvedValue(undefined);
});

describe("SPEC-CORE-069 I9 Home's Continue row", () => {
  it("SPEC-CORE-069 is headed Continue and asks for the desk, 12 at most", async () => {
    renderHome();

    await section("Continue");
    expect(screen.queryByRole("heading", { level: 2, name: "Continue Watching" })).toBeNull();
    const calls = mockGetWatchHistory.mock.calls;
    expect(calls.some(([d, limit, filter]) => d === "media" && limit === 12 && filter === "continue")).toBe(true);
    expect(calls.some(([d, limit, filter]) => d === "media" && limit === 12 && filter === "all")).toBe(true);
    expect(calls.every(([, , filter]) => filter === "continue" || filter === "all")).toBe(true);
  });
});

describe("SPEC-CORE-069 I10 the row's See all", () => {
  it("SPEC-CORE-069 sends Continue to ?view=continue and Recently Viewed to ?view=recent", async () => {
    renderHome();

    const viewOf = async (row: string) => {
      const link = within(await section(row)).getByRole("link", { name: /See all/ });
      return new URL(link.getAttribute("href")!, "http://x").searchParams.get("view");
    };
    expect(await viewOf("Continue")).toBe("continue");
    expect(await viewOf("Recently Viewed")).toBe("recent");
  });
});

describe("SPEC-CORE-070 I9 set-aside from Home", () => {
  it("SPEC-CORE-070 offers Remove from Continue directly above Remove from history on a Continue card", async () => {
    renderHome();
    await openMenuOn("Continue", "Video v1");

    const labels = menuLabels();
    const aside = labels.indexOf("Remove from Continue");
    expect(aside).toBeGreaterThanOrEqual(0);
    expect(labels.indexOf("Remove from history")).toBe(aside + 1);
    const row = screen.getAllByRole("menuitem")[aside];
    expect(row.querySelector("svg.lucide-eye-off")).not.toBeNull();
  });

  it("SPEC-CORE-070 does not offer it on a Recently Viewed card", async () => {
    renderHome();
    await section("Continue");
    await openMenuOn("Recently Viewed", "Video v1");

    expect(menuLabels()).toContain("Remove from history");
    expect(menuLabels()).not.toContain("Remove from Continue");
  });

  it("SPEC-CORE-070 takes the card out of Continue only, after the dismiss succeeds", async () => {
    renderHome();
    await openMenuOn("Continue", "Video v1");

    fireEvent.click(screen.getByRole("menuitem", { name: /Remove from Continue/ }));

    await waitFor(() => expect(mockDismiss).toHaveBeenCalledWith("v1"));
    await waitFor(() =>
      expect(within(screen.getByRole("heading", { level: 2, name: "Continue" }).closest("section")!)
        .queryByText("Video v1")).toBeNull(),
    );
    expect(within(await section("Continue")).getByText("Video v2")).toBeInTheDocument();
    expect(within(await section("Recently Viewed")).getByText("Video v1")).toBeInTheDocument();
    expect(mockDeleteProgress).not.toHaveBeenCalled();
  });

  it("SPEC-CORE-070 keeps the card and says so when the dismiss fails", async () => {
    mockDismiss.mockRejectedValue(new Error("network"));
    renderHome();
    await openMenuOn("Continue", "Video v1");

    fireEvent.click(screen.getByRole("menuitem", { name: /Remove from Continue/ }));

    expect(await screen.findByText("Could not remove from Continue")).toBeInTheDocument();
    expect(mockDismiss).toHaveBeenCalledWith("v1");
    expect(within(await section("Continue")).getByText("Video v1")).toBeInTheDocument();
    expect(within(await section("Recently Viewed")).getByText("Video v1")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryAllByRole("menuitem")).toHaveLength(0));
  });

  it("SPEC-CORE-070 Remove from history still takes the card out of both rows", async () => {
    renderHome();
    await openMenuOn("Continue", "Video v2");

    fireEvent.click(screen.getByRole("menuitem", { name: /Remove from history/ }));

    await waitFor(() => expect(mockDeleteProgress).toHaveBeenCalledWith("v2"));
    await waitFor(() => expect(screen.queryAllByText("Video v2")).toHaveLength(0));
    expect(within(await section("Continue")).getByText("Video v1")).toBeInTheDocument();
    expect(mockDismiss).not.toHaveBeenCalled();
  });
});
