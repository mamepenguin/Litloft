"use client";

import Link from "next/link";
import { StickyNote } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ActiveSummaryNote } from "@/lib/api";

export function ActiveSummaryFallback({
  summaryNote,
}: {
  summaryNote: ActiveSummaryNote;
}) {
  const t = useTranslations("file");

  return (
    <section className="rounded-lg border border-bg-border bg-bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary">
        <StickyNote size={16} className="text-accent" />
        <span>{t("activeSummaryFallbackTitle")}</span>
      </div>
      <p className="text-sm text-text-muted">{t("activeSummaryFallbackBody")}</p>
      <Link
        href={`/files/${summaryNote.file_id}`}
        className="mt-3 inline-block text-sm text-accent hover:underline"
      >
        {t("activeSummaryFallbackOpen")} ({summaryNote.path})
      </Link>
    </section>
  );
}
