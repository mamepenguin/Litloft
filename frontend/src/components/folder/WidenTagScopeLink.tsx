"use client";

import Link from "next/link";
import { HardDrive } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * The drive-wide destination for a tag currently scoped to a folder.
 *
 * Built once by FolderBrowser and handed to both consumers (the toolbar
 * header and the empty state), so they cannot disagree about when the
 * affordance is offered or where it goes.
 */
export interface WidenTagScope {
  tagName: string;
  href: string;
}

export function buildWidenTagScope(
  drive: string,
  tagName: string | null | undefined,
): WidenTagScope | null {
  if (!tagName) return null;
  return {
    tagName,
    href: `/drive/${encodeURIComponent(drive)}?tag=${encodeURIComponent(tagName)}`,
  };
}

/**
 * "Search the whole drive" — the explicit opt-in out of folder scope.
 *
 * The empty state is the case this matters most for: "no matches in this
 * folder" with no way to widen is a dead end.
 */
export function WidenTagScopeLink({
  scope,
  className,
}: {
  scope: WidenTagScope;
  className?: string;
}) {
  const t = useTranslations("toolbar");
  return (
    <Link
      href={scope.href}
      className={
        className ??
        "flex items-center gap-2 rounded-2xl border border-bg-border bg-bg-card px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-elevated"
      }
    >
      <HardDrive size={16} aria-hidden="true" />
      <span>{t("searchWholeDrive")}</span>
    </Link>
  );
}
