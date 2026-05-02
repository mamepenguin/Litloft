"use client";

/**
 * MatchOverlay — per-card match metadata for the unified search list.
 *
 * Spec: `2026-05-02-search-results-unification-phase3.md`. Filename
 * match and semantic hits live in one list now; each card surfaces a
 * `MatchMeta` describing why it matched. Backend channels are
 * collapsed by `buildMatchMeta` into 6 user-facing buckets so a card
 * never shows e.g. "音声" + "音声キーワード" side by side:
 *   filename / metadata / 音声 / 内容 / シーン / サムネイル
 *
 * Color usage follows DESIGN.md §2.2 (warm palette only):
 *   filename / metadata → accent (primary surface, file-level)
 *   transcript          → accent-teal (audio = nature)
 *   clip / clip_thumbnail → accent-amber (visual = focus)
 *   content             → warm-light (neutral, body text)
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { MatchMeta } from "@/types";
import { formatDuration } from "@/lib/format";

const MATCH_TYPE_STYLES: Record<string, string> = {
  filename: "bg-accent/15 text-accent",
  // path はファイル系（filename / metadata = accent）と同系で淡め。
  // `2026-05-02-search-path-match.md` のラベル方針。
  path: "bg-accent/5 text-accent",
  metadata: "bg-accent/10 text-accent",
  transcript: "bg-accent-teal/15 text-accent-teal",
  clip: "bg-accent-amber/15 text-accent-amber",
  clip_thumbnail: "bg-accent-amber/10 text-accent-amber",
  content: "bg-warm-light text-text-primary",
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
    path: t("matchPath"),
    metadata: t("matchMetadata"),
    transcript: t("matchTranscript"),
    clip: t("matchClip"),
    clip_thumbnail: t("matchClipThumbnail"),
    content: t("matchContent"),
  };

  // ファイル名 (substring) と メタデータ (embedding) は実体が近く、
  // 両方 true の場合は片方に集約してカードがうるさくならないようにする。
  // semantic-only ヒットで filename badge が無いときのみ metadata を出す。
  const activeTypes: string[] = [];
  if (match.filename) activeTypes.push("filename");
  else if (match.metadata) activeTypes.push("metadata");
  // path は filename / metadata と独立に立つ（spec
  // 2026-05-02-search-path-match）— title にも folder_path にもヒットした
  // ケースで両バッジを並べることでユーザーに「どこで当たったか」を可視化。
  if (match.path) activeTypes.push("path");
  if (match.transcript && match.transcript.length > 0) {
    activeTypes.push("transcript");
  }
  if (match.clip_thumbnail) activeTypes.push("clip_thumbnail");
  if (match.clip && match.clip.length > 0) activeTypes.push("clip");
  if (match.content) activeTypes.push("content");

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
