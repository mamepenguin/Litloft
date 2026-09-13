import type { PointerMode } from "@/components/player/hooks/usePointerMode";

/**
 * A touch layout is optimised for "small *and* finger" — it hands
 * skipping to a double tap and needs a standalone transport button
 * because a single tap is spoken for — so it is not the answer for a
 * small frame under a mouse.
 */
export type ControlsLayout = "touch" | "compact" | "pointer";

/**
 * Below this, the pointer row cannot lay out without being clipped by
 * the frame's `overflow: hidden`, which silently takes the settings and
 * fullscreen buttons out of reach.
 *
 *   play 44 + skip 44 + skip 44 + time 72 + mute 44
 *   + volume 68 + settings 44 + fullscreen 44 + padding 16 = 432
 *
 * The time display grows by roughly 48px on a file long enough to read
 * `0:00:00 / 5:55:20`, which is where the remaining budget goes.
 */
export const COMPACT_MAX_WIDTH = 480;

/**
 * `frameWidth` of `null` — or of `0`, which is the same thing wearing a
 * number — means the frame has not been measured yet.
 */
export function pickControlsLayout(
  pointerMode: PointerMode,
  frameWidth: number | null,
): ControlsLayout {
  // A finger needs the larger targets and the gestures at every width;
  // the touch layout already fits a phone, so narrowness adds nothing.
  if (pointerMode === "coarse") return "touch";
  // `unknown` keeps the pointer family, as it does everywhere else: it
  // is the one that works without gestures.
  if (!frameWidth) return "pointer";
  return frameWidth < COMPACT_MAX_WIDTH ? "compact" : "pointer";
}
