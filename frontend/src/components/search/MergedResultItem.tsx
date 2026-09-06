"use client";

/**
 * MergedResultItem — popup launcher row for the unified search list.
 *
 * Style + badge-selection logic mirrors `MatchOverlay.tsx` (page-side
 * card overlay) so popup quick-pick rows and the search-results page
 * read consistently. Color tokens follow DESIGN.md §2.2 (warm palette
 * only). The popup variant differs from MatchOverlay in its row layout
 * (thumbnail + text column) rather than a card overlay; the timestamp
 * pills follow one rule on both, from `lib/matchTimestamps.ts`.
 */

import { useTranslations } from "next-intl";
import { formatDuration } from "@/lib/format";
import { filenameToTitle } from "@/lib/filenameTitle";
import { collectMatchTimestamps } from "@/lib/matchTimestamps";
import type { FileItemWithMatch, MatchMeta } from "@/types";

const BADGE_STYLES: Record<string, string> = {
  filename: "bg-accent/15 text-accent",
  path: "bg-accent/5 text-accent",
  metadata: "bg-accent/10 text-accent",
  transcript: "bg-accent-teal/15 text-accent-teal",
  clip: "bg-accent-amber/15 text-accent-amber",
  clip_thumbnail: "bg-accent-amber/10 text-accent-amber",
  content: "bg-warm-light text-text-primary",
  // SIRA-style LLM-expanded keyword hit. Re-uses the warm-light tone
  // of the content badge so it sits visually adjacent to the existing
  // keyword chips; the distinct label is what tells users the match
  // came from an expansion rather than the document body.
  retrieval_keywords: "bg-warm-light text-text-muted",
};

function selectActiveBadgeKeys(meta: MatchMeta | undefined): string[] {
  if (!meta) return [];
  const keys: string[] = [];
  // filename and metadata are semantically close — collapse to one (same rule as MatchOverlay).
  if (meta.filename) keys.push("filename");
  else if (meta.metadata) keys.push("metadata");
  if (meta.path) keys.push("path");
  if (meta.transcript && meta.transcript.length > 0) keys.push("transcript");
  if (meta.clip_thumbnail) keys.push("clip_thumbnail");
  if (meta.clip && meta.clip.length > 0) keys.push("clip");
  if (meta.content) keys.push("content");
  if (meta.retrieval_keywords) keys.push("retrieval_keywords");
  return keys;
}

/**
 * The second line carries two different facts, and only sometimes both.
 *
 * A file's title starts life as `filenameToTitle(filename)`, so repeating
 * the filename under it usually repeats the title with an extension glued
 * back on. Not always: the title is editable, and a row built from an
 * unhydrated semantic hit is titled with the raw filename instead. And the
 * line is also where the folder path lives.
 *
 * So it says whichever of the two facts is new:
 *   the title still derives from the filename  →  the folder path alone,
 *                                                 or nothing at all
 *   it does not                                →  the path and the filename
 *
 * The comparison goes through `filenameToTitle` rather than through the
 * stem, because deriving a title is three steps and the stem is one of
 * them: `kyoto.mp4` is titled "Kyoto", so comparing stems answers "no" for
 * every filename that starts with a lower-case letter — which is most of
 * them.
 */
function secondLine(file: FileItemWithMatch): string | null {
  const folder = file.folder_path ? `${file.folder_path}/` : "";
  // Both suppressions matter. The derived title is the ordinary case; the
  // exact match is the row `mergeResults` builds without a file record and
  // titles with the raw filename, extension and all (`searchMerge.ts`
  // `title: hit.filename`).
  const saysNothingNew =
    file.filename === file.title || filenameToTitle(file.filename) === file.title;
  return saysNothingNew ? folder || null : `${folder}${file.filename}`;
}

interface Props {
  file: FileItemWithMatch;
  onSelect: (url: string) => void;
  isSelected?: boolean;
}

export function MergedResultItem({ file, onSelect, isSelected = false }: Props) {
  const t = useTranslations("search");
  const meta = file.match_meta;

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

  const badgeKeys = selectActiveBadgeKeys(meta);
  const { shown: timestamps, overflow } = collectMatchTimestamps(meta);
  const matchedPages = meta?.matched_pages ?? [];
  const subtitle = secondLine(file);

  return (
    <button
      type="button"
      data-testid="merged-result-item"
      onClick={() => onSelect(`/files/${file.id}`)}
      className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors ${isSelected ? "bg-bg-elevated" : "hover:bg-bg-elevated"}`}
    >
      <img
        src={`/api/files/${file.id}/thumbnail`}
        alt=""
        className="h-10 w-16 flex-shrink-0 rounded-lg bg-bg-elevated object-cover"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-primary">{file.title}</p>
        {subtitle && (
          <p className="truncate text-xs text-text-muted">{subtitle}</p>
        )}
        {badgeKeys.length > 0 && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {badgeKeys.map((key) => (
              <span
                key={key}
                className={`inline-flex rounded-lg px-1.5 py-0.5 text-[10px] font-medium ${BADGE_STYLES[key]}`}
              >
                {labels[key]}
              </span>
            ))}
          </div>
        )}
        {timestamps.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-0.5">
            {timestamps.map((ts) => (
              <span
                key={`${ts.kind}-${ts.seconds}`}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(`/files/${file.id}?t=${Math.floor(ts.seconds)}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    e.preventDefault();
                    onSelect(`/files/${file.id}?t=${Math.floor(ts.seconds)}`);
                  }
                }}
                className="cursor-pointer rounded-lg px-1.5 py-0.5 text-[10px] font-medium text-text-muted transition-colors hover:bg-accent/10"
              >
                {formatDuration(ts.seconds)}
              </span>
            ))}
            {overflow > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] text-text-muted">
                +{overflow}
              </span>
            )}
          </div>
        )}
        {matchedPages.length > 0 && (
          <p className="mt-1 text-[11px] text-text-muted">
            {t("matchedPages", { pages: matchedPages.join(", ") })}
          </p>
        )}
      </div>
    </button>
  );
}
