/**
 * The badges that say why a search result matched.
 *
 * Every surface that draws these badges, and the legend that explains
 * them, reads this table — so the legend cannot describe a badge nobody
 * draws, and a badge cannot arrive without a sentence.
 *
 * `labelKey` is the `search` namespace key for the badge's own word, and
 * `helpKey` is the sentence the legend adds to it. Both live in
 * `messages-core` — core draws these badges, so core owns the words
 * (`.claude/rules/frontend-conventions.md`).
 */
export interface MatchBadge {
  /** The `match_meta` key this badge stands for. */
  key: string;
  /** `search` namespace key for the word on the badge. */
  labelKey: string;
  /** `search` namespace key for the legend's sentence about it. */
  helpKey: string;
  /** Tailwind tokens. */
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
    // Same accent family as filename/metadata at a lower opacity.
    // Label policy: spec `2026-05-02-search-path-match.md`.
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
    // A SIRA-style LLM-expanded keyword hit. It re-uses the warm-light tone
    // of the content badge so it sits beside the keyword chips; the word on
    // it is what says the match came from an expansion rather than from the
    // document body.
    key: "retrieval_keywords",
    labelKey: "matchRetrievalKeywords",
    helpKey: "matchRetrievalKeywordsHelp",
    style: "bg-warm-light text-text-muted",
  },
] as const;

/** Tokens by `match_meta` key, for the two surfaces that draw badges. */
export const MATCH_BADGE_STYLES: Record<string, string> = Object.fromEntries(
  MATCH_BADGES.map((badge) => [badge.key, badge.style]),
);

/** The badge's own word, for a surface that has a `search` translator. */
export function matchBadgeLabels(
  t: (key: string) => string,
): Record<string, string> {
  return Object.fromEntries(
    MATCH_BADGES.map((badge) => [badge.key, t(badge.labelKey)]),
  );
}
