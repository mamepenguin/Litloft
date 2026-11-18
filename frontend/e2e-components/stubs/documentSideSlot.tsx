import { useEffect, useLayoutEffect, useState } from "react";

interface Target {
  fileId: string;
  page?: number;
  section?: number;
}

interface SlotProps {
  entryId?: string;
  onAvailability?: (available: boolean) => void;
  active?: boolean;
  select?: () => void;
  openInViewer?: (target: Target) => boolean;
}

export interface DocumentSideHandle {
  report: (available: boolean) => void;
  select: () => void;
  /** `null` when the host gave the entry no `openInViewer`. */
  openInViewer: (target: Target) => boolean | null;
  active: () => boolean | undefined;
  /** Reports available and selects itself in one handler, as the add-on does when generation starts. */
  startGenerating: () => void;
}

declare global {
  interface Window {
    __docSide?: Record<string, DocumentSideHandle>;
  }
}

const QUERY = new URLSearchParams(location.search);

/**
 * Stands in for a `document-side` entry such as the detailed summary. A case
 * drives it through `window.__docSide[id]`. With `docside-silent=1` it reports
 * nothing on its own, so a case can start from an unlisted tab.
 */
function makeDocumentSideSlot(id: string) {
  return function DocumentSideSlot({
    onAvailability,
    active,
    select,
    openInViewer,
  }: SlotProps) {
    const [generating, setGenerating] = useState(false);

    useLayoutEffect(() => {
      onAvailability?.(false);
    }, [onAvailability]);

    useEffect(() => {
      if (QUERY.get("docside-silent") === "1") return;
      const frame = requestAnimationFrame(() => onAvailability?.(true));
      return () => cancelAnimationFrame(frame);
    }, [onAvailability]);

    useEffect(() => {
      const handles = (window.__docSide ??= {});
      handles[id] = {
        report: (available) => onAvailability?.(available),
        select: () => select?.(),
        openInViewer: (target) => (openInViewer ? openInViewer(target) : null),
        active: () => active,
        startGenerating: () => {
          setGenerating(true);
          onAvailability?.(true);
          select?.();
        },
      };
    });

    return (
      <div
        data-testid={`fixture-doc-side-${id}`}
        data-active={active === undefined ? "unset" : String(active)}
        className="space-y-3 p-4 text-base"
      >
        {generating && <p data-testid="fixture-doc-side-generating">Generating</p>}
        {Array.from({ length: 40 }, (_, index) => (
          <p key={index}>Summary paragraph {index}</p>
        ))}
      </div>
    );
  };
}

export const DocumentSummarySlot = makeDocumentSideSlot("fixture-doc-summary");
export const DocumentPlainSlot = makeDocumentSideSlot("fixture-doc-plain");
