"use client";

import type { ReactNode } from "react";

export type PageFrameWidth = "full" | "wide" | "list" | "reading";

const WIDTH_CLASS: Record<PageFrameWidth, string> = {
  full: "",
  wide: "mx-auto max-w-wide",
  list: "mx-auto max-w-list-row",
  reading: "mx-auto max-w-reading",
};

export interface PageFrameProps {
  /** The width of what is under the header; the header takes the same width. */
  width: PageFrameWidth;
  header: ReactNode;
  children?: ReactNode;
}

/**
 * Takes no class from the page: the space above the header is the frame's
 * alone, so every screen that wears it puts its title at the same height.
 */
export function PageFrame({ width, header, children }: PageFrameProps) {
  const classes = ["flex w-full min-w-0 flex-1 flex-col pt-5", WIDTH_CLASS[width]]
    .filter(Boolean)
    .join(" ");
  return (
    <div data-page-frame={width} className={classes}>
      {header}
      {children}
    </div>
  );
}

export default PageFrame;
