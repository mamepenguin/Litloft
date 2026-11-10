/**
 * Acceptance tests for the video library page: SPEC-CORE-054 (header),
 * SPEC-CORE-055 (target) and SPEC-CORE-057 (faces). Labels are the English
 * messages, which is what the shared next-intl mock resolves.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";

import { readAppPrefs, writeAppPrefs } from "@/lib/appPrefs";
import { ApiStatusError } from "@/lib/api";
import { VideoApp } from "../VideoApp";

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

function item(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    filename: `${title}.mp4`,
    title,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: `/api/files/${id}/thumbnail`,
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
    ...extra,
  };
}

function smartFolder(id: string, name: string, query: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    drive: DRIVE,
    name,
    query,
    file_type: null,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
    ...extra,
  };
}

type Params = Record<string, unknown>;

function defaultShelves(_drive: string, params: Params) {
  if (params.by === "watch" && params.key === "continue") {
    return {
      by: "watch",
      total_shelves: 1,
      shelves: [
        {
          key: "continue",
          label: "",
          count: 1,
          items: [item("c1", "Resume me", { watch_progress: { position: 30, duration: 120 } })],
        },
      ],
    };
  }
  if (params.by === "watch" && params.key === "unwatched") {
    return {
      by: "watch",
      total_shelves: 1,
      shelves: [{ key: "unwatched", label: "", count: 1, items: [item("r1", "Pick me")] }],
    };
  }
  if (params.by === "folder") {
    return {
      by: "folder",
      total_shelves: 2,
      shelves: [
        { key: "Movies", label: "Movies", count: 7, items: [item("m1", "Movie one")] },
        { key: "", label: "", count: 2, items: [item("m2", "Root video")] },
      ],
    };
  }
  if (params.by === "tag") {
    return {
      by: "tag",
      total_shelves: 2,
      shelves: [
        { key: "Trip", label: "Trip", count: 3, items: [item("t1", "Trip one")] },
        { key: "no_tag", label: "", count: 4, items: [item("t2", "Untagged one")] },
      ],
    };
  }
  return { by: params.by, total_shelves: 0, shelves: [] };
}

function defaultFiles(_drive: string, params: Params) {
  const title = params.sort === "random" ? "Random pick" : "Newest one";
  return {
    data: [item("n1", title)],
    meta: { total: 42, page: 1, limit: (params.limit as number) ?? 12 },
  };
}

function shelfCalls(match: Params) {
  return getShelves.mock.calls.filter(([, p]) =>
    Object.entries(match).every(([k, v]) => (p as Params)[k] === v),
  );
}

function filesCalls(match: Params) {
  return getDriveFiles.mock.calls.filter(([, p]) =>
    Object.entries(match).every(([k, v]) => (p as Params)[k] === v),
  );
}

function renderApp() {
  return render(<VideoApp drive={DRIVE} />);
}

async function openMenu(name: RegExp) {
  fireEvent.click(await screen.findByRole("button", { name }));
}

beforeEach(() => {
  nickname = "alice";
  localStorage.clear();
  getShelves.mockReset().mockImplementation(async (d, p) => defaultShelves(d, p));
  getDriveFiles.mockReset().mockImplementation(async (d, p) => defaultFiles(d, p));
  getSmartFolders.mockReset().mockResolvedValue([]);
});

describe("SPEC-CORE-054 the page header", () => {
  it("SPEC-CORE-054 shows the title, the drive and the count of videos", async () => {
    renderApp();

    expect(await screen.findByRole("heading", { name: "Video" })).toBeInTheDocument();
    expect(await screen.findByText(/main/)).toBeInTheDocument();
    expect(await screen.findByText(/42/)).toBeInTheDocument();
  });

  it("SPEC-CORE-054 has a Target button reading the default target", async () => {
    renderApp();

    const button = await screen.findByRole("button", { name: /Target/ });
    expect(button).toHaveTextContent("All videos");
  });
});

describe("SPEC-CORE-057 faces", () => {
  it("SPEC-CORE-057 opens on Discover on first use", async () => {
    renderApp();

    expect(await screen.findByRole("tab", { name: "Discover" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Library" })).toHaveAttribute("aria-selected", "false");
  });

  it("SPEC-CORE-057 opens on the face last used in this drive", async () => {
    writeAppPrefs(DRIVE, { face: "library" });
    renderApp();

    expect(await screen.findByRole("tab", { name: "Library" })).toHaveAttribute("aria-selected", "true");
    expect(shelfCalls({ by: "folder" }).length).toBeGreaterThan(0);
  });

  it("SPEC-CORE-057 I10 treats a stale stored face as Discover", async () => {
    writeAppPrefs(DRIVE, { face: "grid" } as never);
    renderApp();

    expect(await screen.findByRole("tab", { name: "Discover" })).toHaveAttribute("aria-selected", "true");
  });

  it("SPEC-CORE-057 saves the face on switching and shows only one face", async () => {
    renderApp();
    fireEvent.click(await screen.findByRole("tab", { name: "Library" }));

    await waitFor(() => expect(readAppPrefs(DRIVE).face).toBe("library"));
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Discover" })).toHaveAttribute("aria-selected", "false");
  });
});

describe("SPEC-CORE-057 I8 Discover", () => {
  it("SPEC-CORE-057 SPEC-CORE-068 requests Continue and New under the video target, and no random Recommended", async () => {
    renderApp();
    await screen.findByText("Resume me");
    await screen.findByText("Newest one");

    const continueCall = shelfCalls({ by: "watch", key: "continue" })[0][1] as Params;
    expect(continueCall).toMatchObject({ sort: "last_played", per_shelf: 12, type: ["video"] });
    expect(shelfCalls({ key: "unwatched" })).toHaveLength(0);
    expect(shelfCalls({ sort: "random" })).toHaveLength(0);
    expect(filesCalls({ sort: "random" })).toHaveLength(0);
    const fresh = filesCalls({ sort: "created_at", order: "desc" })[0][1] as Params;
    expect(fresh).toMatchObject({ limit: 12, type: ["video"] });
  });

  it("SPEC-CORE-057 SPEC-CORE-068 draws Continue and New with their videos, and no Recommended without a provider", async () => {
    renderApp();

    expect(await screen.findByText("Resume me")).toBeInTheDocument();
    expect(await screen.findByText("Newest one")).toBeInTheDocument();
    for (const heading of ["Continue", "New"]) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(screen.queryByText("Pick me")).not.toBeInTheDocument();
  });

  it("SPEC-CORE-057 does not draw a shelf with no videos", async () => {
    getShelves.mockImplementation(async (d, p: Params) =>
      p.key === "continue"
        ? { by: "watch", total_shelves: 1, shelves: [{ key: "continue", label: "", count: 0, items: [] }] }
        : defaultShelves(d, p),
    );
    renderApp();

    await screen.findByText("Newest one");
    expect(screen.queryByText("Continue")).not.toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("SPEC-CORE-057 keeps Discover's shelves across a face switch and back", async () => {
    renderApp();
    await screen.findByText("Resume me");
    await screen.findByText("Newest one");
    const before = shelfCalls({ by: "watch", key: "continue" }).length;
    const newBefore = filesCalls({ sort: "created_at" }).length;

    fireEvent.click(screen.getByRole("tab", { name: "Library" }));
    await screen.findByText("Movies");
    fireEvent.click(screen.getByRole("tab", { name: "Discover" }));

    expect(await screen.findByText("Resume me")).toBeInTheDocument();
    expect(shelfCalls({ by: "watch", key: "continue" }).length).toBe(before);
    expect(filesCalls({ sort: "created_at" }).length).toBe(newBefore);
  });

  it("SPEC-CORE-057 retries only the shelf that failed", async () => {
    let fail = true;
    getShelves.mockImplementation(async (d, p: Params) => {
      if (p.key === "continue" && fail) throw new Error("boom");
      return defaultShelves(d, p);
    });
    renderApp();

    expect(await screen.findByText("Newest one")).toBeInTheDocument();
    const retry = await screen.findByRole("button", { name: /retry/i });
    expect(screen.queryByText("Resume me")).not.toBeInTheDocument();

    fail = false;
    fireEvent.click(retry);

    expect(await screen.findByText("Resume me")).toBeInTheDocument();
    expect(screen.getByText("Newest one")).toBeInTheDocument();
  });
});

describe("SPEC-CORE-057 no profile", () => {
  beforeEach(() => {
    nickname = null;
  });

  it("SPEC-CORE-057 SPEC-CORE-068 never asks for watch data and omits Continue and Recommended", async () => {
    renderApp();

    expect(await screen.findByText("Newest one")).toBeInTheDocument();
    expect(getShelves.mock.calls.filter(([, p]) => (p as Params).by === "watch")).toHaveLength(0);
    expect(screen.queryByText("Continue")).not.toBeInTheDocument();
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(filesCalls({ sort: "random" })).toHaveLength(0);
  });

  it("SPEC-CORE-057 does not offer Watch state in the Classification menu", async () => {
    writeAppPrefs(DRIVE, { face: "library" });
    renderApp();

    await openMenu(/Classification/);

    expect(screen.getByText("Tag")).toBeInTheDocument();
    expect(screen.queryByText("Watch state")).not.toBeInTheDocument();
  });

  it("SPEC-CORE-057 I10 shows Folder for a saved Watch state and keeps the saved value", async () => {
    writeAppPrefs(DRIVE, { face: "library", classification: "watch" });
    renderApp();

    await screen.findByText("Movies");
    expect(shelfCalls({ by: "watch" })).toHaveLength(0);
    expect(shelfCalls({ by: "folder" }).length).toBeGreaterThan(0);
    expect(readAppPrefs(DRIVE).classification).toBe("watch");
  });
});

describe("SPEC-CORE-057 a rejected viewer", () => {
  it("SPEC-CORE-057 treats viewer_required as no profile and shows no retry", async () => {
    getShelves.mockImplementation(async (d, p: Params) => {
      if (p.by === "watch") {
        throw Object.assign(new ApiStatusError(400, "API error: 400"), { detail: "viewer_required" });
      }
      return defaultShelves(d, p);
    });
    renderApp();

    expect(await screen.findByText("Newest one")).toBeInTheDocument();
    await waitFor(() => expect(shelfCalls({ by: "watch" }).length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByText("Continue")).not.toBeInTheDocument());
    await act(async () => {
      await Promise.all(getShelves.mock.results.map((r) => Promise.resolve(r.value).catch(() => undefined)));
    });
    expect(screen.queryByText("Continue")).not.toBeInTheDocument();
    expect(screen.queryByText("Resume me")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });
});

describe("SPEC-CORE-057 I9 Library", () => {
  beforeEach(() => {
    writeAppPrefs(DRIVE, { face: "library" });
  });

  it("SPEC-CORE-057 asks for folder shelves 12 at a time with 5 videos each, newest first", async () => {
    renderApp();
    await screen.findByText("Movies");

    const call = shelfCalls({ by: "folder" })[0][1] as Params;
    expect(call).toMatchObject({
      per_shelf: 5,
      shelf_limit: 12,
      sort: "created_at",
      order: "desc",
      type: ["video"],
    });
    expect(call.key).toBeUndefined();
  });

  it("SPEC-CORE-057 draws each shelf with its count, videos and a See all link", async () => {
    renderApp();

    expect(await screen.findByText("Movies")).toBeInTheDocument();
    expect(screen.getByText("Movie one")).toBeInTheDocument();
    expect(screen.getByText(/7/)).toBeInTheDocument();
    const hrefs = screen
      .getAllByRole("link", { name: /See all/ })
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(`/drive/${DRIVE}/apps/video/shelf?by=folder&key=Movies&from=library`);
  });

  it("SPEC-CORE-057 labels the root folder shelf with the drive name and keeps its key empty", async () => {
    renderApp();
    await screen.findByText("Movies");

    expect(screen.getAllByText(DRIVE).length).toBeGreaterThan(0);
    const hrefs = screen
      .getAllByRole("link", { name: /See all/ })
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(`/drive/${DRIVE}/apps/video/shelf?by=folder&key=&from=library`);
  });

  it("SPEC-CORE-057 labels the untagged shelf No tag", async () => {
    writeAppPrefs(DRIVE, { classification: "tag" });
    renderApp();

    expect(await screen.findByText("No tag")).toBeInTheDocument();
    expect(screen.getByText("Trip")).toBeInTheDocument();
  });

  it("SPEC-CORE-057 offers the five classifications with a profile and saves the choice", async () => {
    renderApp();
    await openMenu(/Classification/);

    for (const label of ["Folder", "Tag", "Month added", "Length", "Watch state"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    fireEvent.click(screen.getByText("Tag"));

    await waitFor(() => expect(shelfCalls({ by: "tag" }).length).toBeGreaterThan(0));
    expect(readAppPrefs(DRIVE).classification).toBe("tag");
  });

  it("SPEC-CORE-057 reads shelves by watch state for a profile", async () => {
    writeAppPrefs(DRIVE, { classification: "watch" });
    renderApp();

    await waitFor(() => expect(shelfCalls({ by: "watch" }).length).toBeGreaterThan(0));
  });
});

describe("SPEC-CORE-055 the target menu", () => {
  const trips = smartFolder("sf-trips", "Trips", "tag:Trip");

  it("SPEC-CORE-055 lists All videos first, then the smart folders", async () => {
    getSmartFolders.mockResolvedValue([trips]);
    renderApp();
    await openMenu(/Target/);

    const all = await screen.findAllByText(/All videos/);
    const trip = await screen.findByText("Trips");
    expect(
      all[0].compareDocumentPosition(trip) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("SPEC-CORE-055 re-fetches under the smart folder's conditions and saves the choice", async () => {
    getSmartFolders.mockResolvedValue([trips]);
    renderApp();
    await screen.findByText("Resume me");
    await openMenu(/Target/);
    fireEvent.click(await screen.findByText("Trips"));

    await waitFor(() => {
      const withTag = getShelves.mock.calls.filter(([, p]) =>
        [(p as Params).tag].flat().includes("Trip"),
      );
      expect(withTag.length).toBeGreaterThan(0);
      expect((withTag[0][1] as Params).type).toEqual(["video"]);
    });
    expect(readAppPrefs(DRIVE).target).toBe("sf-trips");
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Trips");
  });

  it("SPEC-CORE-055 ignores the smart folder's own saved sort", async () => {
    getSmartFolders.mockResolvedValue([
      smartFolder("sf-t", "Titled", "tag:Trip", { sort_by: "title", sort_order: "asc" }),
    ]);
    writeAppPrefs(DRIVE, { target: "sf-t", face: "library" });
    renderApp();

    await waitFor(() =>
      expect(
        getShelves.mock.calls.some(([, p]) => [(p as Params).tag].flat().includes("Trip")),
      ).toBe(true),
    );
    const call = getShelves.mock.calls.find(([, p]) =>
      [(p as Params).tag].flat().includes("Trip"),
    )![1] as Params;
    expect(call).toMatchObject({ sort: "created_at", order: "desc" });
  });

  it("SPEC-CORE-055 uses the default target and keeps the saved value when the folder is gone", async () => {
    getSmartFolders.mockResolvedValue([trips]);
    writeAppPrefs(DRIVE, { target: "deleted-id" });
    renderApp();

    expect(await screen.findByText("Resume me")).toBeInTheDocument();
    await waitFor(() => expect(readAppPrefs(DRIVE).target).toBe("deleted-id"));
    const sent = getShelves.mock.calls.map(([, p]) => p as Params);
    expect(sent.every((p) => p.tag === undefined && p.folder === undefined)).toBe(true);
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("All videos");
  });

  it("SPEC-CORE-055 falls back to the default target when the smart folder list fails", async () => {
    getSmartFolders.mockRejectedValue(new Error("boom"));
    renderApp();

    expect(await screen.findByText("Resume me")).toBeInTheDocument();
    await openMenu(/Target/);
    expect(screen.getAllByText(/All videos/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Trips")).not.toBeInTheDocument();
  });

  it("SPEC-CORE-055 I6 sends no request for a target whose kinds exclude video, and keeps its name", async () => {
    getSmartFolders.mockResolvedValue([smartFolder("sf-pics", "Pictures", "", { file_type: "image" })]);
    renderApp();
    await screen.findByText("Resume me");
    await openMenu(/Target/);
    const before = getShelves.mock.calls.length + getDriveFiles.mock.calls.length;
    fireEvent.click(await screen.findByText("Pictures"));

    await waitFor(() => expect(screen.queryByText("Resume me")).not.toBeInTheDocument());
    expect(getShelves.mock.calls.length + getDriveFiles.mock.calls.length).toBe(before);
    expect(screen.getByRole("button", { name: /Target/ })).toHaveTextContent("Pictures");
    expect(readAppPrefs(DRIVE).target).toBe("sf-pics");
  });

  it("SPEC-CORE-055 I6 never sends a kind other than video", async () => {
    getSmartFolders.mockResolvedValue([smartFolder("sf-mix", "Mixed", "type:video type:image")]);
    writeAppPrefs(DRIVE, { target: "sf-mix" });
    renderApp();

    await screen.findByText("Resume me");
    const kinds = [...getShelves.mock.calls, ...getDriveFiles.mock.calls].map(
      ([, p]) => (p as Params).type,
    );
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds.every((t) => JSON.stringify(t) === JSON.stringify(["video"]))).toBe(true);
  });
});
