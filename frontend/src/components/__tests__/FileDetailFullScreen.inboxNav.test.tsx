/**
 * SPEC-CORE-032 I15 — a file opened from the inbox is triaged where it is
 * read: its Done button closes the arrival and moves on, and every URL the
 * detail builds keeps saying the walk came from the inbox.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    back: mockBack,
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/files/abc",
  useParams: () => ({ id: "abc" }),
}));

vi.mock("@/components/SidebarProvider", () => ({
  useOverlaySidebar: vi.fn(),
  useSidebar: () => ({ requestRefresh: vi.fn() }),
}));

vi.mock("@/components/CurrentDriveProvider", () => ({
  useSetOverrideDrive: () => vi.fn(),
}));

vi.mock("@/components/FileDetailContent", () => ({
  FileDetailContent: ({ fileId }: { fileId: string }) => (
    <div data-testid="file-detail-content">detail:{fileId}</div>
  ),
}));

vi.mock("@/components/ImageGallery", () => ({
  ImageGallery: () => <div data-testid="image-gallery" />,
}));

vi.mock("@/components/CollectionPanel", () => ({
  CollectionPanel: () => <div data-testid="collection-panel" />,
  getCollectionOnEnded: () => null,
}));

vi.mock("@/hooks/usePolicy", () => ({
  usePolicy: () => ({ enabled: false, isLoading: false }),
}));

const navResult = {
  prevId: "aaa" as string | null,
  nextId: "def" as string | null,
  position: 2 as number | null,
  total: 4 as number | null,
  navigatePrev: vi.fn(),
  navigateNext: vi.fn(),
};
const useFileNavMock = vi.fn((_opts: Record<string, unknown>) => navResult);
vi.mock("@/hooks/useFileNav", () => ({
  useFileNav: (opts: Record<string, unknown>) => useFileNavMock(opts),
}));

import { _resetFileSeedForTests } from "@/lib/fileSeed";
import { FileDetailFullScreen } from "../FileDetailFullScreen";

const mockReplace = vi.fn();
const mockPush = vi.fn();
const mockBack = vi.fn();
let mockSearchParams = new URLSearchParams();
const fetchSpy = vi.fn();
const navigations: string[] = [];

const baseFile = {
  id: "abc",
  filename: "video.mp4",
  title: "Arrived video",
  description: "",
  drive: "main",
  folder_path: "movies",
  file_type: "video" as const,
  mime_type: "video/mp4",
  thumbnail_url: "",
  has_thumbnail: true,
  file_size: 1024,
  duration: 60,
  liked_at: null,
  is_favorite: false,
  tags: [],
  subtitles: [],
  deleted_at: null,
  missing_since: null,
  trust_tier: "verified" as const,
  trust_reviewed_at: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
  image_width: null,
  image_height: null,
};

function answer(url: string): unknown {
  if (url.includes("/inbox/done")) return { done: 1, done_at: "2026-11-04T10:00:00.000000Z" };
  if (url.includes("/inbox/undo")) return { reopened: 1 };
  if (url.includes("/inbox/")) return { prev_id: "aaa", next_id: "def", position: 2, total: 4 };
  if (url.includes("/addon-policies")) return { addons: {} };
  if (url.includes("/api/files/abc")) return baseFile;
  return {};
}

function installFetch() {
  fetchSpy.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    return Promise.resolve({
      ok: true,
      json: async () => answer(url),
    } as Response);
  });
  vi.stubGlobal("fetch", fetchSpy);
}

function postsTo(fragment: string) {
  return fetchSpy.mock.calls.filter(
    ([url, init]) =>
      String(url).includes(fragment) &&
      (init as RequestInit | undefined)?.method === "POST",
  );
}

beforeEach(() => {
  mockReplace.mockReset();
  mockPush.mockReset();
  mockBack.mockReset();
  navigations.length = 0;
  mockReplace.mockImplementation((url: string) => {
    navigations.push(url);
  });
  mockPush.mockImplementation((url: string) => {
    navigations.push(url);
  });
  useFileNavMock.mockClear();
  fetchSpy.mockReset();
  installFetch();
  _resetFileSeedForTests();
  for (const key of Array.from(mockSearchParams.keys())) {
    mockSearchParams.delete(key);
  }
  navResult.prevId = "aaa";
  navResult.nextId = "def";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderAt(search: string) {
  mockSearchParams = new URLSearchParams(search);
  render(<FileDetailFullScreen fileId="abc" />);
  await waitFor(() =>
    expect(screen.getByTestId("file-detail-content")).toBeInTheDocument(),
  );
}

describe("SPEC-CORE-032 I15 the detail's Done button", () => {
  it("SPEC-CORE-032 I15 appears only for a file opened from the inbox", async () => {
    await renderAt("nav=inbox");
    expect(await screen.findByText("Done")).toBeInTheDocument();
  });

  it("SPEC-CORE-032 I15 is not drawn for a folder walk", async () => {
    await renderAt("nav=folder&sort=title");
    expect(screen.queryByText("Done")).toBeNull();
  });

  it("SPEC-CORE-032 I15 shows the inbox arrows beside it", async () => {
    await renderAt("nav=inbox");
    expect(await screen.findByTestId("file-nav-controls")).toBeInTheDocument();
  });

  it("SPEC-CORE-032 I15 marks this arrival done", async () => {
    await renderAt("nav=inbox");
    (await screen.findByText("Done")).click();

    await waitFor(() => expect(postsTo("/inbox/done")).toHaveLength(1));
    const [, init] = postsTo("/inbox/done")[0];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      file_ids: ["abc"],
    });
  });

  it("SPEC-CORE-032 I15 moves to the next arrival and keeps nav=inbox", async () => {
    await renderAt("nav=inbox");
    (await screen.findByText("Done")).click();

    await waitFor(() => expect(navigations.length).toBeGreaterThan(0));
    expect(navigations.at(-1)).toBe("/files/def?nav=inbox");
  });

  it("SPEC-CORE-032 I15 returns to the inbox when nothing follows", async () => {
    navResult.nextId = null;
    await renderAt("nav=inbox");
    (await screen.findByText("Done")).click();

    await waitFor(() => expect(navigations.length).toBeGreaterThan(0));
    expect(navigations.at(-1)).toBe("/drive/main?view=inbox");
  });
});

describe("SPEC-CORE-032 I15 every URL the detail builds", () => {
  it("SPEC-CORE-032 I15 keeps nav=inbox when the arrows move", async () => {
    await renderAt("nav=inbox");
    const opts = useFileNavMock.mock.calls.at(-1)?.[0] as {
      nav?: string;
      drive?: string;
      onNavigate: (id: string) => void;
    };
    expect(opts.nav).toBe("inbox");
    expect(opts.drive).toBe("main");

    opts.onNavigate("ghi");
    expect(navigations.at(-1)).toBe("/files/ghi?nav=inbox");
  });

  it("SPEC-CORE-032 I15 keeps a folder walk's URL as it was", async () => {
    await renderAt("nav=folder&sort=title&order=asc");
    const opts = useFileNavMock.mock.calls.at(-1)?.[0] as {
      onNavigate: (id: string) => void;
    };

    opts.onNavigate("ghi");
    expect(navigations.at(-1)).toBe("/files/ghi?sort=title&order=asc");
  });
});
