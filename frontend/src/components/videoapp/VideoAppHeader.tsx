"use client";

import type { ReactNode } from "react";
import { Film } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { AppHeader } from "@/components/appshell/AppHeader";
import { resolveVideoTarget } from "@/lib/videoAppTarget";
import type { SmartFolder } from "@/types/smartFolder";
import type { VideoAppState } from "./useVideoApp";

const VIDEO_KINDS = ["video"] as const;

function isUsableTarget(folder: SmartFolder): boolean {
  return resolveVideoTarget(folder).usable;
}

export function VideoAppHeader({
  drive,
  state,
  title,
  breadcrumb,
  actions,
  tabs,
  homeEntry,
}: {
  drive: string;
  state: VideoAppState;
  title?: string;
  breadcrumb?: ReactNode;
  /** Below the tabs on a phone, beside the Target at `sm` and wider. */
  actions?: ReactNode;
  tabs?: ReactNode;
  /** The key of this app's Home entry. */
  homeEntry?: string;
}) {
  const t = useTranslations("videoApp");
  const locale = useLocale();

  const countDetail =
    state.count === null
      ? null
      : t("videoCount", {
          count: state.count,
          formatted: new Intl.NumberFormat(locale).format(state.count),
        });

  return (
    <AppHeader
      drive={drive}
      icon={Film}
      title={title ?? t("title")}
      countDetail={countDetail}
      breadcrumb={breadcrumb}
      actions={actions}
      tabs={tabs}
      target={{
        drive,
        app: "video",
        homeEntry: state.targetKnown ? homeEntry : undefined,
        name: state.targetKnown ? (state.targetName ?? t("allVideos")) : null,
        folders: state.smartFolders,
        collections: { list: state.collections, retry: state.retryCollections },
        selectedId: state.targetId,
        currentCount: state.count,
        label: t("target"),
        defaultLabel: t("allVideos"),
        unavailableLabel: t("targetUnavailable"),
        defaultTargetTypes: VIDEO_KINDS,
        isUsable: isUsableTarget,
        onChoose: state.chooseTarget,
        onRetryFolders: state.retrySmartFolders,
      }}
    />
  );
}
