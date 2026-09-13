"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, Timer } from "lucide-react";

import { usePointerMode } from "@/components/player/hooks/usePointerMode";
import { OverFrameSettingsPanel } from "@/components/player/MediaControls/parts/OverFrameSettingsPanel";
import { INTERVAL_OPTIONS } from "@/lib/slideshow";

export interface SlideshowIntervalMenuProps {
  value: number;
  onChange: (seconds: number) => void;
  frameRef: RefObject<HTMLElement | null>;
  label: string;
  closeLabel: string;
  formatSeconds: (seconds: number) => string;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Over-frame chrome rather than a `<select>`: a `<select>` is sized by its
 * widest option and drawn by the OS, so it matches nothing else in the row.
 *
 * The panel is portalled into the frame rather than rendered where the
 * button sits: it lays itself out with `absolute inset-0`, and the
 * chrome bar that holds the button is itself absolutely positioned, so
 * left in place the panel would cover the bar instead of the frame.
 */
export function SlideshowIntervalMenu({
  value,
  onChange,
  frameRef,
  label,
  closeLabel,
  formatSeconds,
  onOpenChange,
}: SlideshowIntervalMenuProps) {
  const [open, setOpen] = useState(false);
  const setOpenAndReport = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  // Report the one close the callback cannot see: this component going
  // away with the panel still up. The hold lives in `useImageViewer`,
  // which outlives this component, so without this the flag latches on
  // and the chrome never withdraws again for the life of the page.
  // Only when it was actually open.
  const reportRef = useRef(onOpenChange);
  reportRef.current = onOpenChange;
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(
    () => () => {
      if (openRef.current) reportRef.current?.(false);
    },
    [],
  );
  const pointerMode = usePointerMode();
  // `unknown` means matchMedia answered neither query. The popover is the
  // safer guess there: it is reachable by tap, where a sheet sized for a
  // thumb covers a mouse user's whole frame.
  const placement = pointerMode === "coarse" ? "sheet" : "popover";

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpenAndReport(!open)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <Timer size={16} aria-hidden="true" />
        <span className="tabular-nums">{formatSeconds(value)}</span>
      </button>

      {open &&
        frameRef.current &&
        createPortal(
          <OverFrameSettingsPanel
            placement={placement}
            // The viewers' chrome bar is at the top of the frame, so the
            // popover parks under it.
            anchor="top"
            onClose={() => setOpenAndReport(false)}
            closeLabel={closeLabel}
            testId="slideshow-interval-panel"
            backdropTestId="slideshow-interval-backdrop"
          >
            <div role="radiogroup" aria-label={label}>
              <div className="px-1 pb-1.5 text-xs font-medium text-white/70">
                {label}
              </div>
              <div className="flex flex-wrap gap-1">
                {INTERVAL_OPTIONS.map((seconds) => {
                  const checked = seconds === value;
                  return (
                    <button
                      key={seconds}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      className={[
                        "inline-flex h-11 items-center justify-center gap-1 rounded-2xl px-2.5",
                        "text-sm tabular-nums transition-colors motion-reduce:transition-none",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                        checked
                          ? "bg-white/20 font-medium"
                          : "hover:bg-white/10",
                      ].join(" ")}
                      onClick={() => {
                        onChange(seconds);
                        setOpenAndReport(false);
                      }}
                    >
                      {checked && <Check size={14} aria-hidden="true" />}
                      {formatSeconds(seconds)}
                    </button>
                  );
                })}
              </div>
            </div>
          </OverFrameSettingsPanel>,
          frameRef.current,
        )}
    </>
  );
}
