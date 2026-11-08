"use client";

import { PageTabs } from "@/components/PageTabs";
import type { AppFace } from "@/lib/appPrefs";

export interface AppTabsProps {
  current: AppFace;
  onSelect: (face: AppFace) => void;
  label: string;
  discoverLabel: string;
  libraryLabel: string;
  panelId: string;
  idPrefix: string;
}

export function AppTabs({
  current,
  onSelect,
  label,
  discoverLabel,
  libraryLabel,
  panelId,
  idPrefix,
}: AppTabsProps) {
  return (
    <PageTabs
      label={label}
      current={current}
      onSelect={(key) => onSelect(key as AppFace)}
      items={[
        {
          key: "discover",
          label: discoverLabel,
          controls: panelId,
          id: `${idPrefix}-tab-discover`,
        },
        {
          key: "library",
          label: libraryLabel,
          controls: panelId,
          id: `${idPrefix}-tab-library`,
        },
      ]}
    />
  );
}
