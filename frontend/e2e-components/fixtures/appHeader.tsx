/**
 * The real Video and Reading apps and their shelf pages, each drawing its app header.
 * `page` picks the page; `drive` names the drive; `key` names a shelf page's shelf, which
 * is its title; `target=long` makes a smart folder with a long name the saved target;
 * `locale` picks the messages.
 */

import { useEffect, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages-core/en.json";
import jaMessages from "@/messages-core/ja.json";
import { VideoApp } from "@/components/videoapp/VideoApp";
import { ReadingApp } from "@/components/readingapp/ReadingApp";
import { VideoShelfPage } from "@/components/videoapp/VideoShelfPage";
import { ReadingShelfPage } from "@/components/readingapp/ReadingShelfPage";
import { writeAppPrefs } from "@/lib/appPrefs";

const APP_HEADER_COUNT = 1234;
const LONG_FOLDER_NAME = "Every holiday film we recorded in the summer of 2019";

const LONG_FOLDER_ID = "sf-long";

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );

function longFolder(drive: string) {
  return {
    id: LONG_FOLDER_ID,
    drive,
    name: LONG_FOLDER_NAME,
    query: "tag:holiday",
    file_type: null,
    sort_by: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  };
}

let installed = false;

function install(drive: string, page: string, longTarget: boolean): void {
  if (installed) return;
  installed = true;
  if (longTarget) {
    const app = page.startsWith("reading") ? "reading" : "video";
    writeAppPrefs(drive, { target: LONG_FOLDER_ID }, app);
  }
  window.fetch = (input: RequestInfo | URL) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://fixture.invalid");
    if (url.pathname.endsWith("/smart-folders")) return json(longTarget ? [longFolder(drive)] : []);
    if (url.pathname.endsWith("/files")) {
      return json({ data: [], meta: { total: APP_HEADER_COUNT, page: 1, limit: 1 } });
    }
    if (url.pathname.endsWith("/shelves")) {
      return json({ by: url.searchParams.get("by") ?? "", base: "", total_shelves: 0, shelves: [] });
    }
    return json({ detail: "not in the fixture" }, 404);
  };
}

function Page({ page, drive, shelf }: { page: string; drive: string; shelf: string | null }): ReactElement {
  switch (page) {
    case "video":
      return <VideoApp drive={drive} />;
    case "reading":
      return <ReadingApp drive={drive} />;
    case "video-shelf":
      return <VideoShelfPage drive={drive} by="folder" shelfKey={shelf ?? "Movies"} />;
    case "reading-shelf":
      return (
        <ReadingShelfPage
          drive={drive}
          by="folder"
          shelfKey={shelf ?? "Books"}
          initialSort={null}
          folders={[]}
          tags={[]}
          watch={null}
          from={null}
        />
      );
    default:
      throw new Error(`no page named ${page}`);
  }
}

export function AppHeaderArrangement(): ReactElement {
  const q = new URLSearchParams(location.search);
  const page = q.get("page") ?? "video";
  const drive = q.get("drive") ?? "fixture";
  const locale = q.get("locale") === "ja" ? "ja" : "en";
  install(drive, page, q.get("target") === "long");

  useEffect(() => {
    document.body.dataset.harness = "ready";
  }, []);

  return (
    <NextIntlClientProvider locale={locale} messages={locale === "ja" ? jaMessages : enMessages}>
      <div id="app-header-host" className="bg-bg-primary">
        <Page page={page} drive={drive} shelf={q.get("key")} />
      </div>
      <div aria-hidden className="pointer-events-none fixed left-0 top-0 h-0 w-0 overflow-hidden">
        <span id="probe-elevated" className="bg-bg-elevated" />
        <span id="probe-muted" className="text-text-muted" />
      </div>
    </NextIntlClientProvider>
  );
}
