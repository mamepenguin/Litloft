"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Folder, History, Clock, Star, ThumbsUp, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FileItem, Folder as FolderType, PaginatedResponse, WatchHistoryItem } from "@/types";
import { addPin, createFolder, getDriveFiles, getFolders, getPins, getWatchHistory, removePin } from "@/lib/api";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { useContextMenu } from "@/hooks/useContextMenu";
import { cardGridTemplate, useCardColumns } from "@/lib/cardGrid";
import { useTreeRefresh } from "@/components/TreeRefreshContext";
import { useWebSocketRefresh } from "@/hooks/useWebSocketRefresh";
import { AddButton } from "./AddButton";
import { AddonSlot } from "./AddonSlot";
import { Breadcrumb } from "./Breadcrumb";
import { Button } from "./Button";
import { CarouselSection } from "./CarouselSection";
import { ContinueWatchingSection } from "./ContinueWatchingSection";
import { FolderCard } from "./FolderCard";
import { useFolderCardRename } from "./folder/useFolderCardRename";
import { FolderContextMenu } from "./FolderContextMenu";
import { PageHeader } from "./PageHeader";
import { RootFileListing } from "./RootFileListing";
import { TreeToggle } from "./TreeToggle";
import { useSidebar } from "./SidebarProvider";
import { useProfile } from "./ProfileProvider";

interface DriveHomeProps {
  driveName: string;
}

interface SectionState {
  files: FileItem[];
  /**
   * How many files match the section's query, not how many it holds.
   *
   * `getDriveFiles` returns it in `meta.total` and the row shows at most
   * `SECTION_LIMIT` of them, so this is the only thing that can say how
   * much is past the edge. `undefined` while loading, and after a fetch
   * that failed with nothing already in the row — where it is moot, since
   * a row with no files does not render. A fetch that fails over a row
   * that has files keeps that row's own total rather than dropping it.
   * `CarouselSection` falls back to an unqualified "See all" when it is
   * absent, rather than claiming a number it does not have.
   */
  total?: number;
  loading: boolean;
}

/**
 * The identity every response on this page carries: **which drive it was
 * made for, and which request made it.** Both, because they answer
 * different questions and each leaves a case open on its own.
 *
 * The drive alone cannot separate two visits to one drive.
 * `/drive/[name]` renders this component with no `key`, so one instance
 * survives A → B → A and the first visit's request settles on the third
 * render still naming the drive in front of you.
 *
 * The request alone cannot catch a callback captured on one drive and
 * invoked after the page has moved. `handleCreateFolder` awaits
 * `createFolder`, then calls a `refreshFolders` still closed over the
 * drive it was armed on: that issues a **brand-new** `getFolders` for the
 * drive that was left, which mints the newest id and so passes any test
 * of "is this the latest request". `useFolderCardRename`'s commit, the
 * drag `onComplete`, `FolderContextMenu`'s `onUpdate` and `onFileAction`
 * on the carousels and the file listing all have that shape.
 *
 * The identity travels with the response rather than being read where the
 * response is applied, so a caller added later has nothing to remember:
 * neither `applyFileSections` nor `applyFolders` can be reached without a
 * batch, and a batch cannot be built without both fields.
 */
interface ResponseIdentity {
  /** The drive the request was made for, read off the closure that made it. */
  drive: string;
  requestId: number;
}

/**
 * One `getDriveFiles` batch.
 *
 * The entrances are the page's fetch effect; `refetchAllSections` as
 * `onFileAction` on each of the three carousels and on the file
 * listing; and `refetchAllSections` inside `refreshPage`, which the
 * WebSocket subscription below fires with no user action at all.
 *
 * `Promise.allSettled` means this resolves even when every request in it
 * failed, so "the batch arrived" is not "the batch delivered anything" —
 * see `applyFileSections`.
 */
interface FileSectionsBatch extends ResponseIdentity {
  results: PromiseSettledResult<PaginatedResponse>[];
}

/**
 * One `getFolders` response.
 *
 * `folders` is `null` when the request failed, which leaves the grid
 * holding what it had — the same outcome the swallowed error had
 * before, now expressed as a response rather than as an early return.
 */
interface FoldersBatch extends ResponseIdentity {
  folders: FolderType[] | null;
}

const SECTION_LIMIT = 12;
const MAX_FOLDERS = 8;

export function DriveHome({ driveName }: DriveHomeProps) {
  const t = useTranslations("drive");
  const tc = useTranslations("common");
  const tf = useTranslations("folder");
  const { nickname } = useProfile();
  const hasProfile = nickname !== null;
  const [continueWatching, setContinueWatching] = useState<WatchHistoryItem[]>([]);
  const [continueWatchingLoading, setContinueWatchingLoading] = useState(false);
  const [recentlyPlayed, setRecentlyPlayed] = useState<WatchHistoryItem[]>([]);
  const [recentlyPlayedLoading, setRecentlyPlayedLoading] = useState(false);
  const [recent, setRecent] = useState<SectionState>({ files: [], loading: true });
  const [favorites, setFavorites] = useState<SectionState>({ files: [], loading: true });
  const [liked, setLiked] = useState<SectionState>({ files: [], loading: true });
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [foldersExpanded, setFoldersExpanded] = useState(false);
  const folderGridId = useId();
  const [pinnedPaths, setPinnedPaths] = useState<Set<string>>(new Set());
  const [menuTarget, setMenuTarget] = useState<FolderType | null>(null);
  const { ref: folderGridRef, columns } = useCardColumns();
  const { menuState: folderMenuState, close: closeFolderMenu, handlers: folderMenuHandlers } = useContextMenu();
  const { requestRefresh: refreshSidebar } = useSidebar();
  const emptySelection = useMemo(() => new Set<string>(), []);
  const refreshTree = useTreeRefresh();

  // The drive the page is showing, as opposed to the drive any given
  // request was made for. Read only after an `await`, so the effect that
  // maintains it has always run by then.
  const shownDriveRef = useRef(driveName);
  useEffect(() => {
    shownDriveRef.current = driveName;
  }, [driveName]);

  // Which request each of this page's streams of responses is waiting on.
  // `++ref.current` mints the id of a new request; the `applied` ref
  // beside it records the id of the last response that actually wrote
  // something.
  //
  // **Newest applied, not newest dispatched.** Dropping everything that
  // is not the newest request in flight means a refresh cancels the page
  // load's own fetch before anyone knows whether the refresh will deliver
  // — and when it does not, the good response is already gone and nothing
  // re-requests it. For the grid that ends at `foldersLoading === false`
  // with `folders === []`, which the section's render gate reads as "this
  // drive has no folders" and removes the section outright; for the rows
  // it leaves all three empty for the rest of the visit. Comparing
  // against what has landed instead means a superseded request can be
  // briefly visible but can never be the last word, and a request that
  // delivers nothing takes nothing with it.
  //
  // Same pattern as `useInfiniteScroll`'s `fetchIdRef`, with that one
  // difference. The streams are separate because they are separate
  // resources: a folder refresh must not supersede a row refetch that the
  // same WebSocket event started.
  const fileSectionsRequestRef = useRef(0);
  const fileSectionsAppliedRef = useRef(0);
  const foldersRequestRef = useRef(0);
  const foldersAppliedRef = useRef(0);
  // Bumped by the fetch effect alone. The pin set and the watch rows
  // are read only there, so a page load is the unit of identity for
  // them, and `handleTogglePin` — which updates the set it fetched
  // rather than replacing it — is answering that same load.
  const pageLoadRef = useRef(0);

  const applyFolders = useCallback((batch: FoldersBatch) => {
    if (batch.drive !== shownDriveRef.current) return;
    if (batch.requestId < foldersAppliedRef.current) return;
    // A failed request leaves the grid holding what it had, and leaves
    // the stream to whatever is still in flight — which is why this
    // returns before claiming the stream rather than after.
    //
    // "What it had" is this drive's list and nothing else, because the
    // reset effect empties `folders` when the drive changes — not the
    // fetch effect, which also runs when the nickname settles. That is
    // the scoping, and it is in the state rather than here: this branch
    // is reached with the drive already checked, but a *check* is what
    // the previous five rounds each had one of.
    if (batch.folders === null) return;
    foldersAppliedRef.current = batch.requestId;
    setFolders(batch.folders);
  }, []);

  const fetchFolders = useCallback(async (): Promise<FoldersBatch> => {
    const requestId = ++foldersRequestRef.current;
    const drive = driveName;
    try {
      return { drive, requestId, folders: await getFolders(drive) };
    } catch {
      return { drive, requestId, folders: null };
    }
  }, [driveName]);

  const refreshFolders = useCallback(async () => {
    applyFolders(await fetchFolders());
    refreshTree();
  }, [applyFolders, fetchFolders, refreshTree]);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);

  const cancelCreateFolder = useCallback(() => {
    setCreatingFolder(false);
    setNewFolderName("");
    setFolderError(null);
  }, []);

  // Only the folder grid and the tree are refetched, not the file
  // listing below: a new folder holds no files, so nothing in that
  // listing changes. `refreshFolders` covers the tree on its way past.
  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    if (name.includes("/") || name.includes("\\") || name === ".." || name === "." || name.startsWith(".")) {
      setFolderError(tf("invalidName"));
      return;
    }
    if (name.length > 255) {
      setFolderError(tf("nameTooLong"));
      return;
    }
    setFolderError(null);

    // A guard, not a reset, and it guards on the **drive**.
    //
    // The reset effect above blanks this field when the drive changes,
    // which scopes every synchronous writer — including the two
    // `setFolderError` calls a few lines up. What it cannot scope is
    // this continuation: it lands after that reset, when the field
    // legitimately holds the next drive's half-typed name, so closing it
    // or writing an error into it there would take something that
    // belongs to the drive in front of you.
    //
    // `shownDriveRef`, not `pageLoadRef`. The page-load id bumps for
    // every dependency the fetch effect has — `nickname` among them — so
    // it says "something re-fetched", not "the drive changed", and
    // gating on it suppressed a create's own outcome on the drive it was
    // made for. The condition this needs is the drive, and that is what
    // it now asks.
    try {
      await createFolder(driveName, "", name);
      if (shownDriveRef.current === driveName) cancelCreateFolder();
      // Not gated: the grid answers to its own request identity, and the
      // tree below it should learn about the folder either way.
      await refreshFolders();
    } catch {
      if (shownDriveRef.current === driveName) setFolderError(tf("createFailed"));
    }
  }, [newFolderName, tf, driveName, cancelCreateFolder, refreshFolders]);

  // Inline rename for the folder grid, the same wiring FolderContent
  // uses. Both hosts share it so the same right-click cannot mean two
  // different things depending on the screen.
  const rename = useFolderCardRename(driveName, refreshFolders);

  // Auto-refresh the folder grid when cross-pane drops or WS events arrive.
  // Two complementary signals:
  //   1. WS events — covers backend-emitted structural changes (scan, other clients)
  //   2. loft-move-complete window event — immediate signal after any in-page
  //      drag-and-drop completes, including cross-pane drops that don't trigger
  //      this component's own onComplete callback.
  useEffect(() => {
    const handler = () => refreshFolders();
    window.addEventListener("loft-move-complete", handler);
    return () => window.removeEventListener("loft-move-complete", handler);
  }, [refreshFolders]);

  const {
    dragState,
    handleFolderDragStart,
    handleDragEnd,
    getDropTargetProps,
    isDropTarget,
    isDropDisabled,
  } = useDragAndDrop({
    drive: driveName,
    selectedIds: emptySelection,
    onComplete: () => {
      refreshFolders();
      refreshSidebar();
    },
  });

  const applyFileSections = useCallback((batch: FileSectionsBatch) => {
    // The guard sits here rather than in each caller: this is where a
    // response becomes what the page shows, and a batch cannot reach it
    // without carrying both halves of its identity.
    if (batch.drive !== shownDriveRef.current) return;
    if (batch.requestId < fileSectionsAppliedRef.current) return;

    const { results } = batch;

    // `Promise.allSettled` resolves even when all three requests failed,
    // so a batch arriving is not a batch delivering. One that delivered
    // nothing still clears the skeleton — a first load that fails must
    // not leave it spinning — but it must not claim the stream, or it
    // would discard the response still in flight that can.
    if (results.some((result) => result.status === "fulfilled")) {
      fileSectionsAppliedRef.current = batch.requestId;
    }
    // A failed request leaves the row holding what it had, the same way a
    // failed `getFolders` leaves the grid holding its list. Writing an
    // empty row instead would let a refresh that delivered nothing erase
    // one that did — on the first load there is nothing to keep, so the
    // row still ends up empty and out of the skeleton.
    const section = (
      result: PromiseSettledResult<PaginatedResponse>,
      previous: SectionState,
    ): SectionState =>
      result.status === "fulfilled"
        ? {
            files: result.value.data,
            total: result.value.meta.total,
            loading: false,
          }
        : { ...previous, loading: false };

    setRecent((previous) => section(results[0], previous));
    setFavorites((previous) => section(results[1], previous));
    setLiked((previous) => section(results[2], previous));
  }, []);

  const fetchFileSections = useCallback(async (): Promise<FileSectionsBatch> => {
    const requestId = ++fileSectionsRequestRef.current;
    const drive = driveName;
    const results = await Promise.allSettled([
      getDriveFiles(drive, { sort: "created_at", order: "desc", limit: SECTION_LIMIT }),
      getDriveFiles(drive, { favorite: true, sort: "created_at", order: "desc", limit: SECTION_LIMIT }),
      getDriveFiles(drive, { liked: true, sort: "liked_at", order: "desc", limit: SECTION_LIMIT }),
    ]);
    return { drive, requestId, results };
  }, [driveName]);

  /**
   * The drive-owned state this effect drops when the drive changes.
   *
   * Enumerated rather than described as "everything", because it is not
   * everything and a claim of completeness here is what sent the last
   * round looking in the wrong place:
   *
   * - `folders` — the grid would otherwise draw the previous drive's
   *   cards the moment `foldersLoading` cleared.
   * - `foldersExpanded` — one drive's expansion would decide how the
   *   next one opens.
   * - the create field (`creatingFolder` / `newFolderName` /
   *   `folderError`) — it would otherwise arrive holding a name typed
   *   somewhere else, or an "Invalid folder name" raised there.
   * - `menuTarget` and the context menu's open state — the menu would
   *   stay open over a folder the page has left (measured: it does), and
   *   `useContextMenu`'s 500 ms long-press timer is not cancelled on a
   *   drive change, so one begun before the navigation can reopen it
   *   after.
   *
   *   `FolderContextMenu` draws nothing unless *both* are set, and of the
   *   two lines only `setMenuTarget(null)` is independently observable:
   *   with the target gone the menu is already inert, so deleting
   *   `closeFolderMenu()` on its own changes nothing on screen and no
   *   case fails (measured — it is a declared survivor). It stays because
   *   leaving `useContextMenu` resting "open" across a drive it is not
   *   about is a state no reader of `folderMenuState.open` alone should
   *   have to know is a lie.
   *
   * **What this effect does not cover**, and why it is not a hole this
   * PR opened — each measured against `origin/develop` and reproducing
   * there:
   *
   * - `recent` / `favorites` / `liked` are blanked by the fetch effect,
   *   which also runs when the nickname settles, so a failing re-fetch
   *   empties them for the rest of the visit.
   * - `rename.error` (`useFolderCardRename`) is announced above this
   *   drive's grid for up to its 3 s TTL after being raised on another.
   * - `rename.editingPath` *is* dropped, but by `setFolders([])`
   *   unmounting the card and `InlineNameEditor`'s cleanup cancelling
   *   the edit — not by this effect. A card that survived the clear
   *   would reopen in edit mode with nothing failing.
   * - `pinnedPaths` is written only by the fetch effect's tail, in the
   *   same React commit as `applyFolders` and `setFoldersLoading(false)`,
   *   so no frame draws this drive's grid against the previous drive's
   *   pins. That is a property of the batching, not of this effect.
   *
   * **This is the scoping, and it is one place rather than one check per
   * writer.** Six rounds of this component closed six separate paths
   * into `folders`, each one a call site that had to remember to ask "is
   * this response still wanted?", and the seventh was found in the
   * failure branch of the guard written for the sixth. A reset cannot be
   * reopened by a call site added later, because the call site is not
   * where it lives.
   *
   * It is keyed on `driveName` alone, unlike the fetch effect below,
   * which also re-runs when the nickname settles. Declared before that
   * effect by convention rather than by necessity: the fetch effect
   * reads none of the state above on the path that issues a request, and
   * both run in one flush, so moving this one after it changes nothing
   * observable (measured).
   *
   * What it cannot scope is a write that lands *after* it: a create
   * still in flight when the drive changes settles later, when the field
   * legitimately holds the next drive's half-typed name. That one is a
   * guard, in `handleCreateFolder`.
   */
  useEffect(() => {
    setFolders([]);
    setFoldersExpanded(false);
    cancelCreateFolder();
    setMenuTarget(null);
    closeFolderMenu();
  }, [driveName, cancelCreateFolder, closeFolderMenu]);

  useEffect(() => {
    const fetchAll = async () => {
      const pageLoadId = ++pageLoadRef.current;
      setRecent({ files: [], loading: true });
      setFavorites({ files: [], loading: true });
      setLiked({ files: [], loading: true });
      // `folders` is *not* emptied here. This effect re-runs for reasons
      // that are not a drive change — `hasProfile` and `nickname` are in
      // its dependencies, and `ProfileProvider` reports `null` on the
      // first pass and the cookie on the second, so a profiled user's
      // hard load runs it twice on one drive. Emptying the list on those
      // runs and then failing the re-fetch is how the Folders section
      // disappears from a drive that has folders. The clear belongs to
      // the drive, and lives in the reset effect above.
      setFoldersLoading(true);
      if (hasProfile) {
        setContinueWatchingLoading(true);
        setRecentlyPlayedLoading(true);
      }

      const promises: [
        Promise<FileSectionsBatch>,
        Promise<FoldersBatch>,
        Promise<{ path: string }[]>,
        Promise<WatchHistoryItem[]> | null,
        Promise<WatchHistoryItem[]> | null,
      ] = [
        fetchFileSections(),
        fetchFolders(),
        getPins(driveName).catch(() => [] as { path: string }[]),
        hasProfile ? getWatchHistory(driveName, SECTION_LIMIT).catch(() => [] as WatchHistoryItem[]) : null,
        hasProfile ? getWatchHistory(driveName, SECTION_LIMIT, "all").catch(() => [] as WatchHistoryItem[]) : null,
      ];

      const [fileResults, foldersResult, pinsResult, watchResult, recentlyPlayedResult] = await Promise.all([
        promises[0],
        promises[1],
        promises[2],
        promises[3] ?? Promise.resolve([] as WatchHistoryItem[]),
        promises[4] ?? Promise.resolve([] as WatchHistoryItem[]),
      ]);

      // The rows and the grid answer to their own requests, so they are
      // applied whether or not this page load is still the current one.
      applyFileSections(fileResults);
      applyFolders(foldersResult);

      // The rest is fetched only here, so this page load is what it
      // answers to.
      if (pageLoadRef.current !== pageLoadId) return;

      setFoldersLoading(false);
      setPinnedPaths(new Set(pinsResult.map((p) => p.path)));
      if (hasProfile) {
        setContinueWatching(watchResult);
        setContinueWatchingLoading(false);
        setRecentlyPlayed(recentlyPlayedResult);
        setRecentlyPlayedLoading(false);
      }
    };

    fetchAll();
  }, [driveName, fetchFileSections, applyFileSections, fetchFolders, applyFolders, hasProfile, nickname]);

  const handleTogglePin = useCallback(
    async (folderPath: string) => {
      // The drive, not the page load. A pin path is drive-relative, so
      // the same string is a different folder on the next drive, and
      // that is the whole condition: this write is a *functional* update
      // adding or deleting one path, so applying it to a set refetched
      // in the meantime is idempotent, and the server really did perform
      // it — applying it is more correct than dropping it.
      //
      // `pageLoadRef` bumps for every dependency the fetch effect has,
      // `nickname` among them, so gating on it dropped a pin made on the
      // drive in front of you whenever the nickname settled mid-request:
      // the folder stayed marked unpinned and the page-load's own
      // `getPins`, dispatched before the pin, did not repair it.
      // Measured against `origin/develop`, where this write is
      // unguarded: the pin lands there and does not here.
      try {
        const isPinned = pinnedPaths.has(folderPath);
        if (isPinned) {
          await removePin(driveName, folderPath);
        } else {
          await addPin(driveName, folderPath);
        }
        if (shownDriveRef.current === driveName) {
          setPinnedPaths((prev) => {
            const next = new Set(prev);
            if (isPinned) next.delete(folderPath);
            else next.add(folderPath);
            return next;
          });
        }
        refreshSidebar();
      } catch {
        // ignore
      }
    },
    [driveName, pinnedPaths, refreshSidebar]
  );

  const refetchAllSections = useCallback(async () => {
    applyFileSections(await fetchFileSections());
  }, [fetchFileSections, applyFileSections]);

  // Both halves of the page follow the drive: the folder grid *and* the
  // Recently Added / Favorites / Liked rows. Refreshing only the grid
  // left the rows showing files that had been deleted or moved
  // elsewhere.
  //
  // `drive.file_updated` matters here because favouriting is a content
  // update, not a structural one, so the Favourites row would otherwise
  // never notice a change made on another device.
  const refreshPage = useCallback(() => {
    void refreshFolders();
    void refetchAllSections();
  }, [refreshFolders, refetchAllSections]);

  useWebSocketRefresh(
    ["drive.structure_changed", "drive.file_updated"],
    refreshPage,
    driveName,
  );

  const handleRemoveWatchItem = useCallback((fileId: string) => {
    setContinueWatching((prev) => prev.filter((item) => item.id !== fileId));
    setRecentlyPlayed((prev) => prev.filter((item) => item.id !== fileId));
  }, []);

  // The folders the grid has, which are none while it is drawing the
  // skeleton.
  //
  // `folders` no longer survives a drive change — the reset effect drops
  // it — so this mask is not what keeps the previous drive off the grid.
  // What it is still for is the one way a list can be in state under a
  // skeleton on *this* drive: an out-of-band refresh (a drag-and-drop, a
  // WebSocket `drive.structure_changed`) settling while the page load's
  // own fetch is still in flight. It also means a same-drive re-fetch
  // draws the skeleton rather than the list it is about to replace,
  // which is a consequence of masking rather than a reason for it.
  //
  // The control and the cards are counted from this one list, so the
  // number in the label is the number of cards that appear, and a
  // control that names the grid is only ever drawn beside a grid that
  // exists. The control appears when the list is strictly longer than
  // the cap.
  const gridFolders = foldersLoading ? [] : folders;
  const hiddenFolderCount = gridFolders.length - MAX_FOLDERS;
  const visibleFolders = foldersExpanded ? gridFolders : gridFolders.slice(0, MAX_FOLDERS);

  const driveBase = `/drive/${encodeURIComponent(driveName)}`;

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col">
      {/* The same header the folder and file views draw, in its titleless
          form: the breadcrumb is the subject here, so `PageHeader` emits
          no `<h1>` and puts the actions on the trail row beside it.
          Y-aligned with FolderBrowser's, so the tree toggle sits at the
          same height on the drive root, in a sub folder and on a file.

          Add is here rather than in the file listing below because the
          listing is the last of up to seven sections — roughly a
          screenful of scrolling from the top of the page it acts on
          (D-2). It is also this screen's one accent fill, so it is moved
          rather than duplicated. */}
      <PageHeader
        leading={<TreeToggle drive={driveName} />}
        breadcrumb={<Breadcrumb driveName={driveName} folderPath="" />}
        actions={
          <AddButton
            // Rightmost here, unlike the folder toolbar's leftmost one:
            // the menu is wider than its trigger, so anchored left it
            // would grow off the right edge of the page.
            align="right"
            onCreateFolder={() => setCreatingFolder(true)}
          />
        }
      />

      {/* The name field opens directly under the button that asked for
          it. It used to open beside the Add button in the file listing;
          with the button here, leaving it there would split one action
          across the length of the page. */}
      {creatingFolder && (
        <div className="flex items-center gap-2 px-4 pb-2">
          <input
            type="text"
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFolder();
              if (e.key === "Escape") cancelCreateFolder();
            }}
            placeholder={tf("namePlaceholder")}
            aria-invalid={folderError !== null}
            className="min-w-0 flex-1 rounded-2xl bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-focus-ring sm:w-40 sm:flex-initial"
          />
          {/* The twin of the folder toolbar's inline Create, and not a
              second accent fill for the same reason: Add stays on screen
              above this row (DESIGN.md §2.2). */}
          <Button variant="secondary" size="sm" onClick={handleCreateFolder}>
            {tc("create")}
          </Button>
          <Button
            iconOnly
            variant="ghost"
            aria-label={tc("cancel")}
            onClick={cancelCreateFolder}
          >
            <X size={16} />
          </Button>
          {/* Announced, like the rename error further down this file. A
              rejected name is the only feedback there is, and the row
              stays open for it to be fixed. */}
          {folderError && (
            <span role="alert" className="text-xs text-danger">
              {folderError}
            </span>
          )}
        </div>
      )}
      <div className="space-y-8 px-4 pb-6 pt-2 sm:px-6 sm:pb-8 sm:pt-4">
      {(foldersLoading || folders.length > 0) && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
              <Folder size={20} className="text-text-muted" />
              {t("folders")}
            </h2>
            {/* The rest of the grid is revealed here rather than behind
                a link, because there is no drive-wide destination that
                lists folders: `?view=all` is the flat every-file
                listing and renders none. The sidebar offers that view
                under its own name ("All Files"), where a flat listing
                of files is what is being asked for. */}
            {hiddenFolderCount > 0 && (
              <button
                type="button"
                onClick={() => setFoldersExpanded((expanded) => !expanded)}
                aria-expanded={foldersExpanded}
                aria-controls={folderGridId}
                className="text-sm text-text-muted transition-colors hover:text-accent"
              >
                {foldersExpanded ? tc("showLess") : tc("showMoreCount", { count: hiddenFolderCount })}
              </button>
            )}
          </div>

          {rename.error && (
            <div
              role="alert"
              className="mb-3 rounded-lg bg-danger px-3 py-1.5 text-xs text-white"
            >
              {rename.error}
            </div>
          )}

          {foldersLoading ? (
            <div
              ref={folderGridRef}
              className="grid gap-3"
              style={{ gridTemplateColumns: cardGridTemplate(columns) }}
            >
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-2xl bg-bg-card p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-lg bg-bg-elevated" />
                    <div className="space-y-2">
                      <div className="h-4 w-24 rounded-lg bg-bg-elevated" />
                      <div className="h-3 w-16 rounded-lg bg-bg-elevated" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              id={folderGridId}
              ref={folderGridRef}
              className="grid gap-3"
              style={{ gridTemplateColumns: cardGridTemplate(columns) }}
            >
              {visibleFolders.map((folder) => {
                const disabled = isDropDisabled(folder.path);
                return (
                  <FolderCard
                    key={folder.path}
                    folder={folder}
                    driveName={driveName}
                    draggable
                    isDragging={dragState.draggedFolderPath === folder.path}
                    onDragStart={(e) => handleFolderDragStart(e, folder.path)}
                    onDragEnd={handleDragEnd}
                    isDropTarget={dragState.isDragging && !disabled && isDropTarget(folder.path)}
                    dropTargetProps={dragState.isDragging && !disabled ? getDropTargetProps(folder.path) : undefined}
                    onContextMenu={(e) => {
                      setMenuTarget(folder);
                      folderMenuHandlers.onContextMenu(e);
                    }}
                    onTouchStart={(e) => {
                      setMenuTarget(folder);
                      folderMenuHandlers.onTouchStart(e);
                    }}
                    onTouchEnd={folderMenuHandlers.onTouchEnd}
                    onTouchMove={folderMenuHandlers.onTouchMove}
                    {...rename.cardProps(folder)}
                  />
                );
              })}
            </div>
          )}
        </section>
      )}

      {hasProfile && (
        <ContinueWatchingSection
          items={continueWatching}
          loading={continueWatchingLoading}
          // The same destination Recently played uses, and for the same
          // reason it is needed at all: the row draws only what fits, so
          // without a link the rest of the history is unreachable from
          // here. Recently played is this history without the 90%
          // completion gate — a superset, so nothing a reader came for
          // is missing from it.
          seeAllHref={`${driveBase}?view=recent`}
          onRemoveItem={handleRemoveWatchItem}
        />
      )}

      {hasProfile && (
        <ContinueWatchingSection
          items={recentlyPlayed}
          loading={recentlyPlayedLoading}
          title={t("recentlyPlayed")}
          icon={<History size={20} className="text-text-muted" />}
          seeAllHref={`${driveBase}?view=recent`}
          onRemoveItem={handleRemoveWatchItem}
        />
      )}

      <AddonSlot id="drive-home-sections" props={{ drive: driveName }} />

      <CarouselSection
        title={t("recentAdded")}
        icon={<Clock size={20} className="text-text-muted" />}
        files={recent.files}
        loading={recent.loading}
        totalCount={recent.total}
        seeAllHref={`${driveBase}?view=recent-added`}
        onFileAction={refetchAllSections}
      />

      <CarouselSection
        title={t("favorites")}
        icon={<Star size={20} className="text-text-muted" />}
        files={favorites.files}
        loading={favorites.loading}
        totalCount={favorites.total}
        seeAllHref={`${driveBase}?view=favorites`}
        onFileAction={refetchAllSections}
      />

      <CarouselSection
        title={t("liked")}
        icon={<ThumbsUp size={20} className="text-text-muted" />}
        files={liked.files}
        loading={liked.loading}
        totalCount={liked.total}
        seeAllHref={`${driveBase}?view=liked`}
        onFileAction={refetchAllSections}
      />

      <RootFileListing
        driveName={driveName}
        onFileAction={refetchAllSections}
        onFolderChange={refreshFolders}
      />

      <FolderContextMenu
        open={folderMenuState.open}
        position={folderMenuState.position}
        target={menuTarget}
        drive={driveName}
        isPinned={menuTarget ? pinnedPaths.has(menuTarget.path) : false}
        onTogglePin={menuTarget ? () => handleTogglePin(menuTarget.path) : undefined}
        onUpdate={refreshFolders}
        onClose={closeFolderMenu}
        onStartInlineRename={
          menuTarget ? () => rename.start(menuTarget.path) : undefined
        }
      />
      </div>
    </div>
  );
}
