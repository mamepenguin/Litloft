/**
 * The order the drive home puts its sections in.
 *
 * Spec §6.2 fixes the sequence and arbitration 7 moves the addon slot
 * into the middle of it: what fills that slot is a *suggestion*, so it
 * sits beside "what you were in the middle of" and ahead of the plain
 * record of what you opened.
 *
 * **Order is the property, so order is what is read.** Every other test
 * of this page asks whether a section is present; a page that draws all
 * of them in the wrong sequence passes all of those. The list below is
 * declared per state, not collected from the render, so a section that
 * stops being drawn shortens one side of the equality by itself
 * (detector rule 5).
 *
 * The addon slot is stood in for by something that draws a heading in
 * the same shape a real widget does — the intelligence addon's `pickup`
 * is the one filler today, and it renders core's own `CarouselSection`.
 * What is held here is the slot's *position*, not what any addon puts
 * in it.
 *
 * Not held: spacing, whether a section is above the fold, or what the
 * page looks like when several are empty at once. jsdom lays nothing out
 * (`.claude/rules/review-workflow.md`).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mockProfile = { nickname: null as string | null };
vi.mock("@/components/ProfileProvider", () => ({ useProfile: () => mockProfile }));
vi.mock("@/components/ClipboardProvider", () => ({
  useClipboard: () => ({ clipboard: null, clear: vi.fn(), copy: vi.fn(), cut: vi.fn(), paste: vi.fn(), isCut: () => false }),
}));
vi.mock("@/components/TreeRefreshContext", () => ({ useTreeRefresh: () => vi.fn() }));
vi.mock("@/hooks/useWebSocketRefresh", () => ({ useWebSocketRefresh: () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: ({ id }: { id: string }) =>
    id === "drive-home-sections" ? (
      <section>
        <h2>Pickup</h2>
      </section>
    ) : null,
}));

const mockGetDriveFiles = vi.fn();
const mockGetWatchHistory = vi.fn();
vi.mock("@/lib/api", () => ({
  getDriveFiles: (...a: unknown[]) => mockGetDriveFiles(...a),
  getWatchHistory: (...a: unknown[]) => mockGetWatchHistory(...a),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

import { DriveHome } from "@/components/DriveHome";
import type { FileItem, WatchHistoryItem } from "@/types";

/**
 * A file complete enough for `FileCard` to render.
 *
 * `tags` in particular: the card reads `file.tags.length` unguarded, and
 * a fixture without it throws inside React's render — which vitest
 * reports as an unhandled error rather than a failing case, so the suite
 * goes green and the run still fails.
 */
const file = (id: string) =>
  ({
    id,
    title: id,
    filename: `${id}.mp4`,
    file_type: "video",
    mime_type: "video/mp4",
    tags: [],
    subtitles: [],
  }) as unknown as FileItem;

const watched = (id: string) =>
  ({
    ...file(id),
    watch_progress: { position: 1, duration: 10 },
  }) as unknown as WatchHistoryItem;

/**
 * The sequence, top to bottom, with a profile and every section holding
 * something. Written out rather than derived; the addon slot's place in
 * it is the subject of arbitration 7.
 */
const SECTIONS_IN_ORDER = [
  "Continue Watching",
  "Pickup",
  "Recently Viewed",
  "Recently Added",
  "Favorites",
  "Liked",
];

/** The same page for a reader with no profile: the watch rows drop out. */
const SECTIONS_WITHOUT_A_PROFILE = ["Pickup", "Recently Added", "Favorites", "Liked"];

const order = () =>
  screen.queryAllByRole("heading", { level: 2 }).map((h) => h.textContent ?? "");

describe("the drive home's section order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockProfile.nickname = null;
    mockGetDriveFiles.mockResolvedValue({
      data: [file("a")],
      meta: { total: 1, page: 1, limit: 12 },
    });
    mockGetWatchHistory.mockResolvedValue([watched("v1")]);
  });

  it("puts the addon slot between the two watch rows", async () => {
    mockProfile.nickname = "Alice";
    render(<DriveHome driveName="media" />);
    await waitFor(() => expect(order()).toEqual(SECTIONS_IN_ORDER));
  });

  it("keeps the slot where it is when there is no profile to gate around", async () => {
    // The watch rows are the slot's neighbours, and they are the two
    // that disappear. What must not happen is the slot moving to the end
    // because the things above it went away.
    render(<DriveHome driveName="media" />);
    await waitFor(() => expect(order()).toEqual(SECTIONS_WITHOUT_A_PROFILE));
  });
});
