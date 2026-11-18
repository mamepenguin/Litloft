import type { WatchedRange } from "@/types";
import { RESUME_THRESHOLD } from "@/lib/playbackProgress";

function fraction(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function CardProgress({
  position,
  duration,
  ranges,
  trackClassName,
  fillClassName,
}: {
  position: number;
  duration: number;
  ranges?: WatchedRange[];
  trackClassName: string;
  fillClassName: string;
}) {
  if (!(duration > 0)) return null;

  const watched = ranges && ranges.length > 0 ? ranges : null;
  const tick =
    watched !== null &&
    position > RESUME_THRESHOLD &&
    position < duration - RESUME_THRESHOLD;

  return (
    <>
      <div className={`absolute inset-x-0 bottom-0 ${trackClassName}`}>
        {watched === null ? (
          <div
            data-testid="progress-fill"
            className={`h-full ${fillClassName}`}
            style={{ width: `${fraction(position / duration) * 100}%` }}
          />
        ) : (
          watched.map((range, index) => (
            <div
              key={index}
              data-testid="watched-range"
              className={`absolute inset-y-0 ${fillClassName}`}
              style={{
                left: `${fraction(range.start / duration) * 100}%`,
                width: `${(fraction(range.end / duration) - fraction(range.start / duration)) * 100}%`,
              }}
            />
          ))
        )}
      </div>
      {tick && (
        <div
          data-testid="resume-tick"
          className="absolute bottom-0 h-[10px] w-[3px] -translate-x-1/2 rounded-t-[2px] bg-white"
          style={{
            left: `${fraction(position / duration) * 100}%`,
            boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.5)",
          }}
        />
      )}
    </>
  );
}
