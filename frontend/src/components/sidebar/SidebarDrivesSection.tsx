import Link from "next/link";
import { HardDrive, Lock } from "lucide-react";

import type { Drive } from "@/types";

interface SidebarDrivesSectionProps {
  drives: Drive[];
  currentDrive: string | null;
  close: () => void;
}

export function SidebarDrivesSection({ drives, currentDrive, close }: SidebarDrivesSectionProps) {
  if (drives.length === 0) return null;

  return (
    <>
      <div className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Drives
      </div>
      {drives.map((drive) => {
        const href = `/drive/${encodeURIComponent(drive.name)}`;
        const isCurrentDrive = drive.name === currentDrive;
        return (
          <Link
            key={drive.name}
            href={href}
            onClick={close}
            className={`flex items-center gap-2.5 rounded-2xl px-3 py-2 text-sm transition-colors ${
              isCurrentDrive
                ? "bg-bg-elevated text-text-primary font-medium"
                : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            }`}
          >
            <HardDrive size={16} />
            <span className="flex-1 truncate">{drive.name}</span>
            {drive.protected && <Lock size={12} className="opacity-40" />}
          </Link>
        );
      })}
    </>
  );
}
