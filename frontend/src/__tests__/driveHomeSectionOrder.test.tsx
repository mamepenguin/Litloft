/**
 * The order of the drive home's sections.
 *
 * Read after the page has loaded, not on the first render: every section
 * draws its heading while its fetch is still in flight, so the skeleton
 * spells the full sequence whatever the data turns out to be.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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

// `satisfies`, not a cast: a card that dereferences a field this omits
// throws inside React's render, which vitest reports as an unhandled
// error rather than a failing case — green on counts, non-zero exit.
const file = (id: string) =>
  ({
    id,
    filename: `${id}.mp4`,
    title: id,
    description: "",
    drive: "media",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1024,
    duration: 120,
    image_width: null,
    image_height: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified" as const,
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-01-01T00:00:00",
  }) satisfies FileItem;

const watched = (id: string) =>
  ({
    ...file(id),
    watch_progress: { position: 1, duration: 10 },
  }) satisfies WatchHistoryItem;

const SECTIONS_IN_ORDER = [
  "Continue Watching",
  "Pickup",
  "Recently Viewed",
  "Recently Added",
  "Favorites",
  "Liked",
];

const SECTIONS_WITHOUT_A_PROFILE = ["Pickup", "Recently Added", "Favorites", "Liked"];

// Every heading below the page's own. Filtering to one level lets a row
// that spells its heading differently slip into the sequence unseen; the
// `<h1>` is the page naming itself, not a section.
const order = () =>
  screen
    .queryAllByRole("heading")
    .filter((h) => h.tagName !== "H1")
    .map((h) => h.textContent ?? "");

/** Resolves once the fetches have landed and the rows hold their files. */
const loaded = () => screen.findAllByText("a");

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
    await loaded();
    expect(order()).toEqual(SECTIONS_IN_ORDER);
  });

  it("draws the slot for a reader with no profile, with the watch rows gone", async () => {
    // The slot is the only section on this page that does not need a
    // profile. Its neighbours both do, so this is what is left.
    render(<DriveHome driveName="media" />);
    await loaded();
    expect(order()).toEqual(SECTIONS_WITHOUT_A_PROFILE);
  });
});
