/**
 * The real video and reading faces and the real See all page inside a host of the width
 * `w` names (the viewport's when absent). `face` picks the surface; `first=hold` keeps the
 * See all page's first page pending; `later` answers every later page: `hold` never
 * answers, `fail` answers 500, `none` offers no later page, `ok` answers it.
 */

import { useEffect, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages-core/en.json";
import { DiscoverFace as VideoDiscoverFace } from "@/components/videoapp/DiscoverFace";
import { LibraryFace as VideoLibraryFace } from "@/components/videoapp/LibraryFace";
import { VideoShelfPage } from "@/components/videoapp/VideoShelfPage";
import { DiscoverFace as ReadingDiscoverFace } from "@/components/readingapp/DiscoverFace";
import { LibraryFace as ReadingLibraryFace } from "@/components/readingapp/LibraryFace";
import type { ShelfItem } from "@/lib/api";
import { SEE_ALL_FIRST_PAGE, SEE_ALL_TOTAL, bylineOf, titleOf } from "../videoCardSpacing.data";

const DRIVE = "fixture";

declare global {
  interface Window {
    __vcsLaterRequests: string[];
  }
}

function item(id: string, kind: "video" | "book"): ShelfItem {
  const book = kind === "book";
  return {
    id,
    filename: book ? `${id}.pdf` : `${id}.mp4`,
    title: titleOf(id),
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: book ? "pdf" : "video",
    mime_type: book ? "application/pdf" : "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1024,
    duration: book ? null : 60,
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
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-01-01T00:00:00",
  } as unknown as ShelfItem;
}

const items = (prefix: string, count: number, kind: "video" | "book" = "video") =>
  Array.from({ length: count }, (_, i) => item(`${prefix}${i}`, kind));

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );

const never = () => new Promise<Response>(() => {});

const SHELVES_PER_LIBRARY_PAGE = 12;

function groupedShelves(by: string, later: boolean, kind: "video" | "book", total: number) {
  const start = later ? SHELVES_PER_LIBRARY_PAGE : 0;
  const count = Math.max(0, Math.min(SHELVES_PER_LIBRARY_PAGE, total - start));
  return {
    by,
    base: "",
    total_shelves: total,
    shelves: Array.from({ length: count }, (_, i) => {
      const n = start + i;
      return { key: `Group ${n}`, label: `Group ${n}`, count: 9, items: items(`g${n}-`, 5, kind) };
    }),
  };
}

let installed = false;

function installFetch(face: string, first: string, later: string): void {
  if (installed) return;
  installed = true;
  window.__vcsLaterRequests = [];
  const kind = face.startsWith("reading") ? "book" : "video";
  window.fetch = (input: RequestInfo | URL) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://fixture.invalid");
    const q = url.searchParams;

    if (url.pathname.endsWith("/smart-folders")) return json([]);
    if (url.pathname.endsWith("/files")) {
      return json({ data: [], meta: { total: SEE_ALL_TOTAL, page: 1, limit: 1 } });
    }
    if (!url.pathname.endsWith("/shelves")) return json({ detail: "not in the fixture" }, 404);

    const by = q.get("by") ?? "";
    const isLater = Number(q.get("page") ?? 1) > 1 || Number(q.get("offset") ?? 0) > 0;
    if (isLater) {
      window.__vcsLaterRequests.push(raw);
      if (later === "hold") return never();
      if (later === "fail") return json({ detail: "down" }, 500);
    } else if (first === "hold" && face === "see-all") {
      return never();
    }

    if (face === "see-all") {
      const page = Number(q.get("page") ?? 1);
      const size = page === 1 ? SEE_ALL_FIRST_PAGE : SEE_ALL_TOTAL - SEE_ALL_FIRST_PAGE;
      return json({
        by,
        base: "",
        total_shelves: 1,
        shelves: [{ key: q.get("key") ?? "", label: q.get("key") ?? "", count: SEE_ALL_TOTAL, items: items(`p${page}-`, size) }],
      });
    }
    if (face === "reading-library" && by === "folder") {
      return json({ by, base: "", total_shelves: 0, shelves: [] });
    }
    const total = later === "none" ? 3 : SHELVES_PER_LIBRARY_PAGE * 2;
    return json(groupedShelves(by, isLater, kind, total));
  };
}

const noop = () => {};

function Face({ face }: { face: string }): ReactElement {
  switch (face) {
    case "video-discover":
      return (
        <VideoDiscoverFace
          drive={DRIVE}
          empty={false}
          hasProfile
          pending
          shelves={[
            { id: "continue", title: "Continue", state: { status: "loaded", items: items("c", 8) }, retry: noop },
            {
              id: "subs",
              title: "Subscriptions",
              href: "/drive/fixture/apps/video/shelf?entry=subs",
              state: { status: "loaded", items: items("s", 8) },
              bylines: new Map(items("s", 8).map((v) => [v.id, bylineOf(v.id)])),
              retry: noop,
            },
            { id: "recent", title: "Recently added", state: { status: "loading" }, retry: noop },
          ]}
        />
      );
    case "video-library":
      return (
        <VideoLibraryFace
          drive={DRIVE}
          params={{ type: ["video"] }}
          empty={false}
          savedClassification="folder"
          hasProfile
          sortId="newest"
          onClassification={noop}
          onSort={noop}
          onViewerRejected={noop}
        />
      );
    case "reading-discover": {
      const loaded = (prefix: string) => ({
        state: { status: "loaded" as const, data: items(prefix, 8, "book") },
        retry: noop,
      });
      return (
        <ReadingDiscoverFace
          drive={DRIVE}
          empty={false}
          hasProfile
          continueShelf={loaded("rc")}
          notRead={loaded("rn")}
          fresh={{ state: { status: "failed" }, retry: noop }}
        />
      );
    }
    case "reading-library":
      return (
        <ReadingLibraryFace
          drive={DRIVE}
          params={{ type: ["pdf", "epub", "archive"] }}
          empty={false}
          hasProfile
          group="tag"
          sortId="newest"
          onGroup={noop}
          onSort={noop}
          onViewerRejected={noop}
        />
      );
    case "see-all":
      return <VideoShelfPage drive={DRIVE} by="folder" shelfKey="Movies" />;
    default:
      throw new Error(`no face named ${face}`);
  }
}

export function VideoCardSpacingArrangement(): ReactElement {
  const q = new URLSearchParams(location.search);
  const face = q.get("face") ?? "video-discover";
  const width = q.get("w");
  installFetch(face, q.get("first") ?? "ok", q.get("later") ?? "hold");

  useEffect(() => {
    document.body.dataset.harness = "ready";
  }, []);

  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <div id="video-card-spacing-host" className="bg-bg-primary" style={width ? { width: Number(width) } : undefined}>
        <Face face={face} />
      </div>
    </NextIntlClientProvider>
  );
}
