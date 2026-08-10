"use client";

/**
 * MatchOverlay — per-card match metadata for the unified search list.
 *
 * Spec: `2026-05-02-search-results-unification-phase3.md`. Filename
 * match and semantic hits live in one list now; each card surfaces a
 * `MatchMeta` describing why it matched. Backend channels are
 * collapsed by `buildMatchMeta` into 6 user-facing buckets so a card
 * never shows e.g. "audio" + "audio keyword" side by side:
 *   filename / metadata / audio / content / scene / thumbnail
 *
 * Color usage follows DESIGN.md §2.2 (warm palette only):
 *   filename / metadata → accent (primary surface, file-level)
 *   transcript          → accent-teal (audio = nature)
 *   clip / clip_thumbnail → accent-amber (visual = focus)
 *   content             → warm-light (neutral, body text)
 *
 * The last row is a search snippet: the single strongest quotable excerpt
 * behind the hit, rendered as a quiet quotation rather than a surface so a
 * dense grid of cards does not turn into a wall of boxes. Addons hang their
 * per-hit actions off that row through `search-result-actions`; the snippet
 * itself is core, so a drive without Knowledge still sees where it matched.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FileItemWithMatch, MatchMeta } from "@/types";
import { formatDuration } from "@/lib/format";
import { AddonSlot } from "@/components/AddonSlot";
import { buildSearchSnippet } from "@/lib/searchCapture";

const MATCH_TYPE_STYLES: Record<string, string> = {
  filename: "bg-accent/15 text-accent",
  // path uses the same accent family as filename/metadata but at lower opacity.
  // Label policy: spec `2026-05-02-search-path-match.md`.
  path: "bg-accent/5 text-accent",
  metadata: "bg-accent/10 text-accent",
  transcript: "bg-accent-teal/15 text-accent-teal",
  clip: "bg-accent-amber/15 text-accent-amber",
  clip_thumbnail: "bg-accent-amber/10 text-accent-amber",
  content: "bg-warm-light text-text-primary",
  retrieval_keywords: "bg-warm-light text-text-secondary",
};

function MatchBadge({ type, label }: { type: string; label: string }) {
  const style = MATCH_TYPE_STYLES[type] ?? "bg-sand text-text-primary";
  return (
    <span
      className={`inline-flex rounded-lg px-1.5 py-0.5 text-[10px] font-medium ${style}`}
    >
      {label}
    </span>
  );
}

function TimestampLink({
  seconds,
  fileId,
}: {
  seconds: number;
  fileId: string;
}) {
  return (
    <Link
      href={`/files/${fileId}?t=${Math.floor(seconds)}`}
      onClick={(e) => {
        // FileCard wraps the whole card in a clickable area; the
        // overlay container already calls stopPropagation, but keep
        // preventDefault here as a belt-and-braces guard so the
        // browser doesn't double-fire with the wrapping <a>.
        e.stopPropagation();
      }}
      className="rounded-lg px-1.5 py-0.5 text-[10px] font-medium text-accent transition-colors hover:bg-accent/10"
    >
      {formatDuration(seconds)}
    </Link>
  );
}

const MAX_TIMESTAMP_PILLS = 3;

export function MatchOverlay({
  match,
  fileId,
  file,
}: {
  match: MatchMeta;
  fileId: string;
  file?: FileItemWithMatch;
}) {
  const t = useTranslations("search");

  const labels: Record<string, string> = {
    filename: t("matchFilename"),
    path: t("matchPath"),
    metadata: t("matchMetadata"),
    transcript: t("matchTranscript"),
    clip: t("matchClip"),
    clip_thumbnail: t("matchClipThumbnail"),
    content: t("matchContent"),
    retrieval_keywords: t("matchRetrievalKeywords"),
  };

  // filename (substring) and metadata (embedding) are semantically close;
  // collapse to one when both are true so the card doesn't get cluttered.
  // Show metadata only when there is no filename badge (semantic-only hit).
  const activeTypes: string[] = [];
  if (match.filename) activeTypes.push("filename");
  else if (match.metadata) activeTypes.push("metadata");
  // path stands independently from filename/metadata (spec
  // 2026-05-02-search-path-match) — show both badges when the query hit both
  // title and folder_path so the user can see where it matched.
  if (match.path) activeTypes.push("path");
  if (match.transcript && match.transcript.length > 0) {
    activeTypes.push("transcript");
  }
  if (match.clip_thumbnail) activeTypes.push("clip_thumbnail");
  if (match.clip && match.clip.length > 0) activeTypes.push("clip");
  if (match.content) activeTypes.push("content");
  if (match.retrieval_keywords) activeTypes.push("retrieval_keywords");

  // Tag each segment with its source so the React key stays unique
  // when a transcript hit and a clip hit happen to share the same
  // time_range (rare but possible when ASR aligns with a CLIP frame).
  const timestampSegments = [
    ...(match.transcript ?? []).map((s) => ({ ...s, kind: "tr" as const })),
    ...(match.clip ?? []).map((s) => ({ ...s, kind: "cl" as const })),
  ]
    .filter((s) => s.time_range[0] >= 0)
    .sort((a, b) => a.time_range[0] - b.time_range[0])
    .slice(0, MAX_TIMESTAMP_PILLS);

  const matchedPages = match.matched_pages ?? [];
  const snippet = file ? buildSearchSnippet(file) : null;

  if (
    activeTypes.length === 0 &&
    timestampSegments.length === 0 &&
    matchedPages.length === 0 &&
    !snippet
  ) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      {activeTypes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {activeTypes.map((type) => (
            <MatchBadge key={type} type={type} label={labels[type] ?? type} />
          ))}
        </div>
      )}
      {timestampSegments.length > 0 && (
        <div className="flex flex-wrap gap-0.5">
          {timestampSegments.map((seg) => (
            <TimestampLink
              key={`${seg.kind}-${seg.time_range[0]}-${seg.time_range[1]}`}
              seconds={seg.time_range[0]}
              fileId={fileId}
            />
          ))}
        </div>
      )}
      {matchedPages.length > 0 && (
        <p className="text-[11px] text-text-muted">
          {t("matchedPages", { pages: matchedPages.join(", ") })}
        </p>
      )}
      {snippet && (
        <div className="group/snippet flex items-start gap-1.5 border-l-2 border-bg-border pl-2">
          <p className="line-clamp-2 min-w-0 flex-1 text-[11px] leading-relaxed text-text-secondary">
            {snippet.excerpt}
          </p>
          {/* Reserve the action's width at all times so revealing it on
              hover never reflows the excerpt beside it. */}
          <div className="flex-shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/snippet:opacity-100 pointer-coarse:opacity-100">
            <AddonSlot
              id="search-result-actions"
              props={{ capture: snippet.capture }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
