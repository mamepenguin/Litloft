/**
 * SPEC-CORE-114: hidden Home entries, driven through `DriveHome`.
 * Section 3 and I1 (loading), I2 (one drive's list), I4 and I5 (library, inbox, unknown keys),
 * I9 (failed request), I10 (drive switch). The visibility request is controlled by the test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";

import { WebSocketContext } from "@/components/WebSocketProvider";
import type { AddonMeta } from "@/lib/addons";
import type { FileItem } from "@/types";

const DRIVE = "家族ビデオ";
const OTHER = "archive";
const enc = (drive: string) => `/drive/${encodeURIComponent(drive)}`;

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

let catalogue: Record<string, AddonMeta> = {};
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: catalogue,
    catalogueDrive: DRIVE,
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
  useSearchParams: () => new URLSearchParams("view=home"),
  usePathname: () => enc(DRIVE),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} data-next-link="" {...rest}>
      {children}
    </a>
  ),
}));

const mockGetDriveFiles = vi.fn();
const mockGetWatchHistory = vi.fn();
const mockGetInboxCount = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
  getWatchHistory: (...args: unknown[]) => mockGetWatchHistory(...args),
  getInboxCount: (...args: unknown[]) => mockGetInboxCount(...args),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

import { DriveHome } from "@/components/DriveHome";

// Only the visibility request is controlled here. Every other request is rejected,
// so an unmocked helper cannot answer with a shape the page does not expect.
type Answer = (drive: string) => Promise<Response>;
let answer: Answer = () => new Promise(() => {});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function driveOf(url: string): string | null {
  const m = /\/drives\/([^/]+)\/entry-visibility/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

/** A request the test settles itself, so the loading state can be read first. */
function hold() {
  let settle!: (r: Response | Error) => void;
  const promise = new Promise<Response>((resolve, reject) => {
    settle = (r) => (r instanceof Error ? reject(r) : resolve(r));
  });
  return { promise, settle };
}

const file = (id: string) =>
  ({
    id,
    filename: `${id}.mp4`,
    title: `Clip ${id}`,
    description: "",
    drive: DRIVE,
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

const page = (data: FileItem[]) => ({ data, meta: { total: data.length, page: 1, limit: 12 } });

const addon = (navigation: AddonMeta["navigation"]): AddonMeta => ({
  label: "Product name",
  icon: "package",
  href: "/drive/{drive}/addons/x",
  scope: "drive",
  navigation,
});

/** Two primary addon entries, so the addon row has something to hide and something to keep. */
const ADDONS: Record<string, AddonMeta> = {
  knowledge: addon({ label: "Notes", placement: "primary", priority: 20, icon: "notebook-pen" }),
  photo_diary: addon({ label: "Photo Diary", placement: "primary", priority: 30, icon: "images" }),
};

function Home({ drive }: { drive: string }) {
  return (
    <WebSocketContext.Provider value={{ lastEvent: null, connected: true }}>
      <DriveHome driveName={drive} />
    </WebSocketContext.Provider>
  );
}

const findAppsNav = () => screen.findByRole("navigation", { name: "Apps" });
const hrefs = (nav: HTMLElement) =>
  within(nav).getAllByRole("link").map((a) => a.getAttribute("href"));
/** Waits for the Apps row and for Reading, which is shown only once the visibility list has arrived. */
async function waitForLoadedRow() {
  const nav = await findAppsNav();
  await waitFor(() => expect(within(nav).getByText("Reading")).toBeInTheDocument());
  return nav;
}

beforeEach(() => {
  vi.clearAllMocks();
  catalogue = ADDONS;
  mockProfile.nickname = "Alice";
  answer = () => new Promise(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const drive = driveOf(url);
      return drive === null ? Promise.reject(new TypeError("unmocked request")) : answer(drive);
    }),
  );
  mockGetDriveFiles.mockResolvedValue(page([file("a")]));
  mockGetWatchHistory.mockResolvedValue([]);
  mockGetInboxCount.mockResolvedValue(0);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SPEC-CORE-114 loading state", () => {
  it("SPEC-CORE-114 Section 3 I1: while the list is pending, Video, Reading and addon entries are not shown and Library is", async () => {
    answer = () => new Promise(() => {});
    render(<Home drive={DRIVE} />);
    const nav = await findAppsNav();

    expect(within(nav).getByText("Library")).toBeInTheDocument();
    expect(within(nav).queryByText("Video")).toBeNull();
    expect(within(nav).queryByText("Reading")).toBeNull();
    expect(within(nav).queryByText("Notes")).toBeNull();
    expect(within(nav).queryByText("Photo Diary")).toBeNull();
  });
});

describe("SPEC-CORE-114 failed request", () => {
  it.each([
    ["the request rejects", (h: ReturnType<typeof hold>) => h.settle(new TypeError("network down"))],
    ["the backend answers 500", (h: ReturnType<typeof hold>) => h.settle(json({ detail: "Configuration error" }, 500))],
  ])("SPEC-CORE-114 I9: when %s, every entry appears and no error is shown", async (_label, fail) => {
    const h = hold();
    answer = () => h.promise;
    render(<Home drive={DRIVE} />);
    const nav = await findAppsNav();
    expect(within(nav).queryByText("Reading")).toBeNull();

    act(() => fail(h));
    await waitFor(() => expect(within(nav).getByText("Video")).toBeInTheDocument());
    expect(within(nav).getByText("Reading")).toBeInTheDocument();
    expect(within(nav).getByText("Notes")).toBeInTheDocument();
    expect(within(nav).getByText("Photo Diary")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("SPEC-CORE-114 hidden entries on the Home row", () => {
  it("SPEC-CORE-114 I2 Section 1: a listed built-in removes only that entry and keeps the others in order", async () => {
    answer = async () => json({ hidden: [] });
    render(<Home drive={DRIVE} />);
    const before = hrefs(await waitForLoadedRow());
    cleanup();

    answer = async () => json({ hidden: ["video"] });
    render(<Home drive={DRIVE} />);
    const after = hrefs(await waitForLoadedRow());

    expect(after).toEqual(before.filter((href) => href !== `${enc(DRIVE)}/apps/video`));
    expect(after).not.toContain(`${enc(DRIVE)}/apps/video`);
  });

  it("SPEC-CORE-114 I2: a listed addon key removes only that addon's entry", async () => {
    answer = async () => json({ hidden: [] });
    render(<Home drive={DRIVE} />);
    const nav = await waitForLoadedRow();
    expect(within(nav).getByText("Notes")).toBeInTheDocument();
    cleanup();

    answer = async () => json({ hidden: ["knowledge"] });
    render(<Home drive={DRIVE} />);
    const navAfter = await waitForLoadedRow();
    expect(within(navAfter).queryByText("Notes")).toBeNull();
    expect(within(navAfter).getByText("Photo Diary")).toBeInTheDocument();
    expect(within(navAfter).getByText("Video")).toBeInTheDocument();
  });

  it("SPEC-CORE-114 I4 I5: library and inbox are never removed, and unknown keys change nothing", async () => {
    mockGetInboxCount.mockResolvedValue(3);
    answer = async () => json({ hidden: [] });
    render(<Home drive={DRIVE} />);
    const before = hrefs(await waitForLoadedRow());
    cleanup();

    answer = async () => json({ hidden: ["library", "inbox", "video", "nope"] });
    render(<Home drive={DRIVE} />);
    const nav = await waitForLoadedRow();

    expect(within(nav).getByText("Library")).toBeInTheDocument();
    expect(within(nav).getByText("Inbox")).toBeInTheDocument();
    expect(within(nav).queryByText("Video")).toBeNull();
    expect(hrefs(nav)).toEqual(before.filter((href) => href !== `${enc(DRIVE)}/apps/video`));
  });
});

describe("SPEC-CORE-114 drive switch", () => {
  it("SPEC-CORE-114 I10: when the drive changes, the previous drive's hideable entries are not shown while the new list is pending", async () => {
    answer = async (drive) => (drive === DRIVE ? json({ hidden: ["video"] }) : new Promise(() => {}));
    const { rerender } = render(<Home drive={DRIVE} />);
    const nav = await waitForLoadedRow();
    expect(within(nav).queryByText("Video")).toBeNull();
    expect(within(nav).getByText("Reading")).toBeInTheDocument();

    rerender(<Home drive={OTHER} />);
    const navOther = await findAppsNav();
    expect(within(navOther).getByText("Library")).toBeInTheDocument();
    expect(within(navOther).queryByText("Reading")).toBeNull();
    expect(within(navOther).queryByText("Video")).toBeNull();
  });
});
