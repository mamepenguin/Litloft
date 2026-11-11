/** Shared by the fixture that draws the shelves and the spec that measures them. */

export const ID = "video-card-spacing";

export const TITLE_TAIL =
  "a title long enough to take the two lines a video card's title clamps to at every width measured here";

export const titleOf = (id: string): string => `Clip ${id}: ${TITLE_TAIL}`;

export const bylineOf = (id: string): string => `Channel ${id} · 2026-11-01`;

export const SEE_ALL_FIRST_PAGE = 60;
export const SEE_ALL_TOTAL = 65;
