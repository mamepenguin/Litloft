/**
 * The real Clips page, for measuring its header and its shelves at whatever
 * width and pointer the browser is given. The requests it makes are answered
 * by `clipsPageResponse`, called from the fixture's fetch stub.
 *
 * The page URL's query picks the case: `q` is the Clips query string
 * (`view=all&group=none`), `nick=1` sets a viewer nickname, `hold=covers` or
 * `hold=shelves` holds that answer until `window.__releaseClipCovers()` /
 * `window.__releaseClipShelves()`.
 */

import { useEffect, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import ClipsPage from "@/addons/knowledge/pages/clips";
import knowledgeEn from "@/addons/knowledge/messages/en.json";
import { CurrentDriveProvider } from "@/components/CurrentDriveProvider";
import { ProfileProvider, useProfile } from "@/components/ProfileProvider";
import enMessages from "@/messages-core/en.json";

import { CLIP_COUNT, afterShelvesGate, armCoverGate, clipCoversResponse, clipFiles, json } from "./clipsData";

const HASH = "clips-page";

/** `null` when the request is none of the Clips page's. */
export function clipsPageResponse(url: string, init?: RequestInit): Promise<Response> | null {
  if (!window.location.hash.includes(HASH)) return null;
  const parsed = new URL(url, window.location.href);
  const path = parsed.pathname;
  const params = parsed.searchParams;
  const method = (init?.method ?? "GET").toUpperCase();

  if (path.endsWith("/api/addons/knowledge/clip-covers") && method === "POST") {
    return clipCoversResponse(init?.body);
  }
  if (path.endsWith("/api/drives/fixture/files")) {
    return Promise.resolve(json({ data: [], meta: { total: CLIP_COUNT, page: 1, limit: 1 } }));
  }
  if (path.endsWith("/api/drives/fixture/watch-history")) {
    return Promise.resolve(json({ data: clipFiles(3, 5) }));
  }
  if (path.endsWith("/api/drives/fixture/shelves")) {
    if (params.get("by") === "tag") {
      const shelf = (key: string, label: string, from: number) => ({
        key,
        label,
        count: 12,
        items: clipFiles(12, from),
      });
      return afterShelvesGate(
        json({
          by: "tag",
          shelves: [shelf("research", "research", 1), shelf("no_tag", "", 2)],
          total_shelves: 2,
          base: "",
        }),
      );
    }
    const asked = params.getAll("ids");
    const items =
      asked.length > 0
        ? clipFiles(CLIP_COUNT).filter((file) => asked.includes(file.id))
        : params.get("trust") === "unverified"
          ? clipFiles(5)
          : params.get("page") !== null
            ? clipFiles(CLIP_COUNT)
            : clipFiles(12);
    return afterShelvesGate(
      json({
        by: "all",
        shelves: [{ key: "all", label: "", count: items.length, items }],
        total_shelves: 1,
        base: "",
      }),
    );
  }
  return null;
}

function Nickname({ name }: { name: string }): null {
  const { setNickname } = useProfile();
  useEffect(() => setNickname(name), [setNickname, name]);
  return null;
}

export function ClipsPageArrangement(): ReactElement {
  const query = new URLSearchParams(window.location.search);
  window.__fixtureSearchParams = new URLSearchParams(query.get("q") ?? "");
  armCoverGate(query.get("hold") === "covers", query.get("hold") === "shelves");
  return (
    <NextIntlClientProvider locale="en" messages={{ ...enMessages, ...knowledgeEn }}>
      <ProfileProvider>
        {query.get("nick") === "1" && <Nickname name="viewer" />}
        <CurrentDriveProvider>
          <div id="clips-page-host" className="flex min-h-screen flex-col bg-bg-primary">
            <ClipsPage />
          </div>
        </CurrentDriveProvider>
      </ProfileProvider>
    </NextIntlClientProvider>
  );
}
