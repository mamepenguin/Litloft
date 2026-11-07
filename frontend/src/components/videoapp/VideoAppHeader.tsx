"use client";

import type { ReactNode } from "react";
import { Film } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { PageHeader } from "@/components/PageHeader";
import { TargetMenu } from "./TargetMenu";
import type { VideoAppState } from "./useVideoApp";

export function VideoAppHeader({
  drive,
  state,
  title,
  breadcrumb,
  actions,
  tabs,
}: {
  drive: string;
  state: VideoAppState;
  title?: string;
  breadcrumb?: ReactNode;
  /** Beside the Target button. */
  actions?: ReactNode;
  tabs?: ReactNode;
}) {
  const t = useTranslations("videoApp");
  const tc = useTranslations("common");
  const locale = useLocale();

  const scope =
    state.count === null
      ? drive
      : tc("driveScope", {
          drive,
          detail: t("videoCount", {
            count: state.count,
            formatted: new Intl.NumberFormat(locale).format(state.count),
          }),
        });

  return (
    <PageHeader
      titleIcon={Film}
      title={title ?? t("title")}
      breadcrumb={breadcrumb}
      scope={scope}
      actions={
        <>
          {actions}
          <TargetMenu
            drive={drive}
            name={state.ready ? (state.folder?.name ?? t("allVideos")) : null}
            folders={state.smartFolders.status === "loaded" ? state.smartFolders.data : []}
            selectedId={state.folder?.id ?? "default"}
            currentCount={state.count}
            onChoose={state.chooseTarget}
          />
        </>
      }
      tabs={tabs}
    />
  );
}
