export interface MatchBadge {
  key: string;
  labelKey: string;
  helpKey: string;
  style: string;
}

/** Every badge says where the words were found, not how strongly. */
export const MATCH_BADGE_STYLE =
  "bg-bg-elevated text-text-muted font-medium text-[10px]";

/**
 * In the order the legend lists them: where the words were found, from the
 * name of the file inwards to what it turned out to contain.
 */
export const MATCH_BADGES: readonly MatchBadge[] = [
  {
    key: "filename",
    labelKey: "matchFilename",
    helpKey: "matchFilenameHelp",
    style: MATCH_BADGE_STYLE,
  },
  {
    key: "path",
    labelKey: "matchPath",
    helpKey: "matchPathHelp",
    style: MATCH_BADGE_STYLE,
  },
  {
    key: "metadata",
    labelKey: "matchMetadata",
    helpKey: "matchMetadataHelp",
    style: MATCH_BADGE_STYLE,
  },
  {
    key: "transcript",
    labelKey: "matchTranscript",
    helpKey: "matchTranscriptHelp",
    style: MATCH_BADGE_STYLE,
  },
  {
    key: "clip",
    labelKey: "matchClip",
    helpKey: "matchClipHelp",
    style: MATCH_BADGE_STYLE,
  },
  {
    key: "clip_thumbnail",
    labelKey: "matchClipThumbnail",
    helpKey: "matchClipThumbnailHelp",
    style: MATCH_BADGE_STYLE,
  },
  {
    key: "content",
    labelKey: "matchContent",
    helpKey: "matchContentHelp",
    style: MATCH_BADGE_STYLE,
  },
  {
    key: "retrieval_keywords",
    labelKey: "matchRetrievalKeywords",
    helpKey: "matchRetrievalKeywordsHelp",
    style: MATCH_BADGE_STYLE,
  },
] as const;

export const MATCH_BADGE_STYLES: Record<string, string> = Object.fromEntries(
  MATCH_BADGES.map((badge) => [badge.key, badge.style]),
);

export function matchBadgeLabels(
  t: (key: string) => string,
): Record<string, string> {
  return Object.fromEntries(
    MATCH_BADGES.map((badge) => [badge.key, t(badge.labelKey)]),
  );
}
