/**
 * The real `AppShell` (sidebar, header, menu and tree buttons) around the real
 * file pages, on a stub router a case can move. The URL a page starts on is
 * given in the fixture's own query: `path` and `query`.
 */

import { useState, type ReactElement, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";

import { AddonSlotsProvider } from "@/components/AddonSlotsProvider";
import { AppShell } from "@/components/AppShell";
import { ClipboardProvider } from "@/components/ClipboardProvider";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CurrentDriveProvider } from "@/components/CurrentDriveProvider";
import { DriveUnavailable } from "@/components/DriveUnavailable";
import { FileDetailFullScreen } from "@/components/FileDetailFullScreen";
import { ProfileProvider } from "@/components/ProfileProvider";
import { RenameDialog } from "@/components/RenameDialog";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { SidebarProvider } from "@/components/SidebarProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { TwoPaneLayout } from "@/components/folder/TwoPaneLayout";
import enMessages from "@/messages-core/en.json";
import jaMessages from "@/messages-core/ja.json";

import intelligenceEn from "../../src/addons/intelligence/messages/en.json";
import intelligenceJa from "../../src/addons/intelligence/messages/ja.json";

import { deepMerge, installFetch, installMedia, type Messages } from "./inspectorResponsive";

const DRIVE = "fixture";

/** Answered with 404, so its page lands in the error state. */
export const FOCUS_MISSING_ID = "focusmiss001";
/** Never answered, so its page stays in the loading state. */
export const FOCUS_PENDING_ID = "focuspend001";

const FIXTURE_QUERY = new URLSearchParams(location.search);
const ARRANGEMENT = FIXTURE_QUERY.get("arrangement") ?? location.hash.slice(1);
const LOCALE = FIXTURE_QUERY.get("locale") === "ja" ? "ja" : "en";

/** With `docside=1` the `document-side` entries take their labels from the add-on's messages. */
function shellMessages(): typeof enMessages {
  const core = LOCALE === "ja" ? jaMessages : enMessages;
  if (FIXTURE_QUERY.get("docside") !== "1") return core;
  const addon = LOCALE === "ja" ? intelligenceJa : intelligenceEn;
  return deepMerge(core as unknown as Messages, addon as unknown as Messages) as unknown as typeof enMessages;
}

if (ARRANGEMENT.startsWith("focus-")) {
  window.__fixturePathname = FIXTURE_QUERY.get("path") ?? `/drive/${DRIVE}`;
  window.__fixtureSearchParams = new URLSearchParams(FIXTURE_QUERY.get("query") ?? "");
}

let missingInstalled = false;

function installMissing(): void {
  if (missingInstalled) return;
  missingInstalled = true;
  const inner = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.split("?")[0];
    if (path.includes(`/api/files/${FOCUS_PENDING_ID}`)) {
      return new Promise<Response>(() => {});
    }
    if (path.includes(`/api/files/${FOCUS_MISSING_ID}`)) {
      return Promise.resolve(
        new Response(JSON.stringify({ detail: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (path.endsWith("/api/drives")) {
      return Promise.resolve(
        new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    }
    return inner(input, init);
  };
}

function install(): void {
  installFetch();
  installMedia();
  installMissing();
}

type DialogKind = "confirm" | "rename" | null;

declare global {
  interface Window {
    __fixtureOpenDialog?: (kind: DialogKind) => void;
  }
}

/** The page's own dialogs, opened by a case through `__fixtureOpenDialog`. */
function Dialogs(): ReactElement {
  const [kind, setKind] = useState<DialogKind>(null);
  window.__fixtureOpenDialog = setKind;
  return (
    <>
      <ConfirmDialog
        open={kind === "confirm"}
        title="Move to Trash"
        message="Move this file to trash?"
        confirmLabel="Confirm"
        onConfirm={() => setKind(null)}
        onCancel={() => setKind(null)}
      />
      <RenameDialog
        open={kind === "rename"}
        currentName="clip.webm"
        onRename={async () => setKind(null)}
        onCancel={() => setKind(null)}
      />
    </>
  );
}

function Shell({ children }: { children: ReactNode }): ReactElement {
  return (
    <NextIntlClientProvider locale={LOCALE} messages={shellMessages()}>
      <ToastProvider>
        <ProfileProvider>
          <CurrentDriveProvider>
            <AddonSlotsProvider>
              <ClipboardProvider>
                <SidebarProvider>
                  <ShortcutsProvider>
                    <AppShell>
                      {children}
                      <Dialogs />
                    </AppShell>
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

/** A tree tall enough to scroll, so its box and its scroll are both measurable. */
function TreeStub(): ReactElement {
  return (
    <div data-testid="fixture-tree" className="p-2 text-sm">
      {Array.from({ length: 60 }, (_, i) => (
        <div key={i}>Folder {i + 1}</div>
      ))}
    </div>
  );
}

/**
 * A `/drive/{drive}/…` route: the folder tree beside the right pane. With
 * `?file=` in the query the right pane is the file page; without, the listing.
 */
function DriveRoute(): ReactElement {
  install();
  return (
    <Shell>
      <div data-testid="page-content" className="h-below-header">
        <TwoPaneLayout drive={DRIVE} folderPath="" leftPane={<TreeStub />}>
          <div data-testid="fixture-listing" className="p-4 text-sm">
            Listing
          </div>
        </TwoPaneLayout>
      </div>
    </Shell>
  );
}

/**
 * A `/drive/{drive}/…` route whose drive is unavailable, on a URL that still
 * names a file: the screen replaces the file page under it.
 */
function UnavailableRoute(): ReactElement {
  install();
  return (
    <Shell>
      <DriveUnavailable drive={DRIVE} />
    </Shell>
  );
}

/** `/files/{id}`: the id is read from the stub router's pathname. */
function FilesRoute(): ReactElement {
  install();
  const pathname = usePathname();
  useSearchParams();
  const match = pathname.match(/^\/files\/([^/]+)/);
  return (
    <Shell>
      {match ? (
        <FileDetailFullScreen fileId={decodeURIComponent(match[1])} />
      ) : (
        <div data-testid="fixture-listing" className="p-4 text-sm">
          Listing
        </div>
      )}
    </Shell>
  );
}

export const FOCUS_MODE_ARRANGEMENTS: Record<string, () => ReactElement> = {
  "focus-drive": DriveRoute,
  "focus-files": FilesRoute,
  "focus-unavailable": UnavailableRoute,
};
