import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { useTranslations } from "next-intl";

interface BreadcrumbProps {
  driveName: string;
  folderPath?: string;
  getDropTargetProps?: (targetPath: string) => Record<string, (e: React.DragEvent) => void>;
  isDropTarget?: (targetPath: string) => boolean;
}

export function Breadcrumb({ driveName, folderPath, getDropTargetProps, isDropTarget }: BreadcrumbProps) {
  const t = useTranslations("toolbar");
  const segments = folderPath ? folderPath.split("/").filter(Boolean) : [];

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
      {segments.length === 0 ? (
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
        const isLast = i === segments.length - 1;
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
    </nav>
  );
}
