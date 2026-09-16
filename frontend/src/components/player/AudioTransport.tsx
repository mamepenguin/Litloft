"use client";

import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { formatDuration } from "@/lib/format";
import type { MediaController } from "@/lib/mediaController";
import { useMediaClock } from "@/lib/mediaClock";

export const PLAYBACK_RATES = [1, 1.25, 1.5, 1.75, 2];

/**
 * A transport for audio, where there is no frame to lay controls over: the
 * three existing layouts all draw white on a video.
 */
export function AudioTransport({
  mc,
  failed = false,
  waiting = false,
}: {
  mc: MediaController | null;
  failed?: boolean;
  waiting?: boolean;
}) {
  const t = useTranslations("player");
  const { currentTime, duration, paused } = useMediaClock(mc);
  const [scrubbing, setScrubbing] = useState<number | null>(null);

  // The clock does not carry the rate, so it is read whenever the clock moves.
  // A chosen rate reaches the player after a round trip, and the readings in
  // between still carry a rate it replaced; those are not shown. Any other
  // reading is what the player settled on.
  const [reportedRate, setReportedRate] = useState(1);
  const [choice, setChoice] = useState<{ rate: number; replaced: number[] } | null>(null);
  useEffect(() => {
    if (!mc) return;
    const reported = mc.getPlaybackRate();
    setReportedRate(reported);
    setChoice((held) =>
      held && held.rate !== reported && held.replaced.includes(reported) ? held : null,
    );
  }, [mc, currentTime, paused, duration]);
  const shownRate = choice?.rate ?? reportedRate;

  const usable = mc !== null && !failed;
  const position = scrubbing ?? currentTime;
  const seekable = usable && duration > 0;

  const commit = useCallback(
    (seconds: number) => {
      mc?.seek(seconds);
      setScrubbing(null);
    },
    [mc],
  );

  const cycleRate = useCallback(() => {
    if (!mc) return;
    const index = PLAYBACK_RATES.indexOf(shownRate);
    const next = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length];
    mc.setPlaybackRate(next);
    setChoice({ rate: next, replaced: [...(choice?.replaced ?? []), shownRate] });
  }, [mc, shownRate, choice]);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-2">
      <div className="flex w-full items-center gap-3">
        <button
          type="button"
          onClick={() => mc?.togglePlay()}
          disabled={!usable}
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
          // A drag the system takes over ends without a pointerup.
          onPointerCancel={() => setScrubbing(null)}
          onBlur={() => setScrubbing(null)}
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
          disabled={!usable}
          aria-label={t("speed")}
          className="shrink-0 rounded-lg px-2 py-1 text-xs tabular-nums text-text-muted transition-colors hover:bg-bg-elevated disabled:opacity-40"
        >
          {`${shownRate}x`}
        </button>
      </div>
      {waiting && !failed && (
        <p role="status" className="text-xs text-text-muted">
          {t("buffering")}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-xs text-danger">
          {t("loadFailed")}
        </p>
      )}
    </div>
  );
}
