"use client";

import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { AppHeader } from "@/components/appshell/AppHeader";
import { READING_BASE_KINDS, resolveReadingTarget } from "@/lib/readingAppTarget";
import type { SmartFolder } from "@/types/smartFolder";
import type { ReadingAppState } from "./useReadingApp";

function isUsableTarget(folder: SmartFolder): boolean {
  return resolveReadingTarget(folder).usable;
}

export function ReadingAppHeader({
  drive,
  state,
  title,
  breadcrumb,
  actions,
  tabs,
}: {
  drive: string;
  state: ReadingAppState;
  title?: string;
  breadcrumb?: ReactNode;
  /** Beside the Target button. */
  actions?: ReactNode;
  tabs?: ReactNode;
}) {
  const t = useTranslations("readingApp");
  const locale = useLocale();

  const countDetail =
    state.count === null
      ? null
      : t("bookCount", {
          count: state.count,
          formatted: new Intl.NumberFormat(locale).format(state.count),
        });

  return (
    <AppHeader
      drive={drive}
      icon={BookOpen}
      title={title ?? t("title")}
      countDetail={countDetail}
      breadcrumb={breadcrumb}
      actions={actions}
      tabs={tabs}
      target={{
        drive,
        app: "reading",
        name: state.ready ? (state.folder?.name ?? t("allBooks")) : null,
        folders: state.smartFolders,
        selectedId: state.folder?.id ?? "default",
        currentCount: state.count,
        label: t("target"),
        defaultLabel: t("allBooks"),
        unavailableLabel: t("targetUnavailable"),
        defaultTargetTypes: READING_BASE_KINDS,
        isUsable: isUsableTarget,
        onChoose: state.chooseTarget,
        onRetryFolders: state.retrySmartFolders,
      }}
    />
  );
}
