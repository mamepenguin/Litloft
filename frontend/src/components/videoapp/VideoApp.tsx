"use client";

import { Film } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/EmptyState";
import { AppTabs } from "@/components/appshell/AppTabs";
import { RetryButton } from "@/components/appshell/RetryButton";
import { ShelfBlock } from "@/components/appshell/ShelfBlock";
import { PageFrame } from "@/components/PageFrame";
import { DiscoverFace } from "./DiscoverFace";
import { LibraryFace } from "./LibraryFace";
import { useDiscover } from "./useDiscover";
import { useVideoApp } from "./useVideoApp";
import { VideoAppHeader } from "./VideoAppHeader";

const PANEL_ID = "video-app-panel";

export function VideoApp({
  drive,
  target = null,
  homeEntry,
  onTargetHandled,
}: {
  drive: string;
  /** The `?target=` value on the root route; absent on every other route. */
  target?: string | null;
  /** The key of this app's Home entry. */
  homeEntry?: string;
  /** Called once the `?target=` has been applied or ignored, to drop it from the URL. */
  onTargetHandled?: () => void;
}) {
  const t = useTranslations("videoApp");
  const state = useVideoApp(drive, target, onTargetHandled);
  const face = state.prefs?.face;

  const discover = useDiscover({
    drive,
    params: state.params,
    requests: state.requests,
    hasProfile: state.hasProfile,
    nickname: state.nickname,
    wanted: state.ready && face === "discover",
    onViewerRejected: state.rejectViewer,
  });

  const tabs = (
    <AppTabs
      label={t("tabsLabel")}
      current={face ?? "discover"}
      onSelect={(key) => state.updatePrefs({ face: key })}
      discoverLabel={t("discover")}
      libraryLabel={t("library")}
      panelId={PANEL_ID}
      idPrefix="video-app"
    />
  );

  return (
    <PageFrame
      width="wide"
      header={<VideoAppHeader drive={drive} state={state} tabs={tabs} homeEntry={homeEntry} />}
    >
      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={`video-app-tab-${face ?? "discover"}`}
        className="px-4 pb-6 pt-4 sm:pb-8"
      >
        {state.targetFailed ? (
          <RetryButton onRetry={state.retryTarget} />
        ) : state.targetUnusable ? (
          <EmptyState icon={Film} title={t("targetUnusable")} />
        ) : !state.ready ? (
          <ShelfBlock
            title=""
            view={{ status: "loading" }}
            onRetry={() => {}}
            renderItem={() => null}
          />
        ) : face === "library" ? (
          <LibraryFace
            drive={drive}
            params={state.params}
            requests={state.requests}
            empty={state.empty}
            group={state.view.group}
            hasProfile={state.hasProfile}
            sortId={state.view.sort}
            onGroup={state.setGroup}
            onSort={state.setSort}
            onViewerRejected={state.rejectViewer}
          />
        ) : (
          <DiscoverFace
            drive={drive}
            empty={state.empty || discover.empty}
            hasProfile={state.hasProfile}
            shelves={discover.shelves}
            pending={discover.pending}
            viewer={state.nickname}
          />
        )}
      </div>
    </PageFrame>
  );
}
