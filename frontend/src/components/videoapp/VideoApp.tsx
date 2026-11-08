"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { AppTabs } from "@/components/appshell/AppTabs";
import { ShelfBlock } from "@/components/appshell/ShelfBlock";
import { PageFrame } from "@/components/PageFrame";
import { DiscoverFace } from "./DiscoverFace";
import { LibraryFace } from "./LibraryFace";
import type { SortChoice } from "./labels";
import { useDiscover } from "./useDiscover";
import { useVideoApp } from "./useVideoApp";
import { VideoAppHeader } from "./VideoAppHeader";

const PANEL_ID = "video-app-panel";

export function VideoApp({ drive }: { drive: string }) {
  const t = useTranslations("videoApp");
  const state = useVideoApp(drive);
  const [sortId, setSortId] = useState<SortChoice["id"]>("newest");
  const face = state.prefs?.face;

  const discover = useDiscover({
    drive,
    params: state.params,
    hasProfile: state.hasProfile,
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
    <PageFrame width="wide" header={<VideoAppHeader drive={drive} state={state} tabs={tabs} />}>
      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={`video-app-tab-${face ?? "discover"}`}
        className="px-4 pb-6 pt-4 sm:pb-8"
      >
        {!state.ready ? (
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
            empty={state.empty}
            savedClassification={state.prefs!.classification}
            hasProfile={state.hasProfile}
            sortId={sortId}
            onClassification={(classification) => state.updatePrefs({ classification })}
            onSort={setSortId}
            onViewerRejected={state.rejectViewer}
          />
        ) : (
          <DiscoverFace
            drive={drive}
            empty={state.empty}
            hasProfile={state.hasProfile}
            continueShelf={discover.continueShelf}
            recommended={discover.recommended}
            fresh={discover.fresh}
          />
        )}
      </div>
    </PageFrame>
  );
}
