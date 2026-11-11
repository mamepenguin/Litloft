/**
 * SPEC-CORE-071: the Video app's Continue shelf and its See all are the desk
 * (`by=watch&key=continue`), as revised SPEC-CORE-057 I8 states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { VideoApp } from "../VideoApp";
import { VideoShelfPage } from "../VideoShelfPage";

const { DRIVE } = vi.hoisted(() => ({ DRIVE: "main" }));

let nickname: string | null = "alice";

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/video",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname, setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    catalogueDrive: DRIVE,
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
  }),
  useAddonStatus: () => ({ features: {} }),
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

function item(id: string, title: string) {
  return {
    id,
    filename: `${title}.mp4`,
    title,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1,
    duration: 120,
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
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function shelves(_drive: string, params: Params) {
  if (params.by === "watch" && (params.key === "continue" || params.key === "in_progress")) {
    return {
      by: "watch",
      total_shelves: 1,
      shelves: [{ key: params.key, label: "", count: 1, items: [item("c1", `Shelf ${params.key}`)] }],
    };
  }
  if (params.by === "watch" && params.key === "unwatched") {
    return {
      by: "watch",
      total_shelves: 1,
      shelves: [{ key: "unwatched", label: "", count: 1, items: [item("r1", "Pick me")] }],
    };
  }
  return { by: params.by, total_shelves: 0, shelves: [] };
}

function files() {
  return { data: [item("n1", "Newest one")], meta: { total: 42, page: 1, limit: 12 } };
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
  getDriveFiles.mockReset().mockImplementation(async () => files());
  getSmartFolders.mockReset().mockResolvedValue([]);
});

describe("SPEC-CORE-071 Video Discover's Continue shelf", () => {
  it("SPEC-CORE-071 asks for key=continue, last played first, under the video target", async () => {
    render(<VideoApp drive={DRIVE} />);

    expect(await screen.findByText("Shelf continue")).toBeInTheDocument();
    const [call] = shelfCalls({ by: "watch", key: "continue" });
    expect(call).toMatchObject({ sort: "last_played", per_shelf: 12, type: ["video"] });
    expect(call.order ?? "desc").toBe("desc");
    expect(shelfCalls({ by: "watch", key: "in_progress" })).toHaveLength(0);
    expect(screen.queryByText("Shelf in_progress")).toBeNull();
    expect(screen.getByText("Continue")).toBeInTheDocument();
  });

  it("SPEC-CORE-071 links See all to the continue shelf", async () => {
    render(<VideoApp drive={DRIVE} />);
    await screen.findByText("Shelf continue");

    expect(screen.getByRole("link", { name: "See all: Continue" })).toHaveAttribute(
      "href",
      `/drive/${DRIVE}/apps/video/shelf?by=watch&key=continue&from=discover`,
    );
  });
});

describe("SPEC-CORE-071 Video's continue shelf page", () => {
  it("SPEC-CORE-071 asks for key=continue and is headed Continue", async () => {
    render(<VideoShelfPage drive={DRIVE} by="watch" shelfKey="continue" from="discover" />);

    expect(await screen.findByText("Shelf continue")).toBeInTheDocument();
    expect(shelfCalls({ by: "watch", key: "continue" })[0]).toMatchObject({ type: ["video"] });
    expect(screen.getByRole("heading", { name: "Continue" })).toBeInTheDocument();
  });
});
