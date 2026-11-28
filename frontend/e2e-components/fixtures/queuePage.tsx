/**
 * A queue page, measured in Chromium: the real `TwoPaneLayout` with the real
 * queue pane and collection rows, the real right pane and file page, and the
 * real app header that hosts the page row.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { NextIntlClientProvider } from "next-intl";

import { AddonSlotsProvider } from "@/components/AddonSlotsProvider";
import { AppShell } from "@/components/AppShell";
import { ClipboardProvider } from "@/components/ClipboardProvider";
import { CurrentDriveProvider } from "@/components/CurrentDriveProvider";
import { ProfileProvider } from "@/components/ProfileProvider";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { SidebarProvider } from "@/components/SidebarProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { CollectionItemsPane } from "@/components/CollectionItemsPane";
import { TwoPaneLayout } from "@/components/folder/TwoPaneLayout";
import {
  QueuePageProvider,
  type QueuePageState,
} from "@/components/queue/QueuePageContext";
import { QueuePane } from "@/components/queue/QueuePane";
import { QueueRows } from "@/components/queue/QueueRows";
import { requestPlay } from "@/components/queue/playIntent";
import { setQueuePage } from "@/components/queue/queuePagePresence";
import { queueWalk, type QueueEntry } from "@/components/queue/queue";
import { useSelectedFile } from "@/hooks/useSelectedFile";
import { seedFiles } from "@/lib/fileSeed";
import type { FileItem } from "@/types";
import enMessages from "@/messages-core/en.json";

import { installMedia, VIDEO_ID } from "./inspectorResponsive";

const DRIVE = "fixture";
const NOTE_ID = "qnote0000001";
const LONG_ID = "qlong0000001";

const LONG_NAME = `${"a".repeat(196)}.mp4`;

function fileJson(overrides: Partial<FileItem> & { id: string }): FileItem {
  return {
    filename: `${overrides.id}.bin`,
    title: overrides.id,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: "video",
    mime_type: "video/webm",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 4096,
    duration: 3,
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
    modified_at: null,
    ...overrides,
  } as FileItem;
}

const VIDEO = fileJson({
  id: VIDEO_ID,
  filename: "clip.webm",
  title: "Fixture clip",
  duration: 3,
});

const NOTE = fileJson({
  id: NOTE_ID,
  filename: "meeting-notes.md",
  title: "meeting-notes.md",
  folder_path: "Notes",
  file_type: "document",
  mime_type: "text/markdown",
  duration: null,
});

const LONG = fileJson({
  id: LONG_ID,
  filename: LONG_NAME,
  title: LONG_NAME,
  duration: 60,
});

const FILES: Record<string, FileItem> = {
  [VIDEO_ID]: VIDEO,
  [NOTE_ID]: NOTE,
  [LONG_ID]: LONG,
};

const NOTE_BODY = "# Meeting notes\n\nFirst point.\n\nSecond point.\n";

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchInstalled = false;

function installFetch(): void {
  if (fetchInstalled) return;
  fetchInstalled = true;
  seedFiles(Object.values(FILES));
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const path = url.split("?")[0];

    if (path.endsWith("/api/addons/status")) {
      return Promise.resolve(
        json({
          addons: { intelligence: { label: "Intelligence", icon: "sparkles" } },
          slots: {},
        }),
      );
    }
    const fileMatch = path.match(/\/api\/files\/([^/]+)(\/.*)?$/);
    if (fileMatch) {
      const file = FILES[decodeURIComponent(fileMatch[1])];
      const rest = fileMatch[2] ?? "";
      if (rest === "" && file) return Promise.resolve(json(file));
      if (rest === "/content" && file) {
        return Promise.resolve(
          new Response(NOTE_BODY, {
            status: 200,
            headers: { "Content-Type": "text/markdown", ETag: '"v1"' },
          }),
        );
      }
      if (rest === "/progress")
        return Promise.resolve(json({ position: 0, duration: 0 }));
      if (rest === "/relations") return Promise.resolve(json({ relations: [] }));
      if (rest === "/comments")
        return Promise.resolve(json({ comments: [], total: 0 }));
      if (rest === "/chapters") return Promise.resolve(json({ chapters: [] }));
      if (rest === "/neighbors")
        return Promise.resolve(
          json({ prev_id: null, next_id: null, position: null, total: null }),
        );
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (path.includes("/file_active_summary/")) {
      return Promise.resolve(json({ has_active_summary: false }));
    }
    if (path.includes("/addon-policies")) {
      return Promise.resolve(json({ addons: {} }));
    }
    return nativeFetch(input, init);
  };
}

function entryFrom(file: FileItem): QueueEntry {
  return {
    id: file.id,
    title: file.title,
    file_type: file.file_type,
    duration: file.duration,
  };
}

/** A row file that is never opened: the queue pane only needs its label. */
function rowFile(entry: QueueEntry): FileItem {
  return (
    FILES[entry.id] ??
    fileJson({
      id: entry.id,
      title: entry.title,
      file_type: entry.file_type,
      mime_type: "image/png",
      duration: entry.duration,
      has_thumbnail: false,
    })
  );
}

function Providers({ children }: { children: ReactNode }): ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ToastProvider>
        <ProfileProvider>
          <CurrentDriveProvider>
            <AddonSlotsProvider>
              <ClipboardProvider>
                <SidebarProvider>
                  <ShortcutsProvider>{children}</ShortcutsProvider>
                </SidebarProvider>
              </ClipboardProvider>
            </AddonSlotsProvider>
          </CurrentDriveProvider>
        </ProfileProvider>
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

interface QueueFixtureProps {
  entries: readonly QueueEntry[];
  /** A date query string kept on every selection this page makes. */
  extraQuery?: string;
  /** Draw the listing first, and the queue page only after a press. */
  deferred?: boolean;
  /** A folder queue draws `QueueRows`; a collection draws its own item pane. */
  folder?: boolean;
}

function QueueFixture({
  entries,
  extraQuery = "",
  deferred = false,
  folder = false,
}: QueueFixtureProps): ReactElement {
  installFetch();
  installMedia();
  const [started, setStarted] = useState(!deferred);
  const { fileId } = useSelectedFile();

  useEffect(() => {
    setQueuePage(DRIVE, fileId !== null);
    return () => setQueuePage(DRIVE, false);
  }, [fileId]);

  const rows = useMemo(
    () =>
      entries.map((entry, index) => ({
        id: index + 1,
        position: index,
        file: rowFile(entry),
      })),
    [entries],
  );

  const walk = useMemo(() => queueWalk(entries, fileId), [entries, fileId]);

  const go = useCallback(
    (id: string) => {
      requestPlay(id);
      window.__fixtureNavigate!(
        "/drive/fixture",
        `file=${encodeURIComponent(id)}${extraQuery ? `&${extraQuery}` : ""}`,
      );
    },
    [extraQuery],
  );

  const queuePage = useMemo<QueuePageState>(
    () => ({
      replacesTrail: true,
      name: "Road Trip",
      href: "/drive/fixture/collections/c1",
      prevId: walk.prevId,
      nextId: walk.nextId,
      position: walk.position,
      total: walk.total,
      navigatePrev: () => {
        if (walk.prevId) go(walk.prevId);
      },
      navigateNext: () => {
        if (walk.nextId) go(walk.nextId);
      },
      onEnded: () => {
        if (walk.nextId) go(walk.nextId);
      },
      previousTrack: () => {
        if (walk.prevId) go(walk.prevId);
      },
    }),
    [walk, go],
  );

  const items = (
    <CollectionItemsPane
      items={rows}
      onMoveUp={() => {}}
      onMoveDown={() => {}}
      onRemove={() => {}}
      onSelect={go}
      scrollCurrentIntoView
    />
  );

  const queueRows = (
    <QueueRows entries={entries} currentId={fileId} onSelect={go} />
  );

  const leftPane = fileId ? (
    <QueuePane
      name="Road Trip"
      href="/drive/fixture/collections/c1"
      showPosition
      position={walk.position}
      total={walk.total}
      loop={false}
      onToggleLoop={() => {}}
    >
      {folder ? queueRows : items}
    </QueuePane>
  ) : folder ? (
    queueRows
  ) : (
    items
  );

  return (
    <Providers>
      <AppShell>
        {deferred && !started ? (
          <div className="p-4 text-sm">
            <button type="button" onClick={() => setStarted(true)}>
              Start
            </button>
          </div>
        ) : (
          <div className="h-below-header">
            <QueuePageProvider value={queuePage}>
              <TwoPaneLayout
                drive={DRIVE}
                folderPath=""
                queuePane={fileId !== null}
                leftPane={leftPane}
                leftPaneAriaLabel={fileId ? "Queue" : "Collection items"}
              >
                <div className="p-4 text-sm">
                  <button type="button" onClick={() => go(VIDEO_ID)}>
                    Play
                  </button>
                </div>
              </TwoPaneLayout>
            </QueuePageProvider>
          </div>
        )}
      </AppShell>
    </Providers>
  );
}

const COLLECTION_ENTRIES: QueueEntry[] = [
  entryFrom(NOTE),
  entryFrom(VIDEO),
  entryFrom(LONG),
];

const FOLDER_ENTRIES: QueueEntry[] = [entryFrom(VIDEO), entryFrom(LONG)];

const MANY_ENTRIES: QueueEntry[] = [
  entryFrom(VIDEO),
  ...Array.from({ length: 39 }, (_, index) => ({
    id: `qmany${String(index + 1).padStart(6, "0")}`,
    title: `Queued item ${index + 1}`,
    file_type: "image" as const,
    duration: null,
  })),
];

function openWith(fileId: string, query = ""): void {
  window.__fixtureSearchParams = new URLSearchParams(
    `file=${fileId}${query ? `&${query}` : ""}`,
  );
}

const ARRANGEMENT =
  new URLSearchParams(location.search).get("arrangement") ??
  (location.hash.slice(1) || "");

if (ARRANGEMENT === "queue-page-play") {
  // Nothing is open until Play; the tree setting stays off.
} else if (ARRANGEMENT === "queue-page-note") {
  openWith(NOTE_ID);
} else if (ARRANGEMENT === "queue-page-long") {
  openWith(LONG_ID);
} else if (ARRANGEMENT === "queue-page-video-find") {
  openWith(VIDEO_ID, "find=clip");
} else if (ARRANGEMENT.startsWith("queue-page-")) {
  openWith(VIDEO_ID);
}

export function QueuePageVideoArrangement(): ReactElement {
  return <QueueFixture entries={COLLECTION_ENTRIES} />;
}

export function QueuePageNoteArrangement(): ReactElement {
  return <QueueFixture entries={COLLECTION_ENTRIES} />;
}

export function QueuePageLongArrangement(): ReactElement {
  return <QueueFixture entries={COLLECTION_ENTRIES} />;
}

export function QueuePageVideoFindArrangement(): ReactElement {
  return <QueueFixture entries={COLLECTION_ENTRIES} extraQuery="find=clip" />;
}

export function QueuePageManyArrangement(): ReactElement {
  return <QueueFixture entries={MANY_ENTRIES} />;
}

export function QueuePagePlayArrangement(): ReactElement {
  return <QueueFixture entries={COLLECTION_ENTRIES} />;
}

export function QueuePageOverlayArrangement(): ReactElement {
  return <QueueFixture entries={COLLECTION_ENTRIES} />;
}

export function QueuePageFolderArrangement(): ReactElement {
  return <QueueFixture entries={FOLDER_ENTRIES} folder />;
}

export function QueuePageLateArrangement(): ReactElement {
  return <QueueFixture entries={COLLECTION_ENTRIES} deferred />;
}
