"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { AppTabs } from "@/components/appshell/AppTabs";
import { ShelfBlock } from "@/components/appshell/ShelfBlock";
import { PageFrame } from "@/components/PageFrame";
import { DiscoverFace } from "./DiscoverFace";
import { LibraryFace } from "./LibraryFace";
import type { SortChoice } from "./labels";
import { ReadingAppHeader } from "./ReadingAppHeader";
import { useDiscover } from "./useDiscover";
import { useReadingApp } from "./useReadingApp";

const PANEL_ID = "reading-app-panel";

export function ReadingApp({ drive }: { drive: string }) {
  const t = useTranslations("readingApp");
  const state = useReadingApp(drive);
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
      idPrefix="reading-app"
    />
  );

  return (
    <PageFrame width="wide" header={<ReadingAppHeader drive={drive} state={state} tabs={tabs} />}>
      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={`reading-app-tab-${face ?? "discover"}`}
        className="px-4 pb-6 pt-4 sm:pb-8"
      >
        {!state.ready ? (
          <ShelfBlock
            title=""
            view={{ status: "loading" }}
            onRetry={() => {}}
            book
            renderItem={() => null}
          />
        ) : face === "library" ? (
          <LibraryFace
            drive={drive}
            params={state.params}
            empty={state.empty}
            hasProfile={state.hasProfile}
            group={state.group}
            sortId={sortId}
            onGroup={state.setGroup}
            onSort={setSortId}
            onViewerRejected={state.rejectViewer}
          />
        ) : (
          <DiscoverFace
            drive={drive}
            empty={state.empty}
            hasProfile={state.hasProfile}
            continueShelf={discover.continueShelf}
            notRead={discover.notRead}
            fresh={discover.fresh}
          />
        )}
      </div>
    </PageFrame>
  );
}
