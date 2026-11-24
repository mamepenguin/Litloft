/**
 * The real Clips page, for measuring its header and its shelves at whatever
 * width and pointer the browser is given. The requests it makes are answered
 * by `clipsPageResponse`, called from the fixture's fetch stub.
 *
 * The page URL's query picks the case: `q` is the Clips query string
 * (`view=all&group=none&sort=newest`), `locale=ja` picks the Japanese
 * messages, `nick=1` sets a viewer nickname, `hold=covers` or `hold=shelves`
 * holds that answer until `window.__releaseClipCovers()` /
 * `window.__releaseClipShelves()`.
 */

import { useEffect, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import ClipsPage from "@/addons/knowledge/pages/clips";
import knowledgeEn from "@/addons/knowledge/messages/en.json";
import knowledgeJa from "@/addons/knowledge/messages/ja.json";
import { CurrentDriveProvider } from "@/components/CurrentDriveProvider";
import { ProfileProvider, useProfile } from "@/components/ProfileProvider";
import enMessages from "@/messages-core/en.json";
import jaMessages from "@/messages-core/ja.json";

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
    const by = params.get("by");
    if (by === "tag") {
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
    if (by === "folder" || by === "month") {
      const key = params.get("key");
      if (key !== null) {
        return afterShelvesGate(
          json({
            by,
            shelves: [{ key, label: key, count: 6, items: clipFiles(6) }],
            total_shelves: 1,
            base: "",
          }),
        );
      }
      const shelves =
        by === "folder"
          ? [
              { key: "clips/", label: "clips", count: 6, items: clipFiles(6, 1) },
              { key: "", label: "", count: 4, items: clipFiles(4, 7) },
              { key: "research/2026/", label: "2026", count: 4, items: clipFiles(4, 11) },
            ]
          : [
              { key: "2026-03", label: "2026-03", count: 7, items: clipFiles(7, 1) },
              { key: "2026-02", label: "2026-02", count: 7, items: clipFiles(7, 8) },
            ];
      return afterShelvesGate(
        json({ by, shelves, total_shelves: shelves.length, base: "" }),
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
  const ja = query.get("locale") === "ja";
  window.__fixtureSearchParams = new URLSearchParams(query.get("q") ?? "");
  armCoverGate(query.get("hold") === "covers", query.get("hold") === "shelves");
  return (
    <NextIntlClientProvider
      locale={ja ? "ja" : "en"}
      messages={ja ? { ...jaMessages, ...knowledgeJa } : { ...enMessages, ...knowledgeEn }}
    >
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
