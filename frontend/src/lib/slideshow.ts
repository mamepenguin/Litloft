export const INTERVAL_OPTIONS = [3, 5, 10] as const;

export type SlideshowInterval = (typeof INTERVAL_OPTIONS)[number];
