/**
 * A module of its own rather than exports on the config: Playwright loads a
 * config through a different path from a spec, and the two do not agree
 * about module format.
 */

export const DESKTOP_ONLY = [
  "**/add-menu-desktop.spec.ts",
  "**/condition-menu-desktop.spec.ts",
  "**/anchored-direction-desktop.spec.ts",
  "**/view-transition-desktop.spec.ts",
  "**/citation-seams-desktop.spec.ts",
  "**/code-viewer-desktop.spec.ts",
  "**/segmented-control-desktop.spec.ts",
  "**/epub-bar-desktop.spec.ts",
  "**/justified-hold-desktop.spec.ts",
  "**/image-search-drag-desktop.spec.ts",
  "**/image-drop-target-desktop.spec.ts",
  "**/text-resume-desktop.spec.ts",
  "**/persistent-highlights-desktop.spec.ts",
  "**/ask-thread-desktop.spec.ts",
  "**/search-results-bar-desktop.spec.ts",
  "**/home-app-entries-desktop.spec.ts",
  "**/discover-prefix-desktop.spec.ts",
  "**/video-card-byline-desktop.spec.ts",
  "**/video-card-spacing-desktop.spec.ts",
];

/** Literals rather than a device preset, which can change under it. */
export const DESKTOP_VIEWPORT = { width: 1280, height: 800 } as const;
