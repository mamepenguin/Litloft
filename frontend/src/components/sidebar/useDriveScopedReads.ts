"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getCollections, getDriveSummary, getDriveTags, getPins } from "@/lib/api";
import { useWebSocketRefresh } from "@/hooks/useWebSocketRefresh";
import type { CollectionSummary, DriveSummary, PinnedFolder, Tag } from "@/types";

/**
 * Carrying the scope with the data lets the consumer tell "these rows
 * describe the scope you are in" from "these rows are the previous
 * scope's, still on screen". The drive is part of the key as well as the
 * folder — drive is a security boundary.
 */
export interface ScopedTags {
  resolvedScope: { drive: string; folderPath: string | null };
  items: Tag[];
}

const WATCHED_EVENTS = [
  "drive.structure_changed",
  "drive.file_updated",
  "inbox.updated",
  "upload:complete",
  "scan:complete",
  "drive.collections_changed",
  "drive.pins_changed",
  "drive.tags_changed",
] as const;

const ROUND_IDLE_MS = 500;
const ROUND_MAX_WAIT_MS = 2000;

interface ListScope {
  drive: string;
  folderPath: string | null;
}

interface ReadTicket {
  seq: number;
  scope: ListScope;
}

interface TrackedList<T> {
  ticket(scope: ListScope): ReadTicket;
  succeed(ticket: ReadTicket, value: T): void;
  fail(ticket: ReadTicket): void;
}

const scopeKey = (scope: ListScope) => `${scope.drive}\u0000${scope.folderPath ?? ""}`;

/**
 * A read that started later wins. A failure keeps the rows only when they
 * describe the same scope; an older success may still land afterwards, so a
 * failure must not raise the shown sequence number.
 */
function createTrackedList<T>(
  apply: (value: T) => void,
  empty: (scope: ListScope) => T,
  isCurrent: (scope: ListScope) => boolean,
  isMounted: () => boolean,
): TrackedList<T> {
  let reads = 0;
  let shownSeq = 0;
  let shownScope: string | null = null;

  return {
    ticket(scope) {
      reads += 1;
      return { seq: reads, scope };
    },
    succeed(ticket, value) {
      if (!isMounted() || !isCurrent(ticket.scope)) return;
      if (ticket.seq <= shownSeq) return;
      shownSeq = ticket.seq;
      shownScope = scopeKey(ticket.scope);
      apply(value);
    },
    fail(ticket) {
      if (!isMounted() || !isCurrent(ticket.scope)) return;
      const key = scopeKey(ticket.scope);
      if (shownScope === key) return;
      shownScope = key;
      apply(empty(ticket.scope));
    },
  };
}

interface DriveScopedReads {
  tags: ScopedTags | null;
  pins: PinnedFolder[];
  collectionList: CollectionSummary[];
  driveSummary: DriveSummary | null;
  reloadCollections: () => Promise<void>;
}

export function useDriveScopedReads(
  currentDrive: string | null,
  currentFolderPath: string | null,
  refreshKey: number,
): DriveScopedReads {
  const [tags, setTags] = useState<ScopedTags | null>(null);
  const [pins, setPins] = useState<PinnedFolder[]>([]);
  const [collectionList, setCollectionList] = useState<CollectionSummary[]>([]);
  const [driveSummary, setDriveSummary] = useState<DriveSummary | null>(null);

  const mountedRef = useRef(true);
  const driveRef = useRef(currentDrive);
  driveRef.current = currentDrive;
  const folderRef = useRef(currentFolderPath);
  folderRef.current = currentFolderPath;

  const listsRef = useRef<{
    tags: TrackedList<ScopedTags>;
    pins: TrackedList<PinnedFolder[]>;
    collections: TrackedList<CollectionSummary[]>;
    summary: TrackedList<DriveSummary | null>;
  } | null>(null);
  if (!listsRef.current) {
    const live = () => mountedRef.current;
    const isDriveCurrent = (scope: ListScope) => scope.drive === driveRef.current;
    const isTagScopeCurrent = (scope: ListScope) =>
      scope.drive === driveRef.current && scope.folderPath === folderRef.current;
    listsRef.current = {
      tags: createTrackedList(
        setTags,
        (scope) => ({ resolvedScope: scope, items: [] }),
        isTagScopeCurrent,
        live,
      ),
      pins: createTrackedList(setPins, () => [], isDriveCurrent, live),
      collections: createTrackedList(setCollectionList, () => [], isDriveCurrent, live),
      summary: createTrackedList(setDriveSummary, () => null, isDriveCurrent, live),
    };
  }
  const lists = listsRef.current;

  const readTags = useCallback(
    (drive: string, folderPath: string | null) => {
      const scope = { drive, folderPath };
      const ticket = lists.tags.ticket(scope);
      getDriveTags(drive, folderPath)
        .then((items) => lists.tags.succeed(ticket, { resolvedScope: scope, items }))
        .catch(() => lists.tags.fail(ticket));
    },
    [lists],
  );

  const readDriveLists = useCallback(
    (drive: string) => {
      const scope = { drive, folderPath: null };
      const pinsTicket = lists.pins.ticket(scope);
      getPins(drive)
        .then((value) => lists.pins.succeed(pinsTicket, value))
        .catch(() => lists.pins.fail(pinsTicket));
      const collectionsTicket = lists.collections.ticket(scope);
      getCollections(drive)
        .then((value) => lists.collections.succeed(collectionsTicket, value))
        .catch(() => lists.collections.fail(collectionsTicket));
      const summaryTicket = lists.summary.ticket(scope);
      getDriveSummary(drive)
        .then((value) => lists.summary.succeed(summaryTicket, value))
        .catch(() => lists.summary.fail(summaryTicket));
    },
    [lists],
  );

  const readAll = useCallback(() => {
    const drive = driveRef.current;
    if (!drive) return;
    readTags(drive, folderRef.current);
    readDriveLists(drive);
  }, [readTags, readDriveLists]);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gatheringStartRef = useRef<number | null>(null);

  const cancelGathering = useCallback(() => {
    if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current);
    if (capTimerRef.current !== null) clearTimeout(capTimerRef.current);
    idleTimerRef.current = null;
    capTimerRef.current = null;
    gatheringStartRef.current = null;
  }, []);

  const runRound = useCallback(() => {
    cancelGathering();
    readAll();
  }, [cancelGathering, readAll]);

  const startGathering = useCallback(() => {
    if (!driveRef.current) return;
    const now = Date.now();
    if (gatheringStartRef.current === null) {
      gatheringStartRef.current = now;
      capTimerRef.current = setTimeout(runRound, ROUND_MAX_WAIT_MS);
    }
    if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current);
    const untilCap = gatheringStartRef.current + ROUND_MAX_WAIT_MS - now;
    idleTimerRef.current = setTimeout(
      runRound,
      Math.max(0, Math.min(ROUND_IDLE_MS, untilCap)),
    );
  }, [runRound]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelGathering();
    };
  }, [cancelGathering]);

  useEffect(() => {
    cancelGathering();
  }, [currentDrive, cancelGathering]);

  useEffect(() => {
    if (!currentDrive) {
      setDriveSummary(null);
      return;
    }
    readDriveLists(currentDrive);
  }, [currentDrive, refreshKey, readDriveLists]);

  useEffect(() => {
    if (!currentDrive) {
      setTags(null);
      return;
    }
    readTags(currentDrive, currentFolderPath);
  }, [currentDrive, currentFolderPath, refreshKey, readTags]);

  useWebSocketRefresh(WATCHED_EVENTS, startGathering, currentDrive ?? undefined);

  const reloadCollections = useCallback(async () => {
    const drive = driveRef.current;
    if (!drive) return;
    const ticket = lists.collections.ticket({ drive, folderPath: null });
    try {
      const value = await getCollections(drive);
      lists.collections.succeed(ticket, value);
    } catch {
      lists.collections.fail(ticket);
    }
  }, [lists]);

  return { tags, pins, collectionList, driveSummary, reloadCollections };
}
