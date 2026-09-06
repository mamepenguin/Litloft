"use client";

import { Clock, File, FilePlus, Search, RefreshCw, Star, Tag, ThumbsUp, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button, buttonClass } from "./Button";

/**
 * Exported so a test can draw every one of them.
 *
 * A union type cannot be enumerated at runtime, which is why three of these
 * were covered and seven were not — and why a key renamed here but not in the
 * catalogue reached `develop` with the suite green. The array is the single
 * source: `EmptyVariant` is derived from it, so a variant cannot be added to
 * one and missed by the other.
 */
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

/**
 * Something to do, or somewhere to go.
 *
 * The two are not interchangeable: a destination rendered as a `<button>`
 * cannot be middle-clicked, copied, or opened in a new tab, and the one
 * call to action this component has that *is* a destination — widening a
 * tag filter to the whole drive — was previously drawn outside the
 * component with its own hand-written accent recipe, sitting under a
 * `-mt-8` that pulled it up into the space the actions row now occupies.
 */
export type EmptyStateAction =
  | { label: string; onClick: () => void; href?: never }
  | { label: string; href: string; onClick?: never };

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

function renderAction(action: EmptyStateAction, variant: "primary" | "secondary") {
  return action.href !== undefined ? (
    <Link key={action.label} href={action.href} className={buttonClass({ variant })}>
      {action.label}
    </Link>
  ) : (
    <Button key={action.label} variant={variant} onClick={action.onClick}>
      {action.label}
    </Button>
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
      {/* Explicit, unlike `PageTabs`, and for the same reason as `PageHeader`:
          the icon sits outside the `<h2>`, so no accessible-name assertion can
          reach it and `aria-hidden` is the only thing that governs whether it
          is announced. `PageTabs` can leave this to lucide-react because its
          icon is inside the link, where the link's name is the real check. */}
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
