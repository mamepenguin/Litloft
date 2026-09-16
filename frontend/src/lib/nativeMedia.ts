"use client";

/**
 * The shell plays the media; this keeps a shadow of what it reports so the
 * synchronous `MediaController` contract can be answered without waiting for a
 * round trip.
 */

import {
  isNativeShell,
  postToShell,
  subscribeToShell,
  type MediaSource,
  type MediaState,
  type MediaStatus,
} from "./nativeBridge";

export interface MediaShadow {
  time: number;
  duration: number;
  paused: boolean;
  rate: number;
  volume: number;
  buffered: number;
  ended: boolean;
  status: MediaStatus;
}

const INITIAL: MediaShadow = Object.freeze({
  time: 0,
  duration: 0,
  paused: true,
  rate: 1,
  volume: 1,
  buffered: 0,
  ended: false,
  status: "loading",
});

export class MediaChannel {
  private shadow: MediaShadow = INITIAL;
  private unsubscribe: (() => void) | null = null;

  /**
   * The file this channel is for. A report carrying any other id is about
   * something else; none is accepted before a load or after an unload.
   */
  private loadId: string | null = null;

  /**
   * A seek is the one command whose effect the viewer sees before the shell
   * can confirm it, so its position stands until the shell reports that seek
   * as reached — or reports that the file failed, when it never will be.
   */
  private pendingSeek: { seekId: string; time: number } | null = null;

  private readySent = false;
  private failedSent = false;

  /** Fires once when the shell reports the file has run out. */
  onEnded: (() => void) | null = null;

  /** Fires once per file, when the shell reports it can be played. */
  onReady: (() => void) | null = null;

  /** Fires once per file, when the shell reports it cannot be played. */
  onFailed: (() => void) | null = null;

  constructor() {
    this.unsubscribe = subscribeToShell((message) => {
      if (message.type === "media.state") this.apply(message);
    });
  }

  read(): MediaShadow {
    return this.shadow;
  }

  load(source: MediaSource): void {
    this.shadow = INITIAL;
    this.pendingSeek = null;
    this.readySent = false;
    this.failedSent = false;
    this.loadId = crypto.randomUUID();
    postToShell({ type: "media.load", loadId: this.loadId, ...source });
  }

  play(): void {
    if (this.loadId === null) return;
    this.shadow = { ...this.shadow, paused: false };
    postToShell({ type: "media.play", loadId: this.loadId });
  }

  pause(): void {
    if (this.loadId === null) return;
    this.shadow = { ...this.shadow, paused: true };
    postToShell({ type: "media.pause", loadId: this.loadId });
  }

  seek(time: number): void {
    if (this.loadId === null) return;
    const seekId = crypto.randomUUID();
    this.pendingSeek = { seekId, time };
    this.shadow = { ...this.shadow, time, ended: false };
    postToShell({ type: "media.seek", loadId: this.loadId, seekId, time });
  }

  /** The shell may refuse a rate, so the shadow waits for what it reports. */
  setRate(rate: number): void {
    postToShell({ type: "media.setRate", rate });
  }

  setVolume(volume: number): void {
    postToShell({ type: "media.setVolume", volume });
  }

  /**
   * The last reading is kept: whatever tears down next still reads the
   * position to save it.
   */
  unload(): void {
    if (this.loadId === null) return;
    postToShell({ type: "media.unload", loadId: this.loadId });
    this.loadId = null;
    this.pendingSeek = null;
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private apply(state: MediaState): void {
    if (this.loadId === null || state.loadId !== this.loadId) return;

    const pending = this.pendingSeek;
    const holding = pending !== null && state.seekId !== pending.seekId && state.status !== "failed";
    if (!holding) this.pendingSeek = null;

    const justEnded = state.ended && !this.shadow.ended;

    this.shadow = {
      // Every other field is the freshest reading there is, so only the
      // position waits for the seek.
      time: holding ? pending.time : state.time,
      duration: state.duration,
      paused: state.paused,
      rate: state.rate,
      volume: state.volume,
      buffered: state.buffered,
      ended: state.ended,
      status: state.status,
    };

    if (!this.readySent && state.status === "ready") {
      this.readySent = true;
      this.onReady?.();
    }
    if (!this.failedSent && state.status === "failed") {
      this.failedSent = true;
      this.onFailed?.();
    }
    if (justEnded) this.onEnded?.();
  }
}

export function createMediaChannel(): MediaChannel | null {
  return isNativeShell() ? new MediaChannel() : null;
}
