/**
 * Which width each spec in this directory runs at.
 *
 * A module of its own rather than exports on `playwright-components.config.ts`,
 * because a spec importing the config is a spec importing `defineConfig` — and
 * Playwright loads a config through a different path from a spec, so the two
 * do not agree about module format. Two consumers, one small file, no cycle.
 *
 * The config routes with these; `spec-viewport.spec.ts` asserts that the
 * routing covers every spec on disk exactly once.
 */

/**
 * The spec that needs a viewport `md` matches at.
 *
 * Everything else this target measures is a touch behaviour at a phone width.
 * The exception is `TwoPaneLayout`'s tree column: `overflow-hidden` and
 * `md:w-[280px]`, so its right edge is inside the viewport — the one
 * arrangement where the frame's right edge decides something the intersection
 * with the visible band would not. Below `md` that aside is `w-[100vw]`, so
 * drawing a 280px column at 393 would be a fixture of an arrangement the app
 * does not have.
 */
export const DESKTOP_ONLY = "**/anchored-direction-desktop.spec.ts";

/**
 * The desktop context, as literals.
 *
 * 1280x800 rather than a device preset: what the arrangement needs is a width
 * above `md` (768) with room to spare beside a 280px column, and a preset
 * would tie that to whatever Playwright's device table says this month.
 * `spec-viewport.spec.ts`'s reasoning about `Pixel 5`, applied to the second
 * project.
 */
export const DESKTOP_VIEWPORT = { width: 1280, height: 800 } as const;
