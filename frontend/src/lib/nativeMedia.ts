"use client";

/**
 * The shell plays the media; this keeps a shadow of what it reports so the
 * synchronous `MediaController` contract can be answered without waiting for a
 * round trip.
 */

import {
  isNativeShell,
  nextSequence,
  postToShell,
  subscribeToShell,
  type MediaSource,
  type MediaCommand,
  type MediaTick,
} from "./nativeBridge";

export interface MediaShadow {
  time: number;
  duration: number;
  paused: boolean;
  rate: number;
  volume: number;
  buffered: number;
  ended: boolean;
}

const INITIAL: MediaShadow = Object.freeze({
  time: 0,
  duration: 0,
  paused: true,
  rate: 1,
  volume: 1,
  buffered: 0,
  ended: false,
});

export class MediaChannel {
  private shadow: MediaShadow = INITIAL;
  private unsubscribe: (() => void) | null = null;

  /**
   * A seek is the one command whose effect the viewer sees before the shell
   * can confirm it, so its value stands until a reading taken after it lands.
   * Everything else is read back from the shell rather than assumed.
   */
  private pendingSeek: { seq: number; time: number } | null = null;

  /**
   * The load this channel is for. A reading below it was taken before the
   * shell switched files, so it describes some other file; none is accepted
   * before a load or after an unload.
   */
  private loadSeq: number | null = null;

  /** Fires once when the shell reports the file has run out. */
  onEnded: (() => void) | null = null;

  /**
   * Fires once per file, on the first reading with a usable length — the
   * shell's equivalent of a media element's loaded metadata.
   */
  onReady: (() => void) | null = null;
  private readySent = false;

  constructor() {
    this.unsubscribe = subscribeToShell((message) => {
      if (message.type === "media.tick") this.apply(message);
    });
  }

  read(): MediaShadow {
    return this.shadow;
  }

  load(source: MediaSource): void {
    this.shadow = INITIAL;
    this.pendingSeek = null;
    this.readySent = false;
    this.loadSeq = this.send({ type: "media.load", ...source });
  }

  play(): void {
    this.shadow = { ...this.shadow, paused: false };
    this.send({ type: "media.play" });
  }

  pause(): void {
    this.shadow = { ...this.shadow, paused: true };
    this.send({ type: "media.pause" });
  }

  seek(time: number): void {
    const seq = this.send({ type: "media.seek", time });
    this.pendingSeek = { seq, time };
    this.shadow = { ...this.shadow, time, ended: false };
  }

  /** The shell may refuse a rate, so the shadow waits for what it reports. */
  setRate(rate: number): void {
    this.send({ type: "media.setRate", rate });
  }

  setVolume(volume: number): void {
    this.send({ type: "media.setVolume", volume });
  }

  /**
   * The last reading is kept: whatever tears down next still reads the
   * position to save it. The shell answers an unload with a tick of its own,
   * which would otherwise overwrite that reading with zeros.
   */
  unload(): void {
    this.send({ type: "media.unload" });
    this.loadSeq = null;
    this.pendingSeek = null;
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private send(command: MediaCommand): number {
    const seq = nextSequence();
    postToShell({ ...command, seq });
    return seq;
  }

  private apply(tick: MediaTick): void {
    if (this.loadSeq === null || tick.appliedSeq < this.loadSeq) return;

    // `appliedSeq` only rises, so once a seek has landed no later tick can
    // fall behind it again and the pending value stops mattering on its own.
    const pending = this.pendingSeek;
    const stale = pending !== null && tick.appliedSeq < pending.seq;

    const justEnded = tick.ended && !this.shadow.ended;

    this.shadow = {
      // A tick from before the seek carries the old position. The rest of it
      // is still the freshest reading there is, so only this field waits.
      time: stale ? pending!.time : tick.time,
      duration: tick.duration,
      paused: tick.paused,
      rate: tick.rate,
      volume: tick.volume,
      buffered: tick.buffered,
      ended: tick.ended,
    };

    if (!this.readySent && tick.duration > 0) {
      this.readySent = true;
      this.onReady?.();
    }
    if (justEnded) this.onEnded?.();
  }
}

export function createMediaChannel(): MediaChannel | null {
  return isNativeShell() ? new MediaChannel() : null;
}
