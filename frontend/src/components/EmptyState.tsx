"use client";

import { Clock, File, FilePlus, Search, RefreshCw, Star, Tag, ThumbsUp, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button, buttonClass } from "./Button";

export const EMPTY_VARIANTS = [
  "no-files",
  "no-results",
  "needs-scan",
  "no-favorites",
  "no-liked",
  "no-recent",
  "no-recent-profile",
  "no-recent-added",
  "no-tag-matches",
  "no-trash",
] as const;

export type EmptyVariant = (typeof EMPTY_VARIANTS)[number];

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
  "no-liked": {
    icon: ThumbsUp,
    titleKey: "noLikedTitle",
    descriptionKey: "noLikedDescription",
  },
  "no-recent": {
    icon: Clock,
    titleKey: "noRecentTitle",
    descriptionKey: "noRecentDescription",
  },
  "no-recent-profile": {
    icon: Clock,
    titleKey: "noRecentNoProfileTitle",
    descriptionKey: "noRecentNoProfileDescription",
  },
  "no-recent-added": {
    icon: FilePlus,
    titleKey: "noRecentAddedTitle",
    descriptionKey: "noRecentAddedDescription",
  },
  "no-tag-matches": {
    icon: Tag,
    titleKey: "noTagMatchesTitle",
    descriptionKey: "noTagMatchesDescription",
  },
  "no-trash": {
    icon: Trash2,
    titleKey: "noTrashTitle",
    descriptionKey: "noTrashDescription",
  },
};

export type EmptyStateAction =
  | { label: string; onClick: () => void; href?: never; newTab?: never; download?: never }
  /**
   * The file endpoints must not get `next/link`, because `<Link>` prefetches
   * an internal href on sight — which for `/api/files/{id}/stream` means
   * fetching the file body when the empty state scrolls into view.
   */
  | {
      label: string;
      href: string;
      onClick?: never;
      newTab?: boolean;
      download?: boolean;
    };

interface BaseProps {
  primaryAction?: EmptyStateAction;
  secondaryActions?: readonly EmptyStateAction[];
}

interface VariantProps extends BaseProps {
  variant: EmptyVariant;
  icon?: never;
  title?: never;
  description?: never;
}

/**
 * An addon cannot use a `variant`: adding a variant per addon would put the
 * addon's vocabulary into core.
 */
interface DirectProps extends BaseProps {
  variant?: never;
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
}

export type EmptyStateProps = VariantProps | DirectProps;

function renderAction(action: EmptyStateAction, variant: "primary" | "secondary") {
  if (action.href === undefined) {
    return (
      <Button key={action.label} variant={variant} onClick={action.onClick}>
        {action.label}
      </Button>
    );
  }
  const className = buttonClass({ variant });
  // A file, not a route: a bare anchor, so nothing prefetches it, and
  // `rel` because `target="_blank"` without it hands the opened page a
  // `window.opener`.
  return action.newTab || action.download ? (
    <a
      key={action.label}
      href={action.href}
      className={className}
      {...(action.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...(action.download ? { download: true } : {})}
    >
      {action.label}
    </a>
  ) : (
    <Link key={action.label} href={action.href} className={className}>
      {action.label}
    </Link>
  );
}

export function EmptyState(props: EmptyStateProps) {
  const t = useTranslations("empty");
  const { primaryAction, secondaryActions } = props;

  let Icon: LucideIcon;
  let title: ReactNode;
  let description: ReactNode;

  if (props.variant !== undefined) {
    const config = variantConfig[props.variant];
    Icon = config.icon;
    title = t(config.titleKey);
    description = t(config.descriptionKey);
  } else {
    Icon = props.icon;
    title = props.title;
    description = props.description;
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon size={48} className="mb-4 text-text-muted" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      {description !== undefined && description !== null && (
        <p className="mt-1 max-w-prose text-sm text-text-muted">{description}</p>
      )}
      {(primaryAction || (secondaryActions && secondaryActions.length > 0)) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {primaryAction && renderAction(primaryAction, "primary")}
          {secondaryActions?.map((action) => renderAction(action, "secondary"))}
        </div>
      )}
    </div>
  );
}
