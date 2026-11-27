"use client";

import { Breadcrumb } from "../Breadcrumb";
import { FileHeaderRowPortal } from "../FileHeaderRowProvider";

/**
 * The collection trail while the right pane has not drawn the file page's own
 * row yet. Once that row mounts it is the newest drawer and takes the place.
 */
export function QueueTrail({
  drive,
  name,
  href,
  fileTitle,
}: {
  drive: string;
  name: string;
  href: string;
  fileTitle: string;
}) {
  return (
    <FileHeaderRowPortal>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Breadcrumb
          driveName={drive}
          ancestorSegments={[{ label: name, href }]}
          trailingSegment={fileTitle}
          compact
        />
      </div>
    </FileHeaderRowPortal>
  );
}
