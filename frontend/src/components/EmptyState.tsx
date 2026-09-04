"use client";

import { Clock, File, FilePlus, Search, RefreshCw, Star, Tag, ThumbsUp, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "./Button";

type EmptyVariant = "no-files" | "no-results" | "needs-scan" | "no-favorites" | "no-liked" | "no-recent" | "no-recent-profile" | "no-recent-added" | "no-tag-matches" | "no-trash";

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
    titleKey: "noRecentProfileTitle",
    descriptionKey: "noRecentProfileDescription",
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

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface BaseProps {
  /**
   * The one accent-filled button, when the empty state has something to
   * offer. Singular by type, not by convention: DESIGN.md §2.2 allows one
   * accent fill per screen, and an `actions: [{variant}]` array would let a
   * caller write two and find out at review time, or not at all.
   *
   * This is the same move `.claude/rules` calls for elsewhere — make the
   * drift unrepresentable rather than detectable (hako
   * `jADDX0HR4wxm4m8DxDLrE`). Two calls to action mean the screen has not
   * decided what it wants.
   */
  primaryAction?: EmptyStateAction;
  /** Outlined buttons beside it. Rendered after the primary one. */
  secondaryActions?: readonly EmptyStateAction[];
}

/** Core screens name a variant and get core's own copy. */
interface VariantProps extends BaseProps {
  variant: EmptyVariant;
  icon?: never;
  title?: never;
  description?: never;
}

/**
 * Addons pass their own strings.
 *
 * An addon cannot use a `variant`: its copy lives in its own catalogue
 * (`.claude/rules/frontend-conventions.md` — "addon translation keys must only
 * live in that addon's `frontend/messages/`"), and adding a variant per addon
 * would put the addon's vocabulary into core, which
 * `.claude/rules/internal-api-policy.md` R2 exists to prevent. Nothing here
 * names an addon or a feature; it takes a title and an icon.
 */
interface DirectProps extends BaseProps {
  variant?: never;
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
}

export type EmptyStateProps = VariantProps | DirectProps;

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
          {primaryAction && (
            <Button variant="primary" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          )}
          {secondaryActions?.map((action) => (
            <Button key={action.label} variant="secondary" onClick={action.onClick}>
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
