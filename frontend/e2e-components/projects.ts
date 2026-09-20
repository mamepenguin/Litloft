/**
 * A module of its own rather than exports on the config: Playwright loads a
 * config through a different path from a spec, and the two do not agree
 * about module format.
 */

export const DESKTOP_ONLY = [
  "**/add-menu-desktop.spec.ts",
  "**/anchored-direction-desktop.spec.ts",
  "**/view-transition-desktop.spec.ts",
];

/** Literals rather than a device preset, which can change under it. */
export const DESKTOP_VIEWPORT = { width: 1280, height: 800 } as const;
