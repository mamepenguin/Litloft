/**
 * The real Notes Library inside the page frame the Notes page draws it in,
 * for measuring its layout at whatever width and locale the browser is given.
 * The requests it makes are answered by `notesLibraryResponse`, called from
 * the fixture's fetch stub.
 */

import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import NotesLibrary from "@/addons/knowledge/library/NotesLibrary";
import knowledgeEn from "@/addons/knowledge/messages/en.json";
import knowledgeJa from "@/addons/knowledge/messages/ja.json";
import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";
import enMessages from "@/messages-core/en.json";
import jaMessages from "@/messages-core/ja.json";

const NOTE_COUNT = 12;
const SHOWN_NOTE = "note-1";

function note(index: number) {
  return {
    id: `note-${index}`,
    filename: `note-${index}.md`,
    title: `ノート ${index}`,
    description: "",
    drive: "fixture",
    folder_path: index % 2 === 0 ? "研究資料" : "Research",
    file_type: "text",
    mime_type: "text/markdown",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 120,
    duration: null,
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
    created_at: "2026-03-01T09:00:00",
    updated_at: "2026-03-09T09:00:00",
    modified_at: null,
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** `null` when the request is none of the Library's. */
export function notesLibraryResponse(url: string): Response | null {
  if (!window.location.hash.includes("notes-library")) return null;
  if (/\/api\/drives\/fixture\/files(\?|$)/.test(url) && url.includes("exclude_origin=webclip")) {
    const data = Array.from({ length: NOTE_COUNT }, (_, i) => note(i + 1));
    return json({ data, meta: { total: NOTE_COUNT, page: 1, limit: 60 } });
  }
  const file = /\/api\/files\/(note-\d+)(\/[a-z]+)?(\?.*)?$/.exec(url);
  if (file === null) return null;
  const index = Number(file[1].slice("note-".length));
  if (file[2] === "/stream") {
    return new Response(`# ノート ${index}\n\n本文の最初の段落です。`, {
      status: 200,
      headers: { "Content-Type": "text/markdown" },
    });
  }
  if (file[2] === "/relations") return json({ relations: [] });
  if (file[2] === undefined) return json(note(index));
  return null;
}

export function NotesLibraryArrangement(): ReactElement {
  const query = new URLSearchParams(window.location.search);
  const ja = query.get("locale") !== "en";
  window.__fixtureSearchParams = new URLSearchParams(`view=all&sort=updated&note=${SHOWN_NOTE}`);
  return (
    <NextIntlClientProvider
      locale={ja ? "ja" : "en"}
      messages={ja ? { ...jaMessages, ...knowledgeJa } : { ...enMessages, ...knowledgeEn }}
    >
      <PageFrame width="wide" header={<PageHeader title="ノート" />}>
        <div id="notes-app-panel" className="px-4 pb-10 pt-6">
          <NotesLibrary
            drive="fixture"
            target={{ status: "ready", key: "default", params: null, fileIds: null }}
            total={NOTE_COUNT}
          />
        </div>
      </PageFrame>
    </NextIntlClientProvider>
  );
}
