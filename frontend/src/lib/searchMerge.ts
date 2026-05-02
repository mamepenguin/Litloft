import type {
  FileItem,
  FileItemWithMatch,
  MatchMeta,
  SortField,
  SortOrder,
} from "@/types";

/**
 * Generic semantic-engine hit.
 *
 * Mirrors the wire shape of intelligence's `/search` response so the
 * core can merge results without importing the addon's types directly.
 * Any future semantic provider that produces this shape can plug into
 * the same merge pipeline.
 */
export interface SemanticHit {
  file_id: string;
  drive: string;
  filename: string;
  file_type: string;
  score: number;
  match_types: string[];
  segments: Array<{
    time_range: [number, number] | null;
    matches: Array<{
      type: string;
      score: number;
      page?: number | null;
      text?: string;
    }>;
  }>;
  /** Hydrated FileItem from `/api/internal/files/bulk`; null when unreachable. */
  file: FileItem | null;
}

const FILENAME_BOOST = 2.0;
const CLIP_WEIGHT = 0.8;
const KEYWORD_BOOST = 1.2;

/**
 * Compose a `MatchMeta` from a single semantic engine hit.
 *
 * Multiple segment matches collapse into a single overlay so the card
 * shows one badge per match-type rather than one per segment. Pages
 * are unioned across the hit and sorted ascending.
 */
export function buildMatchMeta(hit: SemanticHit): MatchMeta {
  const meta: MatchMeta = {};
  const pageSet = new Set<number>();
  for (const seg of hit.segments) {
    for (const m of seg.matches) {
      const score = m.score ?? 0;
      if (m.type === "transcript" || m.type === "transcript_keyword") {
        if (seg.time_range && seg.time_range[0] >= 0) {
          (meta.transcript ??= []).push({
            time_range: seg.time_range,
            score,
            text: m.text,
          });
        }
      } else if (m.type === "clip") {
        if (seg.time_range && seg.time_range[0] >= 0) {
          (meta.clip ??= []).push({ time_range: seg.time_range, score });
        }
      } else if (m.type === "clip_thumbnail") {
        // Representative-frame CLIP: 1 vector per file, no timestamp.
        // Spec 2026-05-02-thumbnail-clip-default-shallow-search.md.
        if (!meta.clip_thumbnail || meta.clip_thumbnail.score < score) {
          meta.clip_thumbnail = { score };
        }
      } else if (m.type === "metadata") {
        if (!meta.metadata || meta.metadata.score < score) {
          meta.metadata = { score };
        }
      } else if (m.type === "content") {
        if (!meta.content || meta.content.score < score) {
          meta.content = { score };
        }
      } else if (m.type === "text_content_keyword") {
        if (
          !meta.text_content_keyword ||
          meta.text_content_keyword.score < score
        ) {
          meta.text_content_keyword = { score };
        }
      }
      if (typeof m.page === "number") pageSet.add(m.page);
    }
  }
  if (pageSet.size > 0) {
    meta.matched_pages = [...pageSet].sort((a, b) => a - b);
  }
  return meta;
}

/**
 * Hybrid relevance score. Higher = better. Initial weights — see spec
 * `2026-05-02-search-results-unification-phase3.md` §B; tuning is a
 * separate eval-driven workstream.
 */
export function computeHybridScore(meta: MatchMeta): number {
  let score = 0;
  if (meta.filename) score += meta.filename.score * FILENAME_BOOST;
  if (meta.metadata) score += meta.metadata.score;
  if (meta.transcript && meta.transcript.length > 0) {
    score += Math.max(...meta.transcript.map((s) => s.score));
  }
  if (meta.clip && meta.clip.length > 0) {
    score += Math.max(...meta.clip.map((s) => s.score)) * CLIP_WEIGHT;
  }
  if (meta.clip_thumbnail) {
    // Thumbnail CLIP carries the same per-file weight as scene CLIP;
    // the addon already differentiates the two via separate
    // ``rrf_weight_clip*`` knobs (spec
    // 2026-05-02-thumbnail-clip-default-shallow-search.md), so the
    // hybrid layer just rebroadcasts the score with the shared
    // visual-channel weight.
    score += meta.clip_thumbnail.score * CLIP_WEIGHT;
  }
  if (meta.content) score += meta.content.score;
  if (meta.text_content_keyword) {
    score += meta.text_content_keyword.score * KEYWORD_BOOST;
  }
  return score;
}

/**
 * Build a minimal FileItem from a SemanticHit when core's bulk hydrate
 * failed (`hit.file === null`). The card stays functional with reduced
 * fidelity — favorite toggle and tag display are unavailable, but
 * title, thumbnail, and click-through still work.
 */
function fileItemFromHit(hit: SemanticHit): FileItem {
  if (hit.file) return hit.file;
  return {
    id: hit.file_id,
    filename: hit.filename,
    title: hit.filename,
    description: "",
    drive: hit.drive,
    folder_path: "",
    file_type: hit.file_type as FileItem["file_type"],
    mime_type: "",
    thumbnail_url: `/api/files/${hit.file_id}/thumbnail`,
    has_thumbnail: true,
    file_size: 0,
    duration: null,
    likes: 0,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    created_at: "",
    updated_at: "",
  };
}

export interface MergeResultsParams {
  filenameMatches: FileItem[];
  semanticHits: SemanticHit[];
  /** Server-reported total of the filename-match query. */
  filenameTotal: number;
}

export interface MergeResultsValue {
  files: FileItemWithMatch[];
  /** Total estimate (filename total + semantic-only count). */
  total: number;
}

/**
 * Merge filename-match and semantic-engine results into a single list.
 *
 * Dedup is by `file_id` — when both engines hit the same file the
 * card keeps the canonical filename FileItem and overlays the semantic
 * `match_meta`, so the badge row shows both sources. Filename-only
 * files keep `match_meta.filename`; semantic-only files inherit a
 * minimal FileItem from the engine hit when bulk hydrate failed.
 */
export function mergeResults({
  filenameMatches,
  semanticHits,
  filenameTotal,
}: MergeResultsParams): MergeResultsValue {
  const byId = new Map<string, FileItemWithMatch>();
  const filenameIds = new Set<string>();

  for (const f of filenameMatches) {
    filenameIds.add(f.id);
    byId.set(f.id, {
      ...f,
      match_meta: { filename: { score: 1 } },
    });
  }

  for (const hit of semanticHits) {
    const semanticMeta = buildMatchMeta(hit);
    const existing = byId.get(hit.file_id);
    if (existing) {
      existing.match_meta = { ...existing.match_meta, ...semanticMeta };
    } else {
      byId.set(hit.file_id, {
        ...fileItemFromHit(hit),
        match_meta: semanticMeta,
      });
    }
  }

  const files: FileItemWithMatch[] = [];
  for (const f of byId.values()) {
    f.match_score = f.match_meta ? computeHybridScore(f.match_meta) : 0;
    files.push(f);
  }

  let semanticOnlyCount = 0;
  for (const h of semanticHits) {
    if (!filenameIds.has(h.file_id)) semanticOnlyCount += 1;
  }

  return { files, total: filenameTotal + semanticOnlyCount };
}

/**
 * Sort a merged list in place-safe order. The merge keeps filename
 * matches in their server-returned order; semantic-only files are
 * appended. Client-side sort is needed because the two sources can't
 * be combined server-side.
 */
export function sortMerged(
  files: FileItemWithMatch[],
  sort: SortField,
  order: SortOrder,
): FileItemWithMatch[] {
  const sorted = [...files];
  const dir = order === "asc" ? 1 : -1;
  switch (sort) {
    case "relevance":
      return sorted.sort(
        (a, b) => (b.match_score ?? 0) - (a.match_score ?? 0),
      );
    case "created_at":
      return sorted.sort(
        (a, b) =>
          dir *
          (new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()),
      );
    case "title":
      return sorted.sort((a, b) => dir * a.title.localeCompare(b.title));
    case "file_size":
      return sorted.sort((a, b) => dir * (a.file_size - b.file_size));
    case "likes":
      return sorted.sort((a, b) => dir * (a.likes - b.likes));
    case "random":
      return sorted;
    default:
      return sorted;
  }
}
