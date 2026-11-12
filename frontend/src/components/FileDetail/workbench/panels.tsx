"use client";

import type { ReactNode } from "react";

import type { SlotEntry } from "@/lib/addons";
import type { FileItem } from "@/types";
import type { MediaController } from "@/lib/mediaController";
import type { FileDetailSurface } from "@/lib/fileDetailShell";
import { slotEntryLabel } from "@/lib/slotLabel";
import { ActiveSummaryHost } from "../../ActiveSummaryHost";
import { ChaptersPanel } from "../../ChaptersPanel";
import { SlotEntryRenderer } from "../../AddonSlot";
import { slotAvailabilityKey, type SlotAvailability } from "../hooks/useSlotAvailability";

/** The inspector's own tab ids. A `player-side` entry may not take one. */
export const CORE_TAB_IDS = ["info", "find", "pages", "chapters", "related"];

/** Ids the core draws as a panel, on the surface where it applies. */
export const CORE_PANEL_IDS = ["active-summary", "chapters"];

const RESERVED_IDS = new Set([...CORE_TAB_IDS, ...CORE_PANEL_IDS]);

interface CoreRenderProps {
  fileId: string;
  drive: string;
  mediaController: MediaController | null;
  chaptersVersion: number;
  onChaptersResolved: (count: number) => void;
  onAvailability: (available: boolean) => void;
  active: boolean;
}

interface CorePanelContext {
  surface: FileDetailSurface;
  hasPlayer: boolean;
  file: FileItem;
}

export interface CorePanelDefinition {
  id: string;
  labelKey: string;
  priority: number;
  applies: (context: CorePanelContext) => boolean;
  render: (props: CoreRenderProps) => ReactNode;
}

export const CORE_PANELS: CorePanelDefinition[] = [
  {
    id: "active-summary",
    labelKey: "workbench.note",
    priority: 40,
    applies: ({ hasPlayer }) => hasPlayer,
    render: ({ fileId, drive, onAvailability }) => (
      <ActiveSummaryHost
        fileId={fileId}
        drive={drive}
        onAvailability={onAvailability}
      />
    ),
  },
  {
    id: "chapters",
    labelKey: "inspector.tabs.chapters",
    priority: 50,
    applies: ({ surface, hasPlayer }) =>
      hasPlayer && surface === "collection",
    render: ({
      fileId,
      mediaController,
      chaptersVersion,
      onChaptersResolved,
      onAvailability,
    }) => (
      <ChaptersPanel
        fileId={fileId}
        mediaController={mediaController}
        refreshToken={chaptersVersion}
        onResolved={(count) => {
          onChaptersResolved(count);
          onAvailability(count > 0);
        }}
        className="h-full"
      />
    ),
  },
];

export interface WorkbenchPanelItem {
  id: string;
  label: string;
  priority: number;
  core: boolean;
  key: string;
  available: boolean;
  render: (active: boolean) => ReactNode;
}

interface BuildWorkbenchPanelsArgs {
  surface: FileDetailSurface;
  hasPlayer: boolean;
  file: FileItem;
  fileId: string;
  drive: string;
  slotEntries: SlotEntry[];
  availability: SlotAvailability;
  translate: (key: string) => string;
  addonSlotProps: Record<string, unknown>;
  mediaController: MediaController | null;
  chaptersVersion: number;
  onChaptersResolved: (count: number) => void;
}

/**
 * Core panels and slot entries share one priority scale; the core panel wins
 * a tie, and two slot entries keep the catalogue's order.
 */
export function buildWorkbenchPanels({
  surface,
  hasPlayer,
  file,
  fileId,
  drive,
  slotEntries,
  availability,
  translate,
  addonSlotProps,
  mediaController,
  chaptersVersion,
  onChaptersResolved,
}: BuildWorkbenchPanelsArgs): WorkbenchPanelItem[] {
  if (!hasPlayer) return [];

  const context: CorePanelContext = { surface, hasPlayer, file };
  const coreItems = CORE_PANELS.filter((panel) => panel.applies(context)).map(
    (panel) => {
      const key = slotAvailabilityKey("core", panel.id);
      const onAvailability = availability.reporterFor(key);
      return {
        id: panel.id,
        label: translate(panel.labelKey),
        priority: panel.priority,
        core: true,
        key,
        available: availability.reportedValue(key) === true,
        render: (active: boolean) =>
          panel.render({
            fileId,
            drive,
            mediaController,
            chaptersVersion,
            onChaptersResolved,
            onAvailability,
            active,
          }),
      };
    },
  );

  const slotItems = slotEntries
    .filter((entry) => !RESERVED_IDS.has(entry.id))
    .map((entry) => {
      const key = slotAvailabilityKey("player-side", entry.id);
      const onAvailability = availability.reporterFor(key);
      return {
        id: entry.id,
        label: slotEntryLabel(entry, translate),
        priority: entry.priority,
        core: false,
        key,
        available:
          !availability.isPending(key) && availability.isAvailable(key),
        render: (active: boolean) => (
          <SlotEntryRenderer
            entry={entry}
            props={{
              ...addonSlotProps,
              fillHeight: true,
              labelledByHost: true,
              onAvailability,
              active,
            }}
            onRendered={availability.renderedFor(key)}
          />
        ),
      };
    });

  return [...coreItems, ...slotItems].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.core === b.core) return 0;
    return a.core ? -1 : 1;
  });
}
