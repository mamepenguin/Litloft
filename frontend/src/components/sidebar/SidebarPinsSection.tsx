import Link from "next/link";
import { Folder } from "lucide-react";

import type { PinnedFolder } from "@/types";

interface SidebarPinsSectionProps {
  driveBase: string;
  pins: PinnedFolder[];
  linkClass: (href: string) => string;
  close: () => void;
}

export function SidebarPinsSection({ driveBase, pins, linkClass, close }: SidebarPinsSectionProps) {
  if (pins.length === 0) return null;

  return (
    <>
      <div className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Pins
      </div>
      {pins.map((pin) => {
        const pinHref = `${driveBase}/${pin.path.split("/").map(encodeURIComponent).join("/")}`;
        const pinName = pin.path.split("/").pop() ?? pin.path;
        return (
          <Link
            key={pin.path}
            href={pinHref}
            onClick={close}
            className={linkClass(pinHref)}
          >
            <Folder size={16} />
            <span className="flex-1 truncate">{pinName}</span>
          </Link>
        );
      })}
    </>
  );
}
