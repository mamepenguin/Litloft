/**
 * A `view-transition-name` has to be unique in the frame: two elements
 * carrying one value abort the transition. Keeping every value here is what
 * makes that checkable.
 */
export const TRANSITION_NAMES = {
  /** The picture that grows from a listing card into the open file. */
  fileHero: "file-hero",
  /** The file list, which slides between folders. */
  listing: "listing",
  /** Breadcrumb and page title, which cross-fade in place. */
  pageHeading: "page-heading",
  /**
   * Named so the browser sees them as persisting rather than folding them
   * into the root snapshot, which would cross-fade the whole page.
   */
  appHeader: "app-header",
  appSidebar: "app-sidebar",
  folderTree: "folder-tree",
} as const;

export type TransitionName =
  (typeof TRANSITION_NAMES)[keyof typeof TRANSITION_NAMES];
