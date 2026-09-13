import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

import { WebSocketContext } from "@/components/WebSocketProvider";
import type { WebSocketEvent } from "@/types";

// Mock profile
const mockProfile = { nickname: null as string | null, setNickname: vi.fn(), clearNickname: vi.fn() };
vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => mockProfile,
  ProfileProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Not the page's own. Each content row renders one `FileContextMenu`
// beside its cards — not per card — and `useFileMenuItems` reaches for
// the clipboard from there. A row renders while it is still loading, so
// drawing no cards is not enough to stay off that path: anything that
// renders `DriveHome` is on it.
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

// Whether an addon has registered the Add menu's slot. `AddButton` gates
// its addon rows on this *as well as* on the caller passing `addonProps`,
// so a fixture that leaves it false cannot see the second gate at all.
//
// It answers for that one slot by id and denies every other. An
// argument-blind `hasSlot` says yes to whatever id the gate asks about,
// so aiming the gate at a slot nobody declares would go unnoticed — and
// the menu would grow addon rows because some unrelated surface was
// occupied.
const ADD_MENU_SLOT_ID = "folder-actions-menu";
const slotIsRegistered = { current: false };
vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: (id: string) => id === ADD_MENU_SLOT_ID && slotIsRegistered.current,
  }),
}));
vi.mock("@/components/AddonSlot", () => ({
  AddonSlot: ({ id }: { id: string }) =>
    id === ADD_MENU_SLOT_ID ? (
      <button type="button" role="menuitem">
        Addon row
      </button>
    ) : null,
}));

const mockRefreshTree = vi.fn();
vi.mock("@/components/TreeRefreshContext", () => ({
  useTreeRefresh: () => mockRefreshTree,
}));

// Mock next/link
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));


// What this page and the real components under it reach for. A binding
// here that the tree never calls reads as "the page does this and we are
// suppressing it", which is how a folder grid stayed in this file's
// fixture after the page stopped drawing one — so each of these is one
// the tree is observed to call, counted rather than assumed.
const mockGetDriveFiles = vi.fn();
const mockGetWatchHistory = vi.fn();
const mockInitUpload = vi.fn();
vi.mock("@/lib/api", () => ({
  getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
  getWatchHistory: (...args: unknown[]) => mockGetWatchHistory(...args),
  // The real `UploadZone` runs here, so an upload started on this page
  // goes all the way through `useUpload` and out the far side as
  // `onUploadComplete`.
  initUpload: (...args: unknown[]) => mockInitUpload(...args),
  completeUpload: vi.fn().mockResolvedValue(undefined),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

import { DriveHome } from "../components/DriveHome";
// The catalogue itself, so a prompt's words are read from where a real
// one would take them rather than guessed at here.
import messages from "@/messages-core/en.json";
import { AddButton } from "@/components/AddButton";
import type { WatchHistoryItem } from "@/types";

const makeWatchHistoryItem = (id: string): WatchHistoryItem => ({
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
  file_size: 1024000,
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

describe("DriveHome", () => {
  beforeEach(() => {
    mockRefreshTree.mockClear();
    vi.clearAllMocks();
    slotIsRegistered.current = false;
    mockProfile.nickname = null;
    mockGetDriveFiles.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 12 } });
    mockGetWatchHistory.mockResolvedValue([]);
  });

  it("asks the backend for liked files, ordered by when they were liked", async () => {
    // The counter this replaces was fetched with sort=likes and then
    // filtered client-side on `likes > 0`; the server filter replaces
    // both (spec 2026-09-01-favorite-like-separation).
    render(<DriveHome driveName="media" />);

    await waitFor(() => {
      expect(mockGetDriveFiles).toHaveBeenCalledWith(
        "media",
        expect.objectContaining({
          liked: true,
          sort: "liked_at",
          order: "desc",
        }),
      );
    });
  });

  it("does not show Continue Watching when no profile", async () => {
    mockProfile.nickname = null;
    render(<DriveHome driveName="media" />);

    await waitFor(() => {
      expect(screen.queryByText("Continue Watching")).toBeNull();
    });
    expect(mockGetWatchHistory).not.toHaveBeenCalled();
  });

  it("shows Continue Watching when profile is set and items exist", async () => {
    mockProfile.nickname = "Alice";
    mockGetWatchHistory.mockResolvedValue([
      makeWatchHistoryItem("v1"),
      makeWatchHistoryItem("v2"),
    ]);

    render(<DriveHome driveName="media" />);

    await waitFor(() => {
      expect(screen.getByText("Continue Watching")).toBeInTheDocument();
    });
    expect(mockGetWatchHistory).toHaveBeenCalledWith("media", 12);
    expect(mockGetWatchHistory).toHaveBeenCalledWith("media", 12, "all");
  });

  it("does not show Continue Watching when profile is set but no items", async () => {
    mockProfile.nickname = "Alice";
    mockGetWatchHistory.mockResolvedValue([]);

    render(<DriveHome driveName="media" />);

    // `ContinueWatchingSection` returns null only when it is *done*
    // loading with nothing — while the history request is in flight it
    // draws its heading. So waiting for the heading to go is waiting for
    // the fetch to settle. Asserted only after it has been seen once:
    // without that, a section that never mounted at all would satisfy
    // the wait on its first tick.
    expect(screen.getByText("Continue Watching")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Continue Watching")).toBeNull();
    });
  });

  it("renders file titles from watch history", async () => {
    mockProfile.nickname = "Alice";
    mockGetWatchHistory.mockResolvedValue([makeWatchHistoryItem("v1")]);

    render(<DriveHome driveName="media" />);

    await waitFor(() => {
      const items = screen.getAllByText("Video v1");
      expect(items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("live updates", () => {
    // A structural change refreshes the whole page, not just the folder
    // grid: the Recently added / Favourites / Popular rows are file
    // listings too, and were left showing files deleted elsewhere.
    function Live({ initial }: { initial: WebSocketEvent | null }) {
      const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(initial);
      (globalThis as Record<string, unknown>).__emit = setLastEvent;
      return (
        <WebSocketContext.Provider value={{ lastEvent, connected: true }}>
          <DriveHome driveName="media" />
        </WebSocketContext.Provider>
      );
    }

    function emit(event: string, drive: string) {
      act(() => {
        (
          globalThis as unknown as {
            __emit: (e: WebSocketEvent) => void;
          }
        ).__emit({ event, data: { drive } });
      });
    }

    it("refetches the file sections on a structural change", async () => {
      render(<Live initial={null} />);
      await waitFor(() => expect(mockGetDriveFiles).toHaveBeenCalled());
      const before = mockGetDriveFiles.mock.calls.length;

      emit("drive.structure_changed", "media");

      await waitFor(() =>
        expect(mockGetDriveFiles.mock.calls.length).toBeGreaterThan(before),
      );
    });

    it("tells the folder tree the drive changed shape", async () => {
      // The tree pane is on this page — the header draws its toggle — and
      // nothing else here tells it. The signal used to reach the tree
      // through the folder grid's own refresh, which is gone; both of
      // `refreshPage`'s entrances need it, and this is the one with an
      // emitter to press.
      render(<Live initial={null} />);
      await waitFor(() => expect(mockGetDriveFiles).toHaveBeenCalled());
      mockRefreshTree.mockClear();

      emit("drive.structure_changed", "media");

      await waitFor(() => expect(mockRefreshTree).toHaveBeenCalled());
    });

    it("refetches on a content update, so favourites stay current", async () => {
      render(<Live initial={null} />);
      await waitFor(() => expect(mockGetDriveFiles).toHaveBeenCalled());
      const before = mockGetDriveFiles.mock.calls.length;

      // Favouriting is a content update, not a structural one.
      emit("drive.file_updated", "media");

      await waitFor(() =>
        expect(mockGetDriveFiles.mock.calls.length).toBeGreaterThan(before),
      );
    });

    it("ignores a change in another drive", async () => {
      render(<Live initial={null} />);
      await waitFor(() => expect(mockGetDriveFiles).toHaveBeenCalled());
      const before = mockGetDriveFiles.mock.calls.length;

      emit("drive.structure_changed", "other-drive");

      await new Promise((r) => setTimeout(r, 20));
      expect(mockGetDriveFiles.mock.calls.length).toBe(before);
    });
  });
});

describe("the drive home's content rows", () => {
  const oneFile = () => ({
    id: "f1",
    filename: "clip.mp4",
    title: "Clip",
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
  });

  beforeEach(() => {
    vi.clearAllMocks();
    slotIsRegistered.current = false;
    mockProfile.nickname = null;
    mockGetWatchHistory.mockResolvedValue([]);
  });

  it("carries the server's total through to the See all link", async () => {
    // The whole point of the change, and the half of it that no
    // component test can see: `applyFileSections` reads `meta.total` off
    // a response the row never fetches itself. Delete that one line and
    // `CarouselSection`'s own tests stay green while the count silently
    // stops appearing.
    mockGetDriveFiles.mockResolvedValue({
      data: [oneFile()],
      meta: { total: 619, page: 1, limit: 12 },
    });
    render(<DriveHome driveName="media" />);
    // All three file rows read from the same mock, so all three carry it.
    const links = await screen.findAllByRole("link", { name: "See all (619)" });
    expect(links).toHaveLength(3);
  });

  it("gives each row its own total, and drops a row whose fetch failed", async () => {
    // The three rows are one `allSettled`, so a single shared total would
    // pass a test that resolves all three the same way. Recently added
    // resolves with 619; Favourites and Liked reject, and a row with
    // nothing in it does not render at all — which is also why "a failed
    // section shows no count" is not assertable here and is asserted
    // against `CarouselSection` directly in `section-rows.test.tsx`.
    mockGetDriveFiles
      .mockResolvedValueOnce({ data: [oneFile()], meta: { total: 619, page: 1, limit: 12 } })
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new Error("network"));

    render(<DriveHome driveName="media" />);

    const links = await screen.findAllByRole("link", { name: "See all (619)" });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toContain("view=recent-added");
    expect(screen.queryByText("Favorites")).toBeNull();
  });

  it("gives both watch-history rows somewhere to send the reader", async () => {
    // The rows draw only what fits, so a row without a destination
    // discards the rest of the history with nothing saying so. Continue
    // watching has no view of its own; Recently played is the same
    // history without the 90% gate, so it is a superset and an honest
    // target for both.
    mockProfile.nickname = "Alice";
    mockGetDriveFiles.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 12 } });
    mockGetWatchHistory.mockResolvedValue([
      makeWatchHistoryItem("v1"),
      makeWatchHistoryItem("v2"),
    ]);
    render(<DriveHome driveName="media" />);

    await screen.findByText("Continue Watching");
    const rows = ["Continue Watching", "Recently Viewed"];
    for (const heading of rows) {
      const section = screen.getByText(heading).closest("section")!;
      const seeAll = section.querySelector("a[href*='view=recent']");
      expect(seeAll, `${heading} has no See all`).not.toBeNull();
    }
  });
});

/**
 * The stage-1 acceptance criteria this screen owns.
 *
 * Spec 2026-09-12-purpose-oriented-navigation §16. AC 2's accent half is
 * held in `accent-budget.test.tsx`, which reaches this screen; the rest
 * is here.
 */
/**
 * Every way this app words an invitation to set up a profile.
 *
 * Read out of the catalogue rather than invented, because that is where
 * a real prompt's words would come from — and because the shapes a test
 * author imagines are not the shapes that ship. Measured: a `<p>` using
 * `empty.noRecentNoProfileDescription` passes both a `/nickname/i` match
 * and a sweep of the page's controls, which is what the two assertions
 * this replaced were between them supposed to cover.
 */
const PROFILE_PROMPT_WORDS = [
  messages.empty.noRecentNoProfileTitle,
  messages.empty.noRecentNoProfileDescription,
  messages.profile.setup,
  messages.profile.nickname,
  messages.profile.change,
];

/** Every section name on screen, read off the headings the rows draw. */
function sectionNames(): string[] {
  return screen.queryAllByRole("heading", { level: 2 }).map((h) => h.textContent ?? "");
}

describe("the drive home's acceptance criteria", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    slotIsRegistered.current = false;
    mockProfile.nickname = null;
    mockGetDriveFiles.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 12 } });
    mockGetWatchHistory.mockResolvedValue([]);
  });

  /**
   * AC 3 — Recently Added includes every file type and every way a file
   * arrived.
   *
   * The whole query is declared, not just the parts that should be
   * there. `objectContaining` cannot see a narrowing: a `type: "video"`
   * added later satisfies it, and so does `type: undefined`, which is
   * why "the arguments do not contain `type`" is not the assertion
   * either. A key appearing moves this side of the equality by itself.
   */
  it("asks for Recently Added without narrowing it to a type or a source", async () => {
    render(<DriveHome driveName="media" />);
    await waitFor(() => expect(mockGetDriveFiles).toHaveBeenCalled());

    const recentAdded = mockGetDriveFiles.mock.calls.find(
      ([, params]) => !(params as Record<string, unknown>).favorite && !(params as Record<string, unknown>).liked,
    );
    expect(recentAdded).not.toBeUndefined();
    const [drive, params] = recentAdded as [string, Record<string, unknown>];
    expect(drive).toBe("media");
    // The key set first, then the values. `toEqual` on the object alone
    // would let `type: undefined` through — it ignores keys whose value
    // is undefined — and `type: undefined` is exactly how a narrowing
    // gets written by accident.
    expect(Object.keys(params).sort()).toEqual(["limit", "order", "sort"]);
    expect(params).toEqual({ sort: "created_at", order: "desc", limit: 12 });
  });

  /**
   * AC 6 — a reader with no profile gets neither watch row, and is not
   * asked to make one.
   *
   * Both halves, because either alone passes over the other's failure: a
   * page that hides the rows and nags still fails AC 6, and so does one
   * that stays quiet and draws empty rows.
   */
  it("omits both watch rows for a reader with no profile, and does not ask for one", async () => {
    mockProfile.nickname = null;
    render(<DriveHome driveName="media" />);

    // **Wait for the rows, not for the header.** `Add` is on the first
    // paint; the three file rows are not. Each draws a skeleton with a
    // *See all* link while loading, so asserting before they settle
    // sees a page mid-fetch. That is what made this case fail about one
    // shuffled run in eight — a race the shuffle perturbs, not an order
    // dependency. This fixture's drive has no files, so every row removes
    // itself once its fetch lands.
    await waitFor(() => expect(sectionNames()).toEqual([]));

    expect(sectionNames()).not.toContain("Continue Watching");
    expect(sectionNames()).not.toContain("Recently Viewed");

    expect(mockGetWatchHistory).not.toHaveBeenCalled();

    // Spec §6.2: "No profile prompt is added to Home."
    //
    // Asserted against the words this app would use, taken from the
    // catalogue, rather than against a shape. Two earlier attempts at
    // this asserted a shape — the word "nickname", and the page's list
    // of controls — and a paragraph carrying the app's own
    // `empty.noRecentNoProfile…` copy walked through both.
    //
    // `document`, not the render's container: overlays here portal to
    // `document.body`, so a prompt drawn as a modal or a banner would
    // land outside a container by construction.
    for (const words of PROFILE_PROMPT_WORDS) {
      expect(document.body.textContent).not.toContain(words);
    }

    // And no control that leads to where a profile is set. A prompt does
    // not have to say any of the words above to be one.
    expect(document.querySelector('a[href*="/settings"]')).toBeNull();
  });

  it("takes both watch rows away again when the profile is cleared", async () => {
    // The render gate, which the fetch gate cannot stand in for. Clearing
    // a nickname in Settings flips `hasProfile` true → false on a live
    // instance, and the two watch lists are only ever *written* under
    // `hasProfile` — so nothing empties them and the rows would go on
    // showing the history of a reader who has just asked not to be one.
    mockProfile.nickname = "Alice";
    mockGetWatchHistory.mockResolvedValue([makeWatchHistoryItem("v1")]);
    const { rerender } = render(<DriveHome driveName="media" />);
    await waitFor(() => expect(sectionNames()).toContain("Continue Watching"));

    mockProfile.nickname = null;
    rerender(<DriveHome driveName="media" />);

    await waitFor(() => {
      expect(sectionNames()).not.toContain("Continue Watching");
      expect(sectionNames()).not.toContain("Recently Viewed");
    });
  });

  it("draws both watch rows once a profile is set", async () => {
    // The population for the case above: without this, hiding the rows
    // unconditionally would satisfy it.
    mockProfile.nickname = "Alice";
    mockGetWatchHistory.mockResolvedValue([makeWatchHistoryItem("v1")]);
    render(<DriveHome driveName="media" />);
    await screen.findByRole("button", { name: "Add" });

    await waitFor(() => {
      expect(sectionNames()).toContain("Continue Watching");
      expect(sectionNames()).toContain("Recently Viewed");
    });
  });
});

describe("the drive root's header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    slotIsRegistered.current = false;
    mockProfile.nickname = null;
    mockGetDriveFiles.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 12 } });
    mockGetWatchHistory.mockResolvedValue([]);
  });

  it("carries Add beside the breadcrumb", async () => {
    render(<DriveHome driveName="media" />);
    const add = await screen.findByRole("button", { name: "Add" });
    // In the header, not merely on the page: the whole point of D-2 is
    // that this control was a screenful of scrolling below the top.
    expect(add.closest("header")).not.toBeNull();
  });

  it("names itself, once, and says which drive it is", async () => {
    // A trail here would stop at the drive and repeat the scope line, so
    // this screen names itself instead (spec §6.1, arbitration 24).
    //
    // `toEqual` on the array holds the count as well as the word, and
    // that is this line's job rather than someone else's:
    // `page-headings.test.ts` scans *source text* for hand-written `<h1>`
    // tags and cannot see one emitted through `PageHeader`, which is
    // every heading on this screen. Relaxing this to `toContain` would
    // delete the only check on AC 2's word "one".
    const { container } = render(<DriveHome driveName="media" />);
    await screen.findByRole("button", { name: "Add" });
    const headings = Array.from(container.querySelectorAll("h1")).map(
      (h) => h.textContent,
    );
    expect(headings).toEqual(["Home"]);
    // The trail, queried the way `Breadcrumb` draws it: a bare `<nav>`.
    // It carries no `aria-label` of its own — only the home link inside
    // it does — so a selector asking for one matches nothing whether the
    // trail is there or not.
    expect(container.querySelector("nav")).toBeNull();
    expect(screen.getByText("media")).not.toBeNull();
  });

  /**
   * Upload from this screen goes through a zone, not through a prop.
   *
   * `dispatchUploadEvent` resolves `document.querySelector(
   * "[data-upload-zone]")` at the moment the picker returns
   * (`useFilePicker.tsx:19`), and `UploadZone` is the only thing that
   * emits that attribute. A page with **Add** on it and no zone under it
   * opens the file chooser, takes the reader's files, and drops them
   * with no error — which is why this is asserted on the page rather
   * than on the button.
   */
  it("puts a zone under Add for the files it collects to land in", async () => {
    render(<DriveHome driveName="media" />);
    await screen.findByRole("button", { name: "Add" });
    expect(document.querySelectorAll("[data-upload-zone]")).toHaveLength(1);
  });

  it("tells the folder tree when an upload finishes here", async () => {
    // The second of the two entrances into `refreshPage`. The socket one
    // is held next door; this one has no emitter, so it is pressed by
    // handing the zone the same `upload-files` event `useFilePicker`
    // dispatches when the file chooser returns. An upload landing at the
    // drive root changes the drive's shape, and the tree pane on this
    // page is what would otherwise go on showing the old one.
    mockInitUpload.mockResolvedValue({ upload_id: "upload-1" });
    const { container } = render(<DriveHome driveName="media" />);
    await screen.findByRole("button", { name: "Add" });
    mockRefreshTree.mockClear();

    const zone = container.querySelector("[data-upload-zone]")!;
    await act(async () => {
      zone.dispatchEvent(
        new CustomEvent("upload-files", { detail: [new File(["x"], "note.txt")] }),
      );
    });

    await waitFor(() => expect(mockRefreshTree).toHaveBeenCalled());
  });

  it("offers uploading and nothing that acts on a folder", async () => {
    // This screen holds no folders, so its Add menu holds no folder
    // actions (spec 2026-09-12-purpose-oriented-navigation §6.1/§6.4).
    // `AddButton` grows **New Folder** and **New Note** each from a prop
    // the caller passes, so the rule lives in what this caller does not
    // pass, and nothing else can witness it. The rows it does draw are
    // declared rather than counted: one appearing moves this side of the
    // equality by itself.
    //
    render(<DriveHome driveName="media" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    const rows = screen.getAllByRole("menuitem").map((item) => item.textContent?.trim());
    expect(rows).toEqual(["Files", "Folder"]);
  });

  it("offers no addon rows either, on a drive where an addon has registered for them", async () => {
    // The third prop, and the one the other case cannot reach: addon rows
    // are gated on `hasSlot(ADD_MENU_SLOT)` as well as on the caller
    // passing `addonProps`, so with no addon registered the caller's
    // argument is unobservable. Registering one is what makes the second
    // gate the only thing left, which is the gate this page owns.
    //
    // `docs/user-guide/file-browsing.md` tells a reader the addon rows are
    // among what this menu does not offer, so it is a claim as much as the
    // other two are.
    slotIsRegistered.current = true;
    render(<DriveHome driveName="media" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    const rows = screen.getAllByRole("menuitem").map((item) => item.textContent?.trim());
    expect(rows).toEqual(["Files", "Folder"]);
  });

  it("draws an addon row where one is registered and the caller asks for it", async () => {
    // The population, asserted separately, because a claim that
    // something happens now is unverified until its not happening
    // breaks something. Without this, the case above passes over a
    // stand-in that never draws — the state this file was in when
    // `addonProps` was filed as inert.
    slotIsRegistered.current = true;
    render(
      <AddButton align="right" addonProps={{ drive: "media", path: "" }} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    const rows = screen.getAllByRole("menuitem").map((item) => item.textContent?.trim());
    expect(rows).toEqual(["Files", "Folder", "Addon row"]);
  });

  it("opens its menu away from the edge it sits against", async () => {
    // Add is the rightmost control in the header, and the panel is wider
    // than the trigger. `AddButton.test.tsx` holds the two anchors; this
    // holds that this caller asked for the right one, which is the half
    // that a default would silently get wrong.
    render(<DriveHome driveName="media" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    const classes = screen.getByRole("menu").getAttribute("class")!.split(/\s+/);
    expect(classes).toContain("right-0");
    expect(classes).not.toContain("left-0");
  });

});
