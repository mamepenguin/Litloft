/**
 * The contract both layouts implement. Keeping one shape means the
 * container picks a presenter by input device without also deciding
 * what each one is allowed to know.
 */
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
  onTogglePlay: () => void;
  onSkip: (seconds: number) => void;
  onScrubStart: (seconds: number) => void;
  onScrubChange: (seconds: number) => void;
  onScrubEnd: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onPlaybackRateChange: (rate: number) => void;
  onToggleFullscreen: () => void;
}
