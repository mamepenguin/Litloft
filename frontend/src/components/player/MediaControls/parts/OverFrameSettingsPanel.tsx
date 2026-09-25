"use client";

import type { ReactNode } from "react";

import { DismissScrim } from "@/components/DismissScrim";
import { useShortcuts } from "@/hooks/useShortcuts";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";

export type OverFramePlacement = "sheet" | "popover";

export type OverFrameAnchor = "top" | "bottom";

export interface OverFrameSettingsPanelProps {
  placement?: OverFramePlacement;
  anchor?: OverFrameAnchor;
  onClose: () => void;
  closeLabel: string;
  testId: string;
  backdropTestId: string;
  children: ReactNode;
}

/**
 * Rendered *inside* the frame rather than portalled to the body: the
 * frame is `position: fixed` while faking fullscreen on Apple mobile,
 * so anything outside it would end up behind the content.
 */
export function OverFrameSettingsPanel({
  placement = "sheet",
  anchor = "bottom",
  onClose,
  closeLabel,
  testId,
  backdropTestId,
  children,
}: OverFrameSettingsPanelProps) {
  const isPopover = placement === "popover";

  // The `onKeyDown` below only sees keys whose React path runs through
  // this element, and opening the panel leaves focus on the trigger, so
  // Escape would reach the frame's shortcut that closes the viewer.
  // Through the shortcut stack rather than a `document` listener, which
  // does not know what is stacked above it.
  useShortcuts(
    "over-frame-settings",
    closeLabel,
    [{ key: "escape", label: closeLabel, handler: onClose }],
    true,
    OVERLAY_PRIORITY,
  );
  // The sheet always rises from the bottom edge, wherever its trigger
  // is: a thumb reaches the bottom of a phone and not the top of it.
  const fromTop = isPopover && anchor === "top";

  return (
    <div
      data-player-chrome=""
      className={[
        "absolute inset-0 z-20 flex flex-col",
        fromTop ? "justify-start" : "justify-end",
        isPopover ? "items-end" : "",
      ].join(" ")}
    >
      <DismissScrim
        onDismiss={onClose}
        data-testid={backdropTestId}
        label={closeLabel}
        // The frame, not the viewport: a viewport-sized scrim would leave
        // the frame while it fakes fullscreen on Apple mobile.
        className={`absolute inset-0 ${isPopover ? "" : "bg-black/40"}`}
      >
        <div
          data-testid={testId}
          data-placement={placement}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          className={[
            "relative flex flex-col gap-2 bg-black/85 px-3 pb-3 pt-3 text-white",
            isPopover
              ? // Written out per branch rather than composed, so Tailwind
                // can see both class names in the source.
                fromTop
                ? "mt-14 mr-2 w-64 rounded-2xl"
                : "mb-16 mr-2 w-64 rounded-2xl"
              : "rounded-t-2xl",
            // The frame is only as tall as its content. The popover's own
            // offset comes out of that budget, or a narrow window pushes its
            // top rows off the frame.
            isPopover ? "max-h-[calc(100%-5rem)]" : "max-h-full",
            "overflow-y-auto",
            fromTop ? "animate-slide-down-bar" : "animate-slide-up-bar",
          ].join(" ")}
        >
          {children}
        </div>
      </DismissScrim>
    </div>
  );
}
