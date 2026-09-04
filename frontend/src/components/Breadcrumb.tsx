import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { useTranslations } from "next-intl";

interface BreadcrumbProps {
  driveName: string;
  folderPath?: string;
  getDropTargetProps?: (targetPath: string) => Record<string, (e: React.DragEvent) => void>;
  isDropTarget?: (targetPath: string) => boolean;
  /**
   * Optional non-navigable trailing label rendered as the last
   * breadcrumb segment. Used by virtual-folder hosts (e.g. the
   * collection detail page) to surface a name that lives outside
   * the folder hierarchy without abusing ``folderPath``'s ``/``
   * splitting. When set, the drive name becomes a Link (since this
   * trailing label is the actual current location).
   *
   * A node rather than a string when the leaf needs to be more than
   * text — the file detail page row hands its filename here, and on a
   * Markdown note that filename is click-to-edit. A node is rendered
   * as given, so the caller owns its truncation and styling; a string
   * gets the leaf styling the folder segments use.
   */
  trailingSegment?: ReactNode;
}

export function Breadcrumb({
  driveName,
  folderPath,
  getDropTargetProps,
  isDropTarget,
  trailingSegment,
}: BreadcrumbProps) {
  const t = useTranslations("toolbar");
  const segments = folderPath ? folderPath.split("/").filter(Boolean) : [];
  // When a trailing virtual segment is provided, the drive itself is no
  // longer the leaf — render it as a Link, the same way it behaves when
  // ``folderPath`` carries real segments.
  const driveIsLeaf = segments.length === 0 && !trailingSegment;

  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm text-text-muted overflow-x-auto">
      <Link
        href="/"
        className="flex-shrink-0 hover:text-text-primary"
        aria-label={t("home")}
      >
        <Home size={16} />
      </Link>

      <ChevronRight size={14} className="flex-shrink-0" />
      {driveIsLeaf ? (
        <span className="font-medium text-text-primary truncate">{driveName}</span>
      ) : (
        <Link
          href={`/drive/${encodeURIComponent(driveName)}`}
          className={`hover:text-text-primary truncate rounded-lg px-1 transition-colors${
            isDropTarget?.("") ? " ring-2 ring-accent bg-accent/10 text-accent" : ""
          }`}
          {...getDropTargetProps?.("")}
        >
          {driveName}
        </Link>
      )}

      {segments.map((segment, i) => {
        const path = segments.slice(0, i + 1).join("/");
        const encodedPath = segments.slice(0, i + 1).map(encodeURIComponent).join("/");
        const isLast = i === segments.length - 1 && !trailingSegment;
        return (
          <span key={path} className="flex items-center gap-1">
            <ChevronRight size={14} className="flex-shrink-0" />
            {isLast ? (
              <span className="font-medium text-text-primary truncate">{segment}</span>
            ) : (
              <Link
                href={`/drive/${encodeURIComponent(driveName)}/${encodedPath}`}
                className={`hover:text-text-primary truncate rounded-lg px-1 transition-colors${
                  isDropTarget?.(path) ? " ring-2 ring-accent bg-accent/10 text-accent" : ""
                }`}
                {...getDropTargetProps?.(path)}
              >
                {segment}
              </Link>
            )}
          </span>
        );
      })}

      {trailingSegment && (
        <>
          <ChevronRight size={14} className="flex-shrink-0" />
          {typeof trailingSegment === "string" ? (
            <span className="font-medium text-text-primary truncate">
              {trailingSegment}
            </span>
          ) : (
            trailingSegment
          )}
        </>
      )}
    </nav>
  );
}
