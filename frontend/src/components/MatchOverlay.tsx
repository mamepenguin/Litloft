"use client";

/**
 * MatchOverlay — per-card match metadata for the unified search list.
 *
 * Spec: `2026-05-02-search-results-unification-phase3.md`. Filename
 * match and semantic hits live in one list now; each card surfaces a
 * `MatchMeta` describing why it matched (filename, transcript,
 * clip, metadata, content, text-keyword, matched pages). Multiple
 * engines stack — a file that hits filename + transcript + clip
 * shows three badges in one row.
 *
 * Color usage follows DESIGN.md §2.2 (warm palette only):
 *   filename                        → accent (primary surface)
 *   transcript / transcript_keyword → accent-teal (audio = nature)
 *   clip                            → accent-amber (visual = focus)
 *   metadata / content / text_..._keyword → sand / warm-light (neutral)
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { MatchMeta } from "@/types";
import { formatDuration } from "@/lib/format";

const MATCH_TYPE_STYLES: Record<string, string> = {
  filename: "bg-accent/15 text-accent",
  transcript: "bg-accent-teal/15 text-accent-teal",
  transcript_keyword: "bg-accent-teal/10 text-accent-teal",
  clip: "bg-accent-amber/15 text-accent-amber",
  metadata: "bg-sand text-text-primary",
  content: "bg-warm-light text-text-primary",
  text_content_keyword: "bg-warm-light/60 text-text-primary",
};

function MatchBadge({ type, label }: { type: string; label: string }) {
  const style = MATCH_TYPE_STYLES[type] ?? "bg-sand text-text-primary";
  return (
    <span
      className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium ${style}`}
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
      className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-accent transition-colors hover:bg-accent/10"
    >
      {formatDuration(seconds)}
    </Link>
  );
}

const MAX_TIMESTAMP_PILLS = 3;

export function MatchOverlay({
  match,
  fileId,
}: {
  match: MatchMeta;
  fileId: string;
}) {
  const t = useTranslations("search");

  const labels: Record<string, string> = {
    filename: t("matchFilename"),
    transcript: t("matchTranscript"),
    transcript_keyword: t("matchTranscriptKeyword"),
    clip: t("matchClip"),
    clip_thumbnail: t("matchClipThumbnail"),
    metadata: t("matchMetadata"),
    content: t("matchContent"),
    text_content_keyword: t("matchTextContentKeyword"),
  };

  const activeTypes: string[] = [];
  if (match.filename) activeTypes.push("filename");
  if (match.metadata) activeTypes.push("metadata");
  if (match.transcript && match.transcript.length > 0) {
    activeTypes.push("transcript");
  }
  if (match.clip_thumbnail) activeTypes.push("clip_thumbnail");
  if (match.clip && match.clip.length > 0) activeTypes.push("clip");
  if (match.content) activeTypes.push("content");
  if (match.text_content_keyword) activeTypes.push("text_content_keyword");

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

  if (
    activeTypes.length === 0 &&
    timestampSegments.length === 0 &&
    matchedPages.length === 0
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
    </div>
  );
}
