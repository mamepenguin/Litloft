"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FileItemWithMatch, MatchMeta } from "@/types";
import { formatDuration } from "@/lib/format";
import { collectMatchTimestamps } from "@/lib/matchTimestamps";
import { MATCH_BADGE_STYLES, matchBadgeLabels } from "@/lib/matchBadges";
import { AddonSlot } from "@/components/AddonSlot";
import { buildSearchSnippet } from "@/lib/searchCapture";

function MatchBadge({ type, label }: { type: string; label: string }) {
  const style = MATCH_BADGE_STYLES[type] ?? "bg-sand text-text-primary";
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
        e.stopPropagation();
      }}
      data-testid="match-timestamp-pill"
      className="rounded-lg px-1.5 py-0.5 text-[10px] font-medium text-text-muted transition-colors hover:bg-accent/10"
    >
      {formatDuration(seconds)}
    </Link>
  );
}

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

  const labels = matchBadgeLabels(t);

  // filename (substring) and metadata (embedding) are semantically close;
  // collapse to one when both are true so the card doesn't get cluttered.
  // Show metadata only when there is no filename badge (semantic-only hit).
  const activeTypes: string[] = [];
  if (match.filename) activeTypes.push("filename");
  else if (match.metadata) activeTypes.push("metadata");
  // path stands independently from filename/metadata — show both badges
  // when the query hit both title and folder_path.
  if (match.path) activeTypes.push("path");
  if (match.transcript && match.transcript.length > 0) {
    activeTypes.push("transcript");
  }
  if (match.clip_thumbnail) activeTypes.push("clip_thumbnail");
  if (match.clip && match.clip.length > 0) activeTypes.push("clip");
  if (match.content) activeTypes.push("content");
  if (match.retrieval_keywords) activeTypes.push("retrieval_keywords");

  const { shown: timestampSegments, overflow: timestampOverflow } =
    collectMatchTimestamps(match);

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
              key={`${seg.kind}-${seg.seconds}`}
              seconds={seg.seconds}
              fileId={fileId}
            />
          ))}
          {timestampOverflow > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] text-text-muted">
              +{timestampOverflow}
            </span>
          )}
        </div>
      )}
      {matchedPages.length > 0 && (
        <div className="flex flex-wrap gap-0.5">
          {matchedPages.map((page) => (
            <Link
              key={page}
              href={`/files/${fileId}?page=${page}`}
              onClick={(e) => {
                e.stopPropagation();
              }}
              data-testid="match-page-pill"
              className="rounded-lg px-1.5 py-0.5 text-[10px] font-medium text-text-muted transition-colors hover:bg-accent/10"
            >
              {t("matchedPages", { pages: page })}
            </Link>
          ))}
        </div>
      )}
      {snippet && (
        <div className="group/snippet flex items-start gap-1.5 border-l-2 border-bg-border pl-2">
          <p className="line-clamp-2 min-w-0 flex-1 text-[11px] leading-relaxed text-text-muted">
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
