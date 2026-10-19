/**
 * Enough of WebVTT to show captions over a video the page does not play
 * itself: timings and text. Cue settings, styling and regions are ignored.
 */

export interface Cue {
  start: number;
  end: number;
  text: string;
}

const TIMING = /^((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/;

function seconds(stamp: string): number {
  const parts = stamp.replace(",", ".").split(":").map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** Markup inside a cue (`<b>`, `<c.name>`, `<00:01.000>`) is dropped. */
function plain(text: string): string {
  return text.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

export function parseVtt(source: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = source.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => TIMING.test(line));
    if (timingIndex === -1) continue;
    const match = TIMING.exec(lines[timingIndex]);
    if (!match) continue;
    const start = seconds(match[1]);
    const end = seconds(match[2]);
    const text = plain(lines.slice(timingIndex + 1).join("\n")).trim();
    if (!(end > start) || !text) continue;
    cues.push({ start, end, text });
  }
  return cues.sort((a, b) => a.start - b.start);
}

/** Every cue showing at `time`, in start order; cues may overlap. */
export function cuesAt(cues: readonly Cue[], time: number): Cue[] {
  return cues.filter((cue) => cue.start <= time && time < cue.end);
}
