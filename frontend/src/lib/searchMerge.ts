import type {
  FileItem,
  FileItemWithMatch,
  MatchMeta,
  SortField,
  SortOrder,
} from "@/types";

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
  file: FileItem | null;
}

const FILENAME_BOOST = 2.0;
const CLIP_WEIGHT = 0.8;
// Folder-path substring matches are noisier than filename hits ("/Music/"
// matching every file under it on the query "music"), so they ride at a
// deliberately low weight.
const PATH_WEIGHT = 0.3;
// LLM-expanded retrieval keywords are discounted because the hit is an LLM
// guess at what a user would search for.
const RETRIEVAL_KEYWORDS_WEIGHT = 0.8;

// Collapsed into buckets so a single card never shows "audio" + "audio
// keyword" as two badges.
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
        upsertRetrievalKeywords(score, m.text);
      }
      if (typeof m.page === "number") pageSet.add(m.page);
    }
  }

  // The per-segment MatchInfo list does not always expose a usable entry
  // (`keyword` filename-side hits, segment-less channels), so the hit-level
  // score is used as a coarse proxy.
  const fallbackScore = hit.score ?? 0;
  for (const t of hit.match_types ?? []) {
    if (AUDIO_TYPES.has(t) && !meta.transcript) {
      // Placeholder time_range that the timestamp-pill renderer will skip
      // (it filters seconds < 0).
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
      meta.filename = { score: fallbackScore };
    } else if (t === "retrieval_keywords" && !meta.retrieval_keywords) {
      meta.retrieval_keywords = { score: fallbackScore };
    }
  }

  if (pageSet.size > 0) {
    meta.matched_pages = [...pageSet].sort((a, b) => a - b);
  }
  return meta;
}

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
    // The addon already differentiates thumbnail and scene CLIP via separate
    // ``rrf_weight_clip*`` knobs, so both share the visual-channel weight here.
    score += meta.clip_thumbnail.score * CLIP_WEIGHT;
  }
  if (meta.content) score += meta.content.score;
  if (meta.path) score += meta.path.score * PATH_WEIGHT;
  if (meta.retrieval_keywords)
    score += meta.retrieval_keywords.score * RETRIEVAL_KEYWORDS_WEIGHT;
  return score;
}

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
    image_width: null,
    image_height: null,
    liked_at: null,
    // Placeholders to satisfy the shape; `trust_unknown` is what a trust
    // filter actually reads, and it drops the row rather than let an unknown
    // pass as verified.
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
  filenameTotal: number;
}

export interface MergeResultsValue {
  files: FileItemWithMatch[];
  total: number;
}

export function mergeResults({
  filenameMatches,
  semanticHits,
  filenameTotal,
}: MergeResultsParams): MergeResultsValue {
  const byId = new Map<string, FileItemWithMatch>();
  const filenameIds = new Set<string>();

  for (const f of filenameMatches) {
    filenameIds.add(f.id);
    // `match_source` is absent on non-search paths, which fall back to the
    // filename badge.
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
