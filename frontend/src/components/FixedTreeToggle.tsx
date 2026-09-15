"use client";

import { useCurrentDrive } from "./CurrentDriveProvider";
import { TreeToggle } from "./TreeToggle";

/**
 * Fixed beside the menu button rather than laid out in the header, so neither
 * the sidebar opening beside the page nor the tree borrowing its place moves
 * it.
 */
export function FixedTreeToggle() {
  const drive = useCurrentDrive();
  if (!drive) return null;
  return (
    <div
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      className="fixed left-[60px] z-50"
    >
      <TreeToggle drive={drive} />
    </div>
  );
}
