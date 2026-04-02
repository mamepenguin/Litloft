"use client";

import { Clock, File, FilePlus, Search, RefreshCw, Star } from "lucide-react";
import { useTranslations } from "next-intl";

type EmptyVariant = "no-files" | "no-results" | "needs-scan" | "no-favorites" | "no-recent" | "no-recent-added";

const variantConfig: Record<
  EmptyVariant,
  { icon: typeof File; titleKey: string; descriptionKey: string }
> = {
  "no-files": {
    icon: File,
    titleKey: "noFilesTitle",
    descriptionKey: "noFilesDescription",
  },
  "no-results": {
    icon: Search,
    titleKey: "noResultsTitle",
    descriptionKey: "noResultsDescription",
  },
  "needs-scan": {
    icon: RefreshCw,
    titleKey: "needsScanTitle",
    descriptionKey: "needsScanDescription",
  },
  "no-favorites": {
    icon: Star,
    titleKey: "noFavoritesTitle",
    descriptionKey: "noFavoritesDescription",
  },
  "no-recent": {
    icon: Clock,
    titleKey: "noRecentTitle",
    descriptionKey: "noRecentDescription",
  },
  "no-recent-added": {
    icon: FilePlus,
    titleKey: "noRecentAddedTitle",
    descriptionKey: "noRecentAddedDescription",
  },
};

export function EmptyState({
  variant,
  action,
}: {
  variant: EmptyVariant;
  action?: { label: string; onClick: () => void };
}) {
  const t = useTranslations("empty");
  const { icon: Icon, titleKey, descriptionKey } = variantConfig[variant];

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon size={48} className="mb-4 text-text-muted" />
      <h2 className="text-lg font-semibold text-text-primary">{t(titleKey)}</h2>
      <p className="mt-1 text-sm text-text-muted">{t(descriptionKey)}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
