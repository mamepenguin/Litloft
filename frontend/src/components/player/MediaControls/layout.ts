import type { PointerMode } from "@/components/player/hooks/usePointerMode";

/**
 * Which of the three control layouts a frame gets.
 *
 * `touch` and `pointer` differ by input device; `compact` differs from
 * `pointer` by how much room there is. A touch layout is optimised for
 * "small *and* finger" — it hands skipping to a double tap and needs a
 * standalone transport button because a single tap is spoken for — so
 * it is not the answer for a small frame under a mouse.
 */
export type ControlsLayout = "touch" | "compact" | "pointer";

/**
 * Below this, the pointer row cannot lay out without being clipped by
 * the frame's `overflow: hidden`, which silently takes the settings and
 * fullscreen buttons out of reach.
 *
 * Measured in Chrome, 2026-08-29, against a frame forced to the mini
 * player's 320x180:
 *
 *   play 44 + skip 44 + skip 44 + time 72 + mute 44
 *   + volume 68 + settings 44 + fullscreen 44 + padding 16 = 432
 *
 * The time display grows by roughly 48px on a file long enough to read
 * `0:00:00 / 5:55:20`, which is where the remaining budget goes.
 *
 * Stated as the sum of its parts rather than as a round number, so
 * changing any one control makes it obvious how the threshold moves.
 */
export const COMPACT_MAX_WIDTH = 480;

/**
 * Picks a layout from the input device and the frame's measured width.
 *
 * `frameWidth` of `null` — or of `0`, which is the same thing wearing a
 * number, since no one is looking at a frame with no width — means the
 * frame has not been measured yet and resolves to `pointer`. That is
 * both the behaviour this branch had before compact existed and what
 * keeps a jsdom-rendered player (every element reports 0 there) on the
 * layout its tests were written against.
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
