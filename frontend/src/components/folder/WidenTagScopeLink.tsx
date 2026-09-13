"use client";

import Link from "next/link";
import { HardDrive } from "lucide-react";
import { useTranslations } from "next-intl";

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
      // The floor is appended, never part of what a caller replaces.
      className={`${
        className ??
        "flex items-center gap-2 rounded-2xl border border-bg-border bg-bg-card px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-elevated"
      } min-w-0 pointer-coarse:min-h-11`}
    >
      <HardDrive size={16} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{t("searchWholeDrive")}</span>
    </Link>
  );
}
