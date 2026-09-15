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
 * Carries no padding and takes no class from the page. The title's Y is
 * `PageHeader`'s own `py-2`, which is also where the file-detail chrome puts
 * the tree toggle; padding above the header would make the toggle jump when a
 * file is opened from a folder.
 */
export function PageFrame({ width, header, children }: PageFrameProps) {
  const classes = ["flex w-full min-w-0 flex-1 flex-col", WIDTH_CLASS[width]]
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
