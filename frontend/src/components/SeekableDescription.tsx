"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { parseMediaTimestamps } from "@/lib/mediaTimestamps";
import type { MediaController } from "@/lib/mediaController";

/**
 * Renders a media file's description, turning the timestamps its author
 * wrote into jumps to those positions.
 *
 * Purely presentational, and deliberately so: the text it reads is a
 * field the user edits at will, and deriving anything durable from it
 * on every save would let an unrelated edit destroy chapter data owned
 * by other producers. See the spec for the full argument.
 */
export function SeekableDescription({
  text,
  durationSeconds,
  mediaController,
}: {
  text: string;
  /** The file's length, when known, to reject out-of-range candidates. */
  durationSeconds: number | null;
  /** Null until the player publishes one, and forever if it never does. */
  mediaController: MediaController | null;
}) {
  const t = useTranslations("player");
  const segments = useMemo(
    () => parseMediaTimestamps(text, durationSeconds),
    [text, durationSeconds],
  );

  return (
    <>
      {segments.map((segment, i) =>
        segment.kind === "text" ? (
          segment.text
        ) : (
          <button
            key={i}
            type="button"
            /* No font utility: the timestamp has to read as part of the
               sentence around it, so it inherits the paragraph's size
               and family (Tailwind's preflight sets `font: inherit` on
               `button`; there is no global reset doing it for us).

               Disabled renders as ordinary body text rather than dimmed
               accent. A controller may never arrive at all — the media
               failed to load, or a provider is unreachable — and a
               timestamp that will never do anything should look like
               the prose it sits in, not like a link. */
            className="text-accent transition-colors hover:text-accent-hover disabled:cursor-default disabled:text-inherit"
            disabled={!mediaController}
            aria-label={t("seekToTime", { time: segment.text })}
            onClick={() => mediaController?.seek(segment.seconds)}
          >
            {segment.text}
          </button>
        ),
      )}
    </>
  );
}

export default SeekableDescription;
