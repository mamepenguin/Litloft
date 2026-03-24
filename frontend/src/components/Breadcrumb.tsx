import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

interface BreadcrumbProps {
  driveName: string;
  folderPath?: string;
}

export function Breadcrumb({ driveName, folderPath }: BreadcrumbProps) {
  const segments = folderPath ? folderPath.split("/").filter(Boolean) : [];

  return (
    <nav className="mb-4 flex items-center gap-1 text-sm text-text-muted overflow-x-auto">
      <Link
        href="/"
        className="flex-shrink-0 hover:text-text-primary"
        aria-label="ホーム"
      >
        <Home size={16} />
      </Link>

      <ChevronRight size={14} className="flex-shrink-0" />
      {segments.length === 0 ? (
        <span className="font-medium text-text-primary truncate">{driveName}</span>
      ) : (
        <Link
          href={`/drive/${encodeURIComponent(driveName)}`}
          className="hover:text-text-primary truncate"
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
                className="hover:text-text-primary truncate"
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
