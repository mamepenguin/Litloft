"use client";

import { BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/EmptyState";
import { AppTabs } from "@/components/appshell/AppTabs";
import { RetryButton } from "@/components/appshell/RetryButton";
import { ShelfBlock } from "@/components/appshell/ShelfBlock";
import { PageFrame } from "@/components/PageFrame";
import { DiscoverFace } from "./DiscoverFace";
import { LibraryFace } from "./LibraryFace";
import { ReadingAppHeader } from "./ReadingAppHeader";
import { useDiscover } from "./useDiscover";
import { useReadingApp } from "./useReadingApp";

const PANEL_ID = "reading-app-panel";

export function ReadingApp({ drive }: { drive: string }) {
  const t = useTranslations("readingApp");
  const state = useReadingApp(drive);
  const face = state.prefs?.face;

  const discover = useDiscover({
    drive,
    params: state.params,
    requests: state.requests,
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
        {state.targetFailed ? (
          <RetryButton onRetry={state.retryTarget} />
        ) : state.targetUnusable ? (
          <EmptyState icon={BookOpen} title={t("targetUnusable")} />
        ) : !state.ready ? (
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
            requests={state.requests}
            empty={state.empty}
            hasProfile={state.hasProfile}
            group={state.view.group}
            sortId={state.view.sort}
            onGroup={state.setGroup}
            onSort={state.setSort}
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
