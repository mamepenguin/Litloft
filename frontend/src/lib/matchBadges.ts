export interface MatchBadge {
  key: string;
  labelKey: string;
  helpKey: string;
  style: string;
}

/**
 * In the order the legend lists them: where the words were found, from the
 * name of the file inwards to what it turned out to contain.
 */
export const MATCH_BADGES: readonly MatchBadge[] = [
  {
    key: "filename",
    labelKey: "matchFilename",
    helpKey: "matchFilenameHelp",
    style: "bg-accent/15 text-accent",
  },
  {
    key: "path",
    labelKey: "matchPath",
    helpKey: "matchPathHelp",
    style: "bg-accent/5 text-accent",
  },
  {
    key: "metadata",
    labelKey: "matchMetadata",
    helpKey: "matchMetadataHelp",
    style: "bg-accent/10 text-accent",
  },
  {
    key: "transcript",
    labelKey: "matchTranscript",
    helpKey: "matchTranscriptHelp",
    style: "bg-accent-teal/15 text-accent-teal",
  },
  {
    key: "clip",
    labelKey: "matchClip",
    helpKey: "matchClipHelp",
    style: "bg-accent-amber/15 text-accent-amber",
  },
  {
    key: "clip_thumbnail",
    labelKey: "matchClipThumbnail",
    helpKey: "matchClipThumbnailHelp",
    style: "bg-accent-amber/10 text-accent-amber",
  },
  {
    key: "content",
    labelKey: "matchContent",
    helpKey: "matchContentHelp",
    style: "bg-warm-light text-text-primary",
  },
  {
    key: "retrieval_keywords",
    labelKey: "matchRetrievalKeywords",
    helpKey: "matchRetrievalKeywordsHelp",
    style: "bg-warm-light text-text-muted",
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
