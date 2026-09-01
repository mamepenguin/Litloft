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
// Folder-path substring matches are noisier than filename hits ("/Music/"
// matching every file under it on the query "music"), so they ride at a
// deliberately low weight — surfaces the file in the list but keeps it
// out of the top ranks unless another channel also fires. Spec
// `2026-05-02-search-path-match.md` §D2.
const PATH_WEIGHT = 0.3;
// SIRA-style LLM-expanded retrieval keywords: contributes to the
// hybrid score but at a discount because the hit is tier-3 (LLM
// guess at what a user would search for). A genuine text/transcript
// hit on the same file outranks an expansion-only hit; a same-file
// stack of text + expansion outranks either alone. Spec
// docs/superpowers/specs/2026-05-14-sira-retrieval-keywords.md.
const RETRIEVAL_KEYWORDS_WEIGHT = 0.8;

/**
 * Compose a `MatchMeta` from a single semantic engine hit.
 *
 * Backend `seg.matches[].type` is the raw embedding/match label from
 * intelligence (`whisper`, `text_content`, `metadata`, `clip`,
 * `clip_thumbnail`, plus `transcript` from the keyword path that
 * already aliases whisper). UI collapses to four buckets so a single
 * card never shows "audio" + "audio keyword" as two badges:
 *   audio-class      → meta.transcript    (whisper / transcript / transcript_keyword)
 *   text-class       → meta.content       (text_content / content / text_content_keyword)
 *   metadata-class   → meta.metadata
 *   visual-class     → meta.clip / meta.clip_thumbnail (kept distinct;
 *                      the scene-search toggle drives them differently)
 *
 * `hit.match_types` is the authoritative top-level summary the addon
 * publishes — we fall back to it so a hit that only has a `keyword`
 * (filename-keyword) channel without per-segment MatchInfo still
 * surfaces the right badge instead of an empty overlay.
 */
const AUDIO_TYPES = new Set(["transcript", "transcript_keyword", "whisper"]);
const CONTENT_TYPES = new Set(["content", "text_content", "text_content_keyword"]);

export function buildMatchMeta(hit: SemanticHit): MatchMeta {
  const meta: MatchMeta = {};
  const pageSet = new Set<number>();
  const retrievalKwSet = new Set<string>();
  const upsertScore = (
    key: "metadata" | "content" | "clip_thumbnail",
    score: number,
  ) => {
    const cur = meta[key];
    if (!cur || cur.score < score) meta[key] = { score };
  };
  const upsertRetrievalKeywords = (score: number, matched?: string) => {
    const cur = meta.retrieval_keywords;
    if (matched) retrievalKwSet.add(matched);
    const next = { score: cur && cur.score > score ? cur.score : score };
    if (retrievalKwSet.size > 0) {
      meta.retrieval_keywords = { ...next, matched: [...retrievalKwSet] };
    } else {
      meta.retrieval_keywords = next;
    }
  };

  for (const seg of hit.segments) {
    for (const m of seg.matches) {
      const score = m.score ?? 0;
      if (AUDIO_TYPES.has(m.type)) {
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
        upsertScore("clip_thumbnail", score);
      } else if (m.type === "metadata") {
        upsertScore("metadata", score);
      } else if (CONTENT_TYPES.has(m.type)) {
        upsertScore("content", score);
        (meta.content_matches ??= []).push({
          score,
          ...(m.text ? { text: m.text } : {}),
          ...(typeof m.page === "number" ? { page: m.page } : {}),
        });
      } else if (m.type === "retrieval_keywords") {
        // LLM-expansion hit: chip-only, no jump target. ``m.text`` is
        // the matched keyword string from the backend; collect them
        // so the UI can later show "matched via: kw1, kw2".
        upsertRetrievalKeywords(score, m.text);
      }
      if (typeof m.page === "number") pageSet.add(m.page);
    }
  }

  // Top-level fallback: if the addon declared a match channel but the
  // per-segment MatchInfo list didn't expose a usable timestamp/score
  // entry (happens for `keyword` filename-side hits, and for
  // segment-less channels in some addon versions), we still want a
  // badge to render. Use the hit-level score as a coarse proxy.
  const fallbackScore = hit.score ?? 0;
  for (const t of hit.match_types ?? []) {
    if (AUDIO_TYPES.has(t) && !meta.transcript) {
      // No timestamp available — synthesise an audio badge with a
      // placeholder time_range that the timestamp-pill renderer will
      // skip (it filters seconds < 0).
      meta.transcript = [{ time_range: [-1, -1], score: fallbackScore }];
    } else if (CONTENT_TYPES.has(t) && !meta.content) {
      upsertScore("content", fallbackScore);
    } else if (t === "metadata" && !meta.metadata) {
      upsertScore("metadata", fallbackScore);
    } else if (t === "clip_thumbnail" && !meta.clip_thumbnail) {
      upsertScore("clip_thumbnail", fallbackScore);
    } else if (t === "clip" && !meta.clip) {
      meta.clip = [{ time_range: [-1, -1], score: fallbackScore }];
    } else if (t === "keyword" && !meta.filename) {
      // Filename-keyword hit from the semantic engine. The filename
      // engine usually sets `meta.filename` during merge, but if a hit
      // came back semantic-only we still want a filename badge.
      meta.filename = { score: fallbackScore };
    } else if (t === "retrieval_keywords" && !meta.retrieval_keywords) {
      // Backend declared a retrieval_keywords hit but the per-segment
      // MatchInfo path missed it (defensive — current backend always
      // emits a MatchInfo, but old/forked builds may not). Surface a
      // chip-only badge without a matched-keyword list.
      meta.retrieval_keywords = { score: fallbackScore };
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
  if (meta.path) score += meta.path.score * PATH_WEIGHT;
  if (meta.retrieval_keywords)
    score += meta.retrieval_keywords.score * RETRIEVAL_KEYWORDS_WEIGHT;
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
    liked_at: null,
    // Hydration failed, so the real tier is unknown. The values below are
    // only placeholders to satisfy the shape; `trust_unknown` is what a
    // trust filter actually reads, and it drops the row rather than let
    // an unknown pass as verified.
    trust_tier: "verified" as const,
    trust_reviewed_at: null,
    trust_unknown: true as const,
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
    // spec 2026-05-02-search-path-match: backend returns which of title /
    // folder_path / both was hit via `match_source`. When "path" only, skip
    // the filename badge and show only the path badge. When `match_source` is
    // absent (older backend / non-search path), fall back to filename badge
    // for backward compatibility.
    const initialMeta: MatchMeta = {};
    const src = f.match_source ?? "filename";
    if (src === "filename" || src === "both") {
      initialMeta.filename = { score: 1 };
    }
    if (src === "path" || src === "both") {
      initialMeta.path = { score: 1 };
    }
    byId.set(f.id, { ...f, match_meta: initialMeta });
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
    case "random":
      return sorted;
    default:
      return sorted;
  }
}
