/**
 * SPEC-CORE-071: the Reading app's Continue reading shelf and its See all are
 * the desk (`by=watch&key=continue`), as revised SPEC-CORE-061 I17 states.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ReadingApp } from "../ReadingApp";
import { ReadingShelfPage } from "../ReadingShelfPage";

const DRIVE = "main";
let nickname: string | null = "alice";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/reading",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

const getShelves = vi.fn();
const getDriveFiles = vi.fn();
const getSmartFolders = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getDriveFiles: (...args: unknown[]) => getDriveFiles(...args),
  getSmartFolders: (...args: unknown[]) => getSmartFolders(...args),
}));

type Params = Record<string, unknown>;

function book(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    filename: `${title}.pdf`,
    title,
    description: "",
    drive: DRIVE,
    folder_path: "Books",
    file_type: "document",
    mime_type: "application/pdf",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1,
    duration: null,
    image_width: null,
    image_height: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...extra,
  };
}

function oneShelf(key: string, items: unknown[]) {
  return { by: "watch", total_shelves: 1, shelves: [{ key, label: "", count: items.length, items }] };
}

function shelves(_drive: string, params: Params) {
  if (params.by === "watch" && (params.key === "continue" || params.key === "in_progress")) {
    return oneShelf(String(params.key), [
      book("c1", `Shelf ${params.key}`, { watch_progress: { position: 30, duration: 120 } }),
    ]);
  }
  if (params.by === "watch" && params.key === "unwatched") {
    return oneShelf("unwatched", [book("r1", "Pick me")]);
  }
  return { by: params.by, total_shelves: 0, shelves: [] };
}

function shelfCalls(match: Params) {
  return getShelves.mock.calls
    .map(([, p]) => p as Params)
    .filter((p) => Object.entries(match).every(([k, v]) => p[k] === v));
}

beforeEach(() => {
  nickname = "alice";
  localStorage.clear();
  getShelves.mockReset().mockImplementation(async (d, p) => shelves(d, p));
  getDriveFiles.mockReset().mockResolvedValue({
    data: [book("n1", "Newest one")],
    meta: { total: 1, page: 1, limit: 12 },
  });
  getSmartFolders.mockReset().mockResolvedValue([]);
});

describe("SPEC-CORE-071 Reading Discover's Continue reading shelf", () => {
  it("SPEC-CORE-071 asks for key=continue, last played first, under the book target", async () => {
    render(<ReadingApp drive={DRIVE} />);

    expect(await screen.findByText("Shelf continue")).toBeInTheDocument();
    const [call] = shelfCalls({ by: "watch", key: "continue" });
    expect(call).toMatchObject({
      sort: "last_played",
      per_shelf: 12,
      type: ["pdf", "epub", "archive"],
    });
    expect(call.order ?? "desc").toBe("desc");
    expect(shelfCalls({ by: "watch", key: "in_progress" })).toHaveLength(0);
    expect(screen.getByText("Continue reading")).toBeInTheDocument();
  });

  it("SPEC-CORE-071 links See all to the continue shelf", async () => {
    render(<ReadingApp drive={DRIVE} />);
    await screen.findByText("Pick me");

    expect(screen.getByRole("link", { name: "See all: Continue reading" })).toHaveAttribute(
      "href",
      `/drive/${DRIVE}/apps/reading/shelf?by=watch&key=continue&from=discover`,
    );
  });
});

describe("SPEC-CORE-071 Reading's continue shelf page", () => {
  it("SPEC-CORE-071 asks for key=continue and is headed Continue reading", async () => {
    render(<ReadingShelfPage drive={DRIVE} by="watch" shelfKey="continue" from="discover" />);

    expect(await screen.findByText("Shelf continue")).toBeInTheDocument();
    expect(shelfCalls({ by: "watch", key: "continue" })[0]).toMatchObject({
      type: ["pdf", "epub", "archive"],
    });
    expect(screen.getByRole("heading", { name: "Continue reading" })).toBeInTheDocument();
  });

  it("SPEC-CORE-071 takes continue as a key but never as a watch condition", async () => {
    const first = render(
      <ReadingShelfPage drive={DRIVE} by="watch" shelfKey="continue" watch="continue" />,
    );
    expect(await screen.findByText("Shelf continue")).toBeInTheDocument();
    first.unmount();
    getShelves.mockClear();

    render(<ReadingShelfPage drive={DRIVE} by="watch" shelfKey="unwatched" watch="continue" />);
    expect(await screen.findByText("Pick me")).toBeInTheDocument();

    for (const call of shelfCalls({ by: "watch" })) {
      expect(call.watch).toBeUndefined();
    }
  });
});
