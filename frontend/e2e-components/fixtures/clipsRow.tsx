/**
 * The real Clips row drawn with long titles and excerpts, at the width the
 * `PageFrame` and the browser give it. The rows are the same `NoteRows` the
 * Clips page draws, with the created date the clips sort by.
 */

import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import knowledgeJa from "@/addons/knowledge/messages/ja.json";
import { NoteRows } from "@/addons/knowledge/NoteRow";
import { PageFrame } from "@/components/PageFrame";
import jaMessages from "@/messages-core/ja.json";
import type { FileItem } from "@/types";

const NOW = new Date("2026-03-10T12:00:00");

const JA_TITLE =
  "生成AIと検索が変えた研究ノートの作り方、その長いタイトルが一行に収まらないときの表示についての覚え書き";
const JA_EXCERPT =
  "クリップしたページの本文の冒頭がここに入る。段落はひとつながりに並び、行を折り返さずに切り詰められることを確かめるため、意味のある文章をできるだけ長く続けている。";
const EN_TITLE =
  "A long English headline that will not fit on a single line at either width, written to check truncation";
const EN_EXCERPT =
  "The opening of the clipped page follows here, long enough that the excerpt would wrap onto a second and third line if the row let it, which is exactly what this fixture is for.";

function clip(id: string, title: string, folder: string): FileItem {
  return {
    id,
    filename: `${id}.md`,
    title,
    description: "",
    drive: "fixture",
    folder_path: folder,
    file_type: "document",
    mime_type: "text/markdown",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1024,
    duration: null,
    image_width: null,
    image_height: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "unverified",
    trust_reviewed_at: null,
    created_at: "2026-03-04T10:30:00",
    updated_at: "2026-03-04T10:30:00",
  } as FileItem;
}

const FILES = [
  clip("clip-ja", JA_TITLE, "研究資料/2026/長いフォルダ名"),
  clip("clip-en", EN_TITLE, "Research/2026"),
];

const OPENINGS: Record<string, string> = {
  "clip-ja": JA_EXCERPT,
  "clip-en": EN_EXCERPT,
};

export function ClipsRowArrangement(): ReactElement {
  return (
    <NextIntlClientProvider locale="ja" messages={{ ...jaMessages, ...knowledgeJa }}>
      <PageFrame width="list" header={null}>
        <div id="clips-rows" className="flex flex-col px-4 pb-10">
          <NoteRows files={FILES} now={NOW} openings={OPENINGS} dateField="created_at" />
        </div>
      </PageFrame>
    </NextIntlClientProvider>
  );
}
