"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import { formatDuration } from "@/lib/format";
import type { MediaController } from "@/lib/mediaController";
import { useMediaClock } from "@/lib/mediaClock";

const RATES = [1, 1.25, 1.5, 1.75, 2];

/**
 * A transport for audio, where there is no frame to lay controls over: the
 * three existing layouts all draw white on a video.
 */
export function AudioTransport({ mc }: { mc: MediaController | null }) {
  const t = useTranslations("player");
  const { currentTime, duration, paused } = useMediaClock(mc);
  const [scrubbing, setScrubbing] = useState<number | null>(null);

  const position = scrubbing ?? currentTime;
  const seekable = duration > 0;

  const commit = useCallback(
    (seconds: number) => {
      mc?.seek(seconds);
      setScrubbing(null);
    },
    [mc],
  );

  const cycleRate = useCallback(() => {
    if (!mc) return;
    const next = RATES[(RATES.indexOf(mc.getPlaybackRate()) + 1) % RATES.length];
    mc.setPlaybackRate(next);
  }, [mc]);

  return (
    <div className="flex w-full max-w-md items-center gap-3">
      <button
        type="button"
        onClick={() => mc?.togglePlay()}
        disabled={!mc}
        aria-label={paused ? t("play") : t("pause")}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-text-primary transition-colors hover:bg-sand-hover disabled:opacity-40"
      >
        {paused ? <Play size={20} /> : <Pause size={20} />}
      </button>

      <input
        type="range"
        min={0}
        max={seekable ? duration : 0}
        step="any"
        value={seekable ? Math.min(position, duration) : 0}
        disabled={!seekable}
        aria-label={t("seek")}
        onChange={(event) => setScrubbing(Number(event.target.value))}
        onPointerUp={(event) => commit(Number(event.currentTarget.value))}
        onKeyUp={(event) => commit(Number(event.currentTarget.value))}
        className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-bg-border accent-accent disabled:cursor-not-allowed"
      />

      <span className="shrink-0 text-xs tabular-nums text-text-muted">
        {formatDuration(position)}
        <span aria-hidden="true"> / </span>
        {formatDuration(seekable ? duration : null)}
      </span>

      <button
        type="button"
        onClick={cycleRate}
        disabled={!mc}
        aria-label={t("speed")}
        className="shrink-0 rounded-lg px-2 py-1 text-xs tabular-nums text-text-muted transition-colors hover:bg-bg-elevated disabled:opacity-40"
      >
        {mc ? `${mc.getPlaybackRate()}x` : "1x"}
      </button>
    </div>
  );
}
