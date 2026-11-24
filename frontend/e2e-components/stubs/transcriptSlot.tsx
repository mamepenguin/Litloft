import { useEffect, useLayoutEffect, useState } from "react";

interface SlotProps {
  onAvailability?: (available: boolean) => void;
}

/**
 * Stands in for the intelligence addon's transcript: its module cannot load
 * over `file://`, and its content arrives a frame after the mount, as a fetch
 * would.
 */
export function TranscriptSlot({ onAvailability }: SlotProps) {
  const [lines, setLines] = useState<number[] | null>(null);

  // As the addon itself does: `false` before paint, so a host that reads
  // silence as yes never draws it for a frame it is about to remove.
  useLayoutEffect(() => {
    onAvailability?.(false);
  }, [onAvailability]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setLines(Array.from({ length: 160 }, (_, index) => index));
      onAvailability?.(true);
    });
    return () => {
      cancelAnimationFrame(frame);
      onAvailability?.(false);
    };
  }, [onAvailability]);

  if (!lines) return null;
  return (
    <div data-testid="fixture-transcript" className="space-y-2 p-4 text-sm">
      {lines.map((index) => (
        <p key={index}>Transcript line {index}</p>
      ))}
    </div>
  );
}
