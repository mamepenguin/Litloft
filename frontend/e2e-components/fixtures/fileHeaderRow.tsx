/**
 * The real `AppShell` with the real file page in it, against a fake API, and
 * the same shell around a page that is not a file page. The row's place and
 * size can only be measured with both drawn by the components the app mounts.
 */

import { useState, type ReactElement, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import { AddonSlotsProvider } from "@/components/AddonSlotsProvider";
import { AppShell } from "@/components/AppShell";
import { ClipboardProvider } from "@/components/ClipboardProvider";
import { CurrentDriveProvider } from "@/components/CurrentDriveProvider";
import { FileDetailContent } from "@/components/FileDetailContent";
import { FileDetailFullScreen } from "@/components/FileDetailFullScreen";
import { MarkdownDocumentLayout } from "@/components/markdown/MarkdownDocumentLayout";
import { TextLines } from "@/components/TextLines";
import { TwoPaneLayout } from "@/components/folder/TwoPaneLayout";
import { ProfileProvider } from "@/components/ProfileProvider";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { SidebarProvider } from "@/components/SidebarProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { seedFiles } from "@/lib/fileSeed";
import type { FileItem } from "@/types";
import enMessages from "@/messages-core/en.json";

/** The stub router reports `/drive/fixture`, so this is the current drive. */
const DRIVE = "fixture";

export const HEADER_ROW_VIDEO_ID = "hrvideo00001";
export const HEADER_ROW_NOTE_ID = "hrnote000001";
export const HEADER_ROW_LONG_ID = "hrlong000001";
export const HEADER_ROW_ROOT_ID = "hrroot000001";
export const HEADER_ROW_LONG_NOTE_ID = "hrlnote00001";
/** Never seeded and never answered, so its page stays in the loading state. */
export const HEADER_ROW_PENDING_ID = "hrpend000001";

/** 200 characters, with no break opportunity a browser could wrap at. */
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
    ...overrides,
  } as FileItem;
}

const FILES: Record<string, FileItem> = {
  [HEADER_ROW_VIDEO_ID]: fileJson({
    id: HEADER_ROW_VIDEO_ID,
    filename: "holiday.webm",
    title: "holiday.webm",
    folder_path: "Videos/Clips",
  }),
  [HEADER_ROW_NOTE_ID]: fileJson({
    id: HEADER_ROW_NOTE_ID,
    filename: "meeting-notes.md",
    title: "meeting-notes.md",
    folder_path: "Notes",
    file_type: "document",
    mime_type: "text/markdown",
    duration: null,
  }),
  [HEADER_ROW_LONG_ID]: fileJson({
    id: HEADER_ROW_LONG_ID,
    filename: LONG_NAME,
    title: LONG_NAME,
    folder_path: "Videos/Clips",
  }),
};

FILES[HEADER_ROW_ROOT_ID] = fileJson({
  id: HEADER_ROW_ROOT_ID,
  filename: "loose.webm",
  title: "loose.webm",
  folder_path: "",
});

FILES[HEADER_ROW_LONG_NOTE_ID] = fileJson({
  id: HEADER_ROW_LONG_NOTE_ID,
  filename: `${"n".repeat(197)}.md`,
  title: `${"n".repeat(197)}.md`,
  folder_path: "Notes",
  file_type: "document",
  mime_type: "text/markdown",
  duration: null,
});

/**
 * The canonical route finds its open file, and the Inbox walk, through the
 * router; the stub's `useSearchParams` hands back this map, filled in only
 * for the arrangements that are a canonical-route page.
 */
const ROUTE_PARAMS: Record<string, string> = {
  "header-row-two-pane": `file=${HEADER_ROW_VIDEO_ID}`,
  "header-row-inbox-note": `file=${HEADER_ROW_NOTE_ID}&nav=inbox`,
  "header-row-inbox-long": `file=${HEADER_ROW_LONG_NOTE_ID}&nav=inbox`,
};
{
  const query = new URLSearchParams(location.search);
  const id = query.get("arrangement") ?? location.hash.slice(1);
  if (ROUTE_PARAMS[id]) window.__fixtureSearchParams = new URLSearchParams(ROUTE_PARAMS[id]);
}

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
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.split("?")[0];

    if (path.endsWith("/api/addons/status")) {
      // In-file find is offered only when the intelligence addon is installed.
      return Promise.resolve(
        json({ addons: { intelligence: { label: "Intelligence", icon: "sparkles" } }, slots: {} }),
      );
    }
    const fileMatch = path.match(/\/api\/files\/([^/]+)(\/.*)?$/);
    if (fileMatch && decodeURIComponent(fileMatch[1]) === HEADER_ROW_PENDING_ID) {
      return new Promise<Response>(() => {});
    }
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
      if (rest === "/progress") return Promise.resolve(json({ position: 0, duration: 0 }));
      if (rest === "/relations") return Promise.resolve(json({ relations: [] }));
      if (rest === "/comments") return Promise.resolve(json({ comments: [], total: 0 }));
      if (rest === "/chapters") return Promise.resolve(json({ chapters: [] }));
      if (rest === "/neighbors") return Promise.resolve(json({ prev_id: null, next_id: null }));
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (path.includes("/inbox/")) {
      return Promise.resolve(json({ prev_id: "inboxprev001", next_id: "inboxnext001", position: 2, total: 4 }));
    }
    if (path.includes("/addon-policies")) return Promise.resolve(json({ addons: {} }));
    if (path.includes("/file_active_summary/")) {
      return Promise.resolve(json({ has_active_summary: false }));
    }
    if (path.endsWith("/api/drives")) return Promise.resolve(json([]));
    return nativeFetch(input, init);
  };
}

function Shell({ children }: { children: ReactNode }): ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ToastProvider>
        <ProfileProvider>
          <CurrentDriveProvider>
            <AddonSlotsProvider>
              <ClipboardProvider>
                <SidebarProvider>
                  <ShortcutsProvider>
                    <AppShell>{children}</AppShell>
                  </ShortcutsProvider>
                </SidebarProvider>
              </ClipboardProvider>
            </AddonSlotsProvider>
          </CurrentDriveProvider>
        </ProfileProvider>
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

/** A screen that is not a file page: the header's ordinary form. */
export function HeaderRowOrdinaryArrangement(): ReactElement {
  installFetch();
  return (
    <Shell>
      <div data-testid="page-content" className="p-4 text-sm">
        Folder listing
      </div>
    </Shell>
  );
}

function FilePage({ fileId }: { fileId: string }): ReactElement {
  installFetch();
  return (
    <Shell>
      <div data-testid="page-content" className="h-below-header">
        <FileDetailContent fileId={fileId} drive={DRIVE} />
      </div>
    </Shell>
  );
}

export const HeaderRowVideoArrangement = (): ReactElement => (
  <FilePage fileId={HEADER_ROW_VIDEO_ID} />
);
export const HeaderRowNoteArrangement = (): ReactElement => (
  <FilePage fileId={HEADER_ROW_NOTE_ID} />
);
export const HeaderRowLongArrangement = (): ReactElement => (
  <FilePage fileId={HEADER_ROW_LONG_ID} />
);

export const HeaderRowRootArrangement = (): ReactElement => (
  <FilePage fileId={HEADER_ROW_ROOT_ID} />
);
export const HeaderRowPendingArrangement = (): ReactElement => (
  <FilePage fileId={HEADER_ROW_PENDING_ID} />
);

/** The video page, with a control that takes it away inside the same shell. */
export function HeaderRowLeaveArrangement(): ReactElement {
  installFetch();
  const [shown, setShown] = useState(true);
  return (
    <Shell>
      <div data-testid="page-content" className="h-below-header">
        <button type="button" onClick={() => setShown(false)}>
          leave-file-page
        </button>
        {shown ? (
          <FileDetailContent fileId={HEADER_ROW_VIDEO_ID} drive={DRIVE} />
        ) : (
          <p>Folder listing</p>
        )}
      </div>
    </Shell>
  );
}

/**
 * A plain-text document as `ShellLayout` lays it out. Drawn through the layout
 * directly: the file page sends a `.txt` to it only under a build flag the
 * fixture does not set.
 */
export function HeaderRowTextArrangement(): ReactElement {
  installFetch();
  return (
    <Shell>
      <div className="flex h-below-header w-full">
        <MarkdownDocumentLayout
          drive={DRIVE}
          folderPath="Notes"
          title="shopping-list.txt"
          onRename={async () => {}}
          inspector={<div>inspector</div>}
          resetKey="plain-text"
          plainText
        >
          <div className="flex flex-1 flex-col">
            <TextLines text={"milk\neggs\nbread\n"} filename="shopping-list.txt" />
          </div>
        </MarkdownDocumentLayout>
      </div>
    </Shell>
  );
}

/** The canonical route: the folder tree beside the right pane that holds the file. */
function CanonicalRoute(): ReactElement {
  installFetch();
  return (
    <Shell>
      <div className="h-below-header">
        <TwoPaneLayout
          drive={DRIVE}
          folderPath=""
          leftPane={<div className="p-2 text-sm">Tree</div>}
        >
          <div className="p-4 text-sm">Listing</div>
        </TwoPaneLayout>
      </div>
    </Shell>
  );
}

export const HeaderRowTwoPaneArrangement = CanonicalRoute;
export const HeaderRowInboxNoteArrangement = CanonicalRoute;
export const HeaderRowInboxLongArrangement = CanonicalRoute;

/** The collection route (`/files/{id}`). */
export function HeaderRowCollectionArrangement(): ReactElement {
  installFetch();
  return (
    <Shell>
      <FileDetailFullScreen fileId={HEADER_ROW_VIDEO_ID} />
    </Shell>
  );
}
