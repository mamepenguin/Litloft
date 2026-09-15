"use client";

import { useCurrentDrive } from "./CurrentDriveProvider";
import { TreeToggle } from "./TreeToggle";

export function DriveTreeToggle() {
  const drive = useCurrentDrive();
  if (!drive) return null;
  return <TreeToggle drive={drive} />;
}
