"use client";

import type { ReactElement } from "react";

import { LauncherRow } from "./LauncherRow";
import type { JumpDestination } from "./useJumpDestinations";

interface JumpRowsProps {
  heading: string;
  jumps: readonly JumpDestination[];
  /** Index of the first row in the modal's keyboard order. */
  offset: number;
  selectedIndex: number;
  mobile: boolean;
  onOpen: (jump: JumpDestination) => void;
  onEnterFolder: (path: string) => void;
}

export function JumpRows({
  heading,
  jumps,
  offset,
  selectedIndex,
  mobile,
  onOpen,
  onEnterFolder,
}: JumpRowsProps): ReactElement {
  return (
    <div className="pb-1.5">
      <div className="px-4 pt-3 pb-1 text-xs font-medium text-text-muted">
        {heading}
      </div>
      {jumps.map((jump, row) => {
        const Icon = jump.icon;
        const folderPath = jump.folderPath;
        return (
          <LauncherRow
            key={jump.key}
            index={offset + row}
            selected={selectedIndex === offset + row}
            mobile={mobile}
            icon={<Icon size={mobile ? 18 : 16} className="flex-shrink-0 text-text-muted" />}
            label={jump.label}
            detail={jump.detail}
            onOpen={() => onOpen(jump)}
            onEnter={folderPath === undefined ? undefined : () => onEnterFolder(folderPath)}
          />
        );
      })}
    </div>
  );
}
