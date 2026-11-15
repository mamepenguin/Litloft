"use client";

import { useContext } from "react";
import { Play } from "lucide-react";
import { useTranslations } from "next-intl";

import { AddonSlot } from "./AddonSlot";
import { useAddonSlots } from "./AddonSlotsProvider";
import { ActionMenuItem } from "./ActionMenuItem";
import { BAR_WIDE, MenuSeparator } from "./ToolbarMenu";
import { Button } from "./Button";
import {
  SMART_COLLECTION_ACTIONS_SLOT,
  SmartFolderActionsContext,
} from "./smartFolderActions";

/**
 * The results bar's 再生 while Play's condition holds. Below `md` it is the
 * `…` sheet's first row instead, so the wrapper is the folder page's.
 */
export function SmartFolderPlayButton() {
  const tc = useTranslations("common");
  const actions = useContext(SmartFolderActionsContext);

  if (!actions || !actions.canPlay) return null;

  return (
    <div {...BAR_WIDE}>
      <Button
        variant="secondary"
        size="sm"
        disabled={actions.playing}
        onClick={actions.play}
      >
        <Play size={16} />
        {tc("play")}
      </Button>
    </div>
  );
}

export function SmartFolderPlayMenuItems({ closeMenu }: { closeMenu: () => void }) {
  const tc = useTranslations("common");
  const actions = useContext(SmartFolderActionsContext);

  if (!actions || !actions.canPlay) return null;

  return (
    <div className="md:hidden" role="presentation">
      <ActionMenuItem
        icon={Play}
        label={tc("play")}
        onClick={() => {
          actions.play();
          closeMenu();
        }}
      />
      <MenuSeparator />
    </div>
  );
}

interface SmartCollectionActionsSlotProps {
  drive: string;
  closeMenu: () => void;
  /** The saved block emitted no rule of its own: this slot supplies it. */
  leadingSeparator?: boolean;
}

export function SmartCollectionActionsSlot({
  drive,
  closeMenu,
  leadingSeparator = false,
}: SmartCollectionActionsSlotProps) {
  const actions = useContext(SmartFolderActionsContext);
  const { hasSlot } = useAddonSlots();

  if (
    !actions ||
    !actions.current ||
    actions.changed ||
    !hasSlot(SMART_COLLECTION_ACTIONS_SLOT)
  ) {
    return null;
  }

  return (
    <>
      {leadingSeparator && <MenuSeparator />}
      <AddonSlot
        id={SMART_COLLECTION_ACTIONS_SLOT}
        layout="stack"
        props={{
          drive,
          smartCollectionId: actions.current.id,
          smartCollectionName: actions.current.name,
          closeMenu,
        }}
      />
    </>
  );
}
