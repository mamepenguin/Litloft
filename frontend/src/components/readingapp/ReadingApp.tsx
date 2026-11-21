"use client";

import { BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/EmptyState";
import {
  CardFileMenuProvider,
  discoverListKey,
  useCardFileMenu,
} from "@/components/appshell/CardFileMenu";
import { AppTabs } from "@/components/appshell/AppTabs";
import { NameFilter } from "@/components/appshell/NameFilter";
import { useLibraryFilters } from "@/components/appshell/libraryFilters";
import { RetryButton } from "@/components/appshell/RetryButton";
import { ShelfBlock } from "@/components/appshell/ShelfBlock";
import { PageFrame } from "@/components/PageFrame";
import { builtinApps } from "@/lib/builtinApps";
import { DiscoverFace } from "./DiscoverFace";
import { LibraryFace } from "./LibraryFace";
import { ReadingAppHeader } from "./ReadingAppHeader";
import { useDiscover } from "./useDiscover";
import { useReadingApp } from "./useReadingApp";

const PANEL_ID = "reading-app-panel";

const noop = () => {};

export function ReadingApp({
  drive,
  target = null,
  homeEntry,
  position = null,
  onTargetHandled,
  onTargetChosen,
  onChooseFolder = noop,
}: {
  drive: string;
  /** The `?target=` value on the root route; absent on every other route. */
  target?: string | null;
  /** The key of this app's Home entry. */
  homeEntry?: string;
  /** The folder the URL holds; `null` at the top of the target. */
  position?: string | null;
  /** Called once the `?target=` has been applied or ignored, to drop it from the URL. */
  onTargetHandled?: () => void;
  /** Called when the target menu picks another target, to drop the position. */
  onTargetChosen?: () => void;
  /** Navigate to a folder of the Library; `null` is its top. */
  onChooseFolder?: (folder: string | null) => void;
}) {
  const t = useTranslations("readingApp");
  const state = useReadingApp(drive, target, onTargetHandled, onTargetChosen);
  const face = state.prefs?.face;
  const filters = useLibraryFilters("reading", drive, state.hasProfile);
  const showName =
    face === "library" && state.ready && !state.empty && state.count !== 0;

  const discover = useDiscover({
    drive,
    params: state.params,
    requests: state.requests,
    hasProfile: state.hasProfile,
    wanted: state.ready && face === "discover",
    onViewerRejected: state.rejectViewer,
  });

  const cardMenu = useCardFileMenu({
    scope: JSON.stringify([
      drive,
      state.requests.key,
      state.targetId,
      state.nickname,
      state.hasProfile,
      state.params,
    ]),
    hasProfile: state.hasProfile,
    continueListKeys: [discoverListKey("continue")],
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
      trailing={
        showName ? (
          <NameFilter
            value={filters.name}
            onApply={filters.setName}
            onLeavePending={filters.setName}
          />
        ) : undefined
      }
    />
  );

  return (
    <CardFileMenuProvider value={cardMenu.context}>
      <PageFrame
        width="wide"
        header={<ReadingAppHeader drive={drive} state={state} tabs={tabs} homeEntry={homeEntry} />}
      >
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
              position={position}
              group={state.view.group}
              sortId={state.view.sort}
              libraryPath={builtinApps.find((app) => app.id === "reading")!.route(drive)}
              onChooseFolder={onChooseFolder}
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
      {cardMenu.menu}
    </CardFileMenuProvider>
  );
}
