/**
 * The real Video and Reading Library faces at a folder position (`pos`, or the top
 * when absent), with child folders under it unless `leaf` is set. `app` picks the face.
 */

import { useEffect, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages-core/en.json";
import { LibraryFace as VideoLibraryFace } from "@/components/videoapp/LibraryFace";
import { LibraryFace as ReadingLibraryFace } from "@/components/readingapp/LibraryFace";
import { appRequests } from "@/lib/memberTarget";

const DRIVE = "fixture";

const json = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
  );

function installFetch(leaf: boolean): void {
  window.fetch = (input: RequestInfo | URL) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://fixture.invalid");
    const q = url.searchParams;
    if (url.pathname.includes("/tag-counts")) return json([]);
    if (url.pathname.endsWith("/files")) return json({ data: [], meta: { total: 0, page: 1, limit: 1 } });
    if (!url.pathname.endsWith("/shelves")) return json([]);
    const by = q.get("by") ?? "all";
    const base = q.get("folder") ?? "";
    if (by === "folder" && q.get("shelf_limit") === "24") {
      const names = leaf ? [] : ["Lectures", "Mathematics", "Physics", "Chemistry", "Statistics"];
      const shelves = names.map((name) => {
        const key = base === "" ? name : `${base}/${name}`;
        return { key, label: name, count: 12, items: [] };
      });
      return json({ by, base, total_shelves: shelves.length, shelves });
    }
    return json({ by, base, total_shelves: 0, shelves: [] });
  };
}

const noop = () => {};

export function FolderRowsArrangement(): ReactElement {
  const q = new URLSearchParams(location.search);
  const app = q.get("app") ?? "video";
  const position = q.get("pos");
  installFetch(q.has("leaf"));

  useEffect(() => {
    document.body.dataset.harness = "ready";
  }, []);

  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <div className="bg-bg-primary px-4">
        {app === "video" ? (
          <VideoLibraryFace
            drive={DRIVE}
            params={{ type: ["video"] }}
            requests={appRequests(null, null)}
            empty={false}
            group="folder"
            hasProfile
            position={position}
            sortId="newest"
            onGroup={noop}
            onSort={noop}
            onViewerRejected={noop}
          />
        ) : (
          <ReadingLibraryFace
            drive={DRIVE}
            params={{ type: ["pdf", "epub", "archive"] }}
            requests={appRequests(null, null)}
            empty={false}
            hasProfile
            group="none"
            position={position}
            sortId="newest"
            onGroup={noop}
            onSort={noop}
            onViewerRejected={noop}
          />
        )}
      </div>
    </NextIntlClientProvider>
  );
}
