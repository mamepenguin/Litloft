"use client";

import { useEffect, useRef } from "react";

import { formatDuration } from "@/lib/format";
import { scrollBehavior } from "@/lib/reducedMotion";

import type { QueueEntry } from "./queue";

interface QueueRowsProps {
  entries: readonly QueueEntry[];
  currentId: string | null;
  onSelect: (id: string) => void;
}

export function QueueRows({ entries, currentId, onSelect }: QueueRowsProps) {
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    const row = currentId ? rowRefs.current.get(currentId) : null;
    if (row && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
    }
  }, [currentId, entries]);

  return (
    <ul className="flex h-full flex-col gap-0.5 overflow-y-auto border-r border-bg-border bg-bg-card p-2">
      {entries.map((entry, index) => {
        const isCurrent = entry.id === currentId;
        return (
          <li
            key={entry.id}
            ref={(el) => {
              if (el) rowRefs.current.set(entry.id, el);
              else rowRefs.current.delete(entry.id);
            }}
          >
            <button
              type="button"
              onClick={() => onSelect(entry.id)}
              className={`flex min-h-11 w-full items-center gap-2 rounded-[10px] py-2 pr-2 pl-1.5 text-left text-xs transition-colors md:min-h-0 ${
                isCurrent
                  ? "bg-accent/10 ring-1 ring-accent/40"
                  : "hover:bg-bg-elevated"
              }`}
            >
              <span
                className={`w-[18px] flex-shrink-0 text-center font-mono text-[10px] ${
                  isCurrent ? "font-bold text-accent" : "text-text-muted/60"
                }`}
              >
                {index + 1}
              </span>
              <span
                className={`min-w-0 flex-1 truncate ${
                  isCurrent
                    ? "font-semibold text-text-primary"
                    : "text-text-muted"
                }`}
              >
                {entry.title}
              </span>
              {entry.duration !== null && (
                <span className="flex-shrink-0 text-[11px] text-text-muted">
                  {formatDuration(entry.duration)}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
