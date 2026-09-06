/**
 * The intervals a slideshow can be set to, in seconds.
 *
 * One definition, used by both full-screen viewers. It was two — the
 * image gallery's and the archive's — holding the same three numbers,
 * which is the shape a divergence starts from rather than a divergence
 * itself.
 */
export const INTERVAL_OPTIONS = [3, 5, 10] as const;

export type SlideshowInterval = (typeof INTERVAL_OPTIONS)[number];
