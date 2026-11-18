/**
 * The data the Clips fixtures answer with, so the real page and cards draw
 * as they would against a server. The covers answer can be held back, to
 * measure a card before and after its picture arrives.
 */

declare global {
  interface Window {
    __releaseClipCovers?: () => void;
    __releaseClipShelves?: () => void;
  }
}

const TITLES = [
  "A very long headline about how a household archive keeps its web clippings readable years later, written to run past two lines",
  "生成AIと検索が変えた研究ノートの作り方、その長いタイトルが二行に収まらないときの表示についての覚え書き",
  "Short title",
  "Reading the changelog nobody reads: eleven releases of a build tool in one sitting and what they changed",
  "Notes",
  "How a small library handles time zones",
  "日本語のタイトル",
  "Why the second draft of a clipped article is usually better than the first one you saved",
  "Weekend project: a bookshelf made from reclaimed oak with hidden joinery and no screws at all",
  "Quarterly review",
  "The history of the index card as a thinking tool, and why it still beats most software for short notes",
  "Recipes",
  "A guide to reading datasheets without losing the afternoon",
  "Archive formats compared by how they fail",
];

export const CLIP_COUNT = TITLES.length;

export function clipFile(index: number) {
  return {
    id: `clip-${index}`,
    filename: `clip-${index}.md`,
    title: TITLES[index - 1],
    description: "",
    drive: "fixture",
    folder_path: "",
    file_type: "text",
    mime_type: "text/markdown",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1500 * (index + 1),
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
  };
}

export function clipFiles(count: number, from = 1) {
  return Array.from({ length: Math.min(count, CLIP_COUNT - from + 1) }, (_, i) => clipFile(from + i));
}

export function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const COVER_SVG = (hue: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="160"><rect width="40" height="160" fill="hsl(${hue},60%,60%)"/></svg>`,
  )}`;

let covers: Promise<void> = Promise.resolve();
let shelves: Promise<void> = Promise.resolve();

/**
 * Holds the covers answer until `window.__releaseClipCovers()`, and the
 * shelves answers until `window.__releaseClipShelves()`, when the URL asks.
 */
export function armCoverGate(heldCovers: boolean, heldShelves = false): void {
  covers = heldCovers
    ? new Promise<void>((resolve) => {
        window.__releaseClipCovers = resolve;
      })
    : Promise.resolve();
  shelves = heldShelves
    ? new Promise<void>((resolve) => {
        window.__releaseClipShelves = resolve;
      })
    : Promise.resolve();
}

export function afterShelvesGate<T>(answer: T): Promise<T> {
  return shelves.then(() => answer);
}

export async function clipCoversResponse(body: BodyInit | null | undefined): Promise<Response> {
  const ids = (JSON.parse(String(body ?? "{}")) as { file_ids?: string[] }).file_ids ?? [];
  await covers;
  const answer: Record<string, { image_id: null; image_url: string | null; site: string | null }> = {};
  ids.forEach((id, i) => {
    answer[id] = {
      image_id: null,
      image_url: i % 2 === 0 ? COVER_SVG(i * 40) : null,
      site: `site-${i}.example`,
    };
  });
  return json({ covers: answer });
}
