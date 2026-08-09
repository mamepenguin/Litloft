/**
 * The contract both layouts implement. Keeping one shape means the
 * container picks a presenter by input device without also deciding
 * what each one is allowed to know.
 */
import type { ReactNode } from "react";
import type { CaptionsState } from "@/lib/mediaController";

export interface MediaControlsPresenterProps {
  /** Playhead, or the drag position while the user is scrubbing. */
  displayTime: number;
  duration: number;
  bufferedFraction: number;
  paused: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  /** An ad (or similar) is playing, so file-scoped controls are meaningless. */
  interrupted: boolean;
  visible: boolean;
  isFullscreen: boolean;
  /**
   * True while the frame fakes fullscreen with position: fixed. The bar
   * then sits against the physical screen edge rather than inside the
   * page, so it has to respect the device's safe areas itself.
   */
  isPseudoFullscreen?: boolean;
  /**
   * True while the backend is drawing chrome of its own over the frame
   * — an ad, or an end screen. Anything of ours that would obscure it
   * has to stand down: those surfaces carry the skip button and the
   * links the viewer needs, and covering an ad's controls is a breach
   * of the embed terms besides.
   */
  backendOwnsFrame?: boolean;
  onTogglePlay: () => void;
  onSkip: (seconds: number) => void;
  onScrubStart: (seconds: number) => void;
  onScrubChange: (seconds: number) => void;
  onScrubEnd: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onPlaybackRateChange: (rate: number) => void;
  onToggleFullscreen: () => void;
  /** `"unavailable"` leaves every caption control out. */
  captions: CaptionsState;
  onToggleCaptions: (enabled: boolean) => void;
  /**
   * The settings panel is drawn by the layout, but its open state has
   * to reach the container, which owns the idle timer — a panel that
   * vanishes three seconds after opening is not usable.
   */
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
  /**
   * Extra rows for the settings sheet, supplied by whoever owns the
   * frame. Kept opaque: a backend may have settings core has no
   * concept of, and core should not grow a branch per backend to
   * describe them.
   */
  settingsExtra?: ReactNode;
}
