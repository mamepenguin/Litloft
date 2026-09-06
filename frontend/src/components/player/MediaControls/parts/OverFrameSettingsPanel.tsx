"use client";

import type { ReactNode } from "react";

import { useShortcuts } from "@/hooks/useShortcuts";
import { OVERLAY_PRIORITY } from "@/lib/shortcuts";

/**
 * `sheet` spans the frame's width and rises from its bottom edge — the
 * touch layout, where the button that opens it is a thumb's reach from
 * there. `popover` is the mouse layout's shape: a narrow panel parked
 * above that button, so what is behind it stays visible.
 */
export type OverFramePlacement = "sheet" | "popover";

/**
 * Which edge the popover parks against — the edge the bar holding its
 * trigger is on. The player's controls are at the bottom of the frame;
 * the full-screen viewers' are at the top, and a panel that ignores the
 * difference opens in the far corner from the button that was pressed.
 */
export type OverFrameAnchor = "top" | "bottom";

export interface OverFrameSettingsPanelProps {
  placement?: OverFramePlacement;
  anchor?: OverFrameAnchor;
  onClose: () => void;
  /** Accessible name for the area that dismisses the panel. */
  closeLabel: string;
  testId: string;
  backdropTestId: string;
  children: ReactNode;
}

/**
 * The frame-local settings panel: placement, backdrop, height budget,
 * entrance, and the two ways out.
 *
 * The shell only. It knows nothing about what the rows say, which is
 * why the video player and the two image viewers can share it —
 * `DESIGN.md` §Over-video chrome describes one shape for all of them,
 * and three hand-rolled copies of it would drift.
 *
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

  // Escape belongs to the panel while the panel is up.
  //
  // The `onKeyDown` below only sees keys whose React path runs through
  // this element, and opening the panel leaves focus on the trigger — a
  // sibling of this portal, not a child. So the key went straight past
  // to whatever the frame had registered, which in both image viewers is
  // the shortcut that closes the viewer: a reader dismissing a
  // three-option menu lost their place in the folder. A native
  // `<select>` swallowed Escape, so this was a regression against what
  // it replaced.
  //
  // Through the shortcut stack rather than a listener of its own. A
  // listener does not know what is stacked above it, and this panel is
  // the newest thing on screen precisely when it should answer — which
  // is what `OVERLAY_PRIORITY` says, and what a raw `document` listener
  // could only approximate by racing.
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
      className={[
        "absolute inset-0 z-20 flex flex-col",
        fromTop ? "justify-start" : "justify-end",
        isPopover ? "items-end" : "",
      ].join(" ")}
    >
      <button
        type="button"
        data-testid={backdropTestId}
        aria-label={closeLabel}
        // A mouse user can see the whole frame at once and the panel
        // covers very little of it, so there is nothing to dim; the
        // backdrop stays only to catch the click that dismisses it.
        className={`absolute inset-0 ${isPopover ? "" : "bg-black/40"}`}
        onClick={onClose}
      />

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
            ? // Clear of the bar the button that opened this lives in.
              // Written out per branch rather than composed, so Tailwind
              // can see both class names in the source.
              fromTop
              ? "mt-14 mr-2 w-64 rounded-2xl"
              : "mb-16 mr-2 w-64 rounded-2xl"
            : "rounded-t-2xl",
          // The frame is only as tall as its content — on a phone that
          // can be barely 200px. The panel is sized to fit inside that;
          // this is the guard for the cases it still cannot, rather
          // than letting rows fall off the bottom edge unreachable.
          // The popover's own offset comes out of that budget, or a
          // narrow window pushes its top rows off the frame instead.
          isPopover ? "max-h-[calc(100%-5rem)]" : "max-h-full",
          "overflow-y-auto",
          // From the edge it hangs off. A panel parked under the top bar
          // that rises from below starts a panel-height down the frame,
          // in open space, and travels toward its own trigger — the
          // anchor's own defect over again, in time instead of space.
          fromTop ? "animate-slide-down-bar" : "animate-slide-up-bar",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}
