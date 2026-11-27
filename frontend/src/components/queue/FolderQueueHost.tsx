"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { TwoPaneLayout } from "@/components/folder/TwoPaneLayout";
import { getSmartFolders } from "@/lib/api";
import { smartFolderHref } from "@/lib/driveViews";
import { readSmartQueue } from "@/lib/smartQueue";
import { treeNarrowOpenStore } from "@/lib/treeNarrowOpenStore";
import { useSelectedFile } from "@/hooks/useSelectedFile";
import type { SmartFolder } from "@/types/smartFolder";

import {
  fetchFolderQueue,
  folderQueueHref,
  readFolderQueue,
} from "./folderQueue";
import { getLoop, setLoopStorage } from "./loopStorage";
import { requestPlay } from "./playIntent";
import { QueuePageProvider, type QueuePageState } from "./QueuePageContext";
import { QueuePane, type QueuePaneStatus } from "./QueuePane";
import { QueueRows } from "./QueueRows";
import { setQueuePage } from "./queuePagePresence";
import {
  nextPlayableAfter,
  previousPlayableBefore,
  queueEntryFromFile,
  queueWalk,
  type QueueEntry,
} from "./queue";
import { setQueueSelection } from "./queueSelectionStore";
import { loadSmartQueue, smartQueueFailed } from "./smartQueueSource";

const EMPTY_IDS: ReadonlySet<string> = new Set();
const EMPTY_ENTRIES: readonly QueueEntry[] = [];

interface FolderQueueHostProps {
  drive: string;
  folderPath: string;
  children: ReactNode;
}

/**
 * `queue=folder` and `queue=smart:{id}` on a folder route: the queue takes the
 * tree's place while the tree stays mounted behind it.
 */
export function FolderQueueHost({
  drive,
  folderPath,
  children,
}: FolderQueueHostProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tPlayback = useTranslations("playback");
  const { fileId, selectFile } = useSelectedFile();

  const queueParam = searchParams.get("queue");
  const sort = searchParams.get("sort") ?? undefined;
  const order = searchParams.get("order") ?? undefined;
  const isFolderQueue = queueParam === "folder";
  const smartId =
    queueParam?.startsWith("smart:") && queueParam.length > "smart:".length
      ? queueParam.slice("smart:".length)
      : null;
  const isQueue = isFolderQueue || smartId !== null;

  const [entries, setEntries] = useState<readonly QueueEntry[]>(EMPTY_ENTRIES);
  const [status, setStatus] = useState<QueuePaneStatus>("loading");
  const [storedQueue, setStoredQueue] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [smartFolderEntry, setSmartFolderEntry] = useState<{
    id: string;
    folder: SmartFolder | null;
  } | null>(null);
  const [loop, setLoop] = useState(getLoop);

  const storedName =
    storedQueue && storedQueue.id === smartId ? storedQueue.name : "";
  const smartFolder =
    smartFolderEntry && smartFolderEntry.id === smartId
      ? smartFolderEntry.folder
      : null;

  useEffect(() => {
    if (!smartId) {
      setSmartFolderEntry(null);
      return;
    }
    let cancelled = false;
    getSmartFolders(drive).then(
      (folders) => {
        if (!cancelled) {
          setSmartFolderEntry({
            id: smartId,
            folder: folders.find((folder) => folder.id === smartId) ?? null,
          });
        }
      },
      () => {
        if (!cancelled) setSmartFolderEntry({ id: smartId, folder: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [smartId, drive]);

  useEffect(() => {
    if (!isQueue) {
      setQueueSelection(null);
      setEntries(EMPTY_ENTRIES);
      setStatus("loading");
      setStoredQueue(null);
      return;
    }

    let cancelled = false;
    setEntries(EMPTY_ENTRIES);
    setStatus("loading");
    setStoredQueue(null);
    setQueueSelection({ loading: true, ids: EMPTY_IDS });

    const ready = (next: readonly QueueEntry[]) => {
      if (cancelled) return;
      setEntries(next);
      setStatus("ready");
      setQueueSelection({
        loading: false,
        ids: new Set(next.map((entry) => entry.id)),
      });
    };
    const failed = () => {
      if (cancelled) return;
      setStatus("failed");
      setQueueSelection({ loading: false, ids: EMPTY_IDS });
    };

    if (isFolderQueue) {
      if (sort === "random") {
        const stored = readFolderQueue(drive, folderPath);
        if (stored) {
          ready(stored.files);
          return () => {
            cancelled = true;
          };
        }
      }
      void fetchFolderQueue(drive, folderPath, sort, order).then(
        (files) => ready(files.map(queueEntryFromFile)),
        failed,
      );
    } else if (smartId) {
      const remembered = readSmartQueue(drive, smartId);
      if (remembered) {
        setStoredQueue({ id: smartId, name: remembered.name });
        ready(remembered.files);
      } else if (smartQueueFailed(drive, smartId)) {
        failed();
      } else {
        void loadSmartQueue(drive, smartId).then((queue) => {
          if (!queue) {
            failed();
            return;
          }
          setStoredQueue({ id: smartId, name: queue.name });
          ready(queue.files);
        });
      }
    }

    return () => {
      cancelled = true;
    };
  }, [isQueue, isFolderQueue, smartId, drive, folderPath, sort, order]);

  useEffect(
    () => () => {
      setQueueSelection(null);
    },
    [],
  );

  useEffect(() => {
    setQueuePage(drive, isQueue);
    return () => setQueuePage(drive, false);
  }, [drive, isQueue]);

  const folderName = folderPath
    ? folderPath.split("/").filter(Boolean).pop() || drive
    : drive;
  const name = isFolderQueue
    ? folderName
    : storedName || smartFolder?.name || "";
  const paneHref = isFolderQueue
    ? folderQueueHref(drive, folderPath)
    : smartFolder
      ? smartFolderHref(smartFolder)
      : undefined;
  const trailHref = paneHref ?? folderQueueHref(drive, "");

  const currentEntries = status === "ready" ? entries : EMPTY_ENTRIES;
  const walk = useMemo(
    () => queueWalk(currentEntries, fileId),
    [currentEntries, fileId],
  );

  const playFile = useCallback(
    (id: string) => {
      requestPlay(id);
      selectFile(id);
    },
    [selectFile],
  );

  const selectRow = useCallback(
    (id: string) => {
      treeNarrowOpenStore.set(drive, false);
      playFile(id);
    },
    [drive, playFile],
  );

  const toggleLoop = useCallback(() => {
    setLoop((previous) => {
      const next = !previous;
      setLoopStorage(next);
      return next;
    });
  }, []);

  const navigatePrev = useCallback(() => {
    if (status === "ready" && walk.prevId) playFile(walk.prevId);
  }, [status, walk.prevId, playFile]);

  const navigateNext = useCallback(() => {
    if (status === "ready" && walk.nextId) playFile(walk.nextId);
  }, [status, walk.nextId, playFile]);

  const onEnded = useCallback(() => {
    if (status !== "ready" || !fileId) return;
    const next = nextPlayableAfter(entries, fileId, loop);
    if (next) playFile(next.id);
  }, [status, entries, fileId, loop, playFile]);

  const previousTrack = useCallback(() => {
    if (status !== "ready" || !fileId) return;
    const previous = previousPlayableBefore(entries, fileId, loop);
    if (previous) playFile(previous.id);
  }, [status, entries, fileId, loop, playFile]);

  const handleClose = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("queue");
    params.delete("sort");
    params.delete("order");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [router, pathname, searchParams]);

  const queuePage = useMemo<QueuePageState | null>(() => {
    if (!isQueue) return null;
    return {
      name,
      href: trailHref,
      prevId: status === "ready" ? walk.prevId : null,
      nextId: status === "ready" ? walk.nextId : null,
      position: status === "ready" ? walk.position : null,
      total: status === "ready" ? walk.total : null,
      navigatePrev,
      navigateNext,
      onEnded,
      previousTrack,
    };
  }, [
    isQueue,
    name,
    trailHref,
    status,
    walk,
    navigatePrev,
    navigateNext,
    onEnded,
    previousTrack,
  ]);

  const leftPane = isQueue ? (
    <QueuePane
      name={name}
      href={paneHref}
      showPosition
      position={status === "ready" ? walk.position : null}
      total={status === "ready" ? walk.total : null}
      loop={loop}
      onToggleLoop={toggleLoop}
      onClose={handleClose}
      status={status}
    >
      <QueueRows entries={entries} currentId={fileId} onSelect={selectRow} />
    </QueuePane>
  ) : undefined;

  return (
    <QueuePageProvider value={queuePage}>
      <TwoPaneLayout
        drive={drive}
        folderPath={folderPath}
        queuePane={isQueue && fileId !== null}
        leftPane={leftPane}
        leftPaneAriaLabel={isQueue ? tPlayback("queueLabel") : undefined}
        treeUnderPane
      >
        {children}
      </TwoPaneLayout>
    </QueuePageProvider>
  );
}
