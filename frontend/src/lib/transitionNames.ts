/**
 * A `view-transition-name` has to be unique in the frame: two elements
 * carrying one value abort the transition. Keeping every value here is what
 * makes that checkable.
 */
export const TRANSITION_NAMES = {
  /** The picture that grows from a listing card into the open file. */
  fileHero: "file-hero",
  /** The scrolling section holding the page, which slides between folders. */
  listing: "listing",
} as const;

export type TransitionName =
  (typeof TRANSITION_NAMES)[keyof typeof TRANSITION_NAMES];
