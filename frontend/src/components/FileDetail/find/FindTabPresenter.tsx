"use client";

import type { RefObject, UIEvent } from "react";
import { useTranslations } from "next-intl";

import type { FindRow } from "@/lib/fileFind";

export interface FindLocator {
  place: string;
  kind?: string;
}

export interface FindChip {
  id: string;
  label: string;
  count: number;
  selected: boolean;
}

interface FindTabPresenterProps {
  listRef: RefObject<HTMLDivElement | null>;
  chips: FindChip[];
  rows: FindRow[];
  currentRow: FindRow | null;
  truncated: boolean;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  onSelectRow: (row: FindRow) => void;
  onSelectFilter: (id: string) => void;
  onFormatLocator: (row: FindRow) => FindLocator;
  rowKey: (row: FindRow, index: number) => string;
}

function Snippet({ row }: { row: FindRow }) {
  const start = row.match_start;
  const end = start + row.match_length;
  if (start < 0 || row.match_length <= 0 || end > row.snippet.length) {
    return <span>{row.snippet}</span>;
  }
  return (
    <span>
      {row.snippet.slice(0, start)}
      <mark className="bg-highlight-bg">{row.snippet.slice(start, end)}</mark>
      {row.snippet.slice(end)}
    </span>
  );
}

export function FindTabPresenter({
  listRef,
  chips,
  rows,
  currentRow,
  truncated,
  onScroll,
  onSelectRow,
  onSelectFilter,
  onFormatLocator,
  rowKey,
}: FindTabPresenterProps) {
  const t = useTranslations("find");
  return (
    <div className="flex h-full min-h-0 flex-col">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1 pb-2">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={chip.selected}
              onClick={() => onSelectFilter(chip.id)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                chip.selected
                  ? "border-accent font-semibold text-text-primary"
                  : "border-transparent text-text-muted hover:text-text-primary"
              }`}
            >
              {`${chip.label} ${chip.count}${truncated ? "+" : ""}`}
            </button>
          ))}
        </div>
      )}

      <div
        ref={listRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-auto"
      >
        <ul className="space-y-1" aria-label={t("listLabel")}>
          {rows.map((row, index) => {
            const current = row === currentRow;
            const locator = onFormatLocator(row);
            return (
              <li key={rowKey(row, index)}>
                <button
                  type="button"
                  onClick={() => onSelectRow(row)}
                  data-find-current={current ? "true" : undefined}
                  className={`grid w-full grid-cols-[4.75rem_minmax(0,1fr)] gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                    current
                      ? "bg-accent/[0.07] shadow-[inset_2px_0_0_var(--accent)]"
                      : "hover:bg-accent/5"
                  }`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span
                      className="truncate text-[13px] font-semibold tabular-nums text-text-primary"
                      title={locator.place}
                    >
                      {locator.place}
                    </span>
                    {locator.kind && (
                      <span className="text-[11px] text-text-muted">{locator.kind}</span>
                    )}
                  </span>
                  <span className="text-[13px] text-text-primary [line-break:strict]">
                    <Snippet row={row} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {truncated && (
          <p className="px-2.5 py-2 text-xs text-text-muted">
            {t("truncatedList")}
          </p>
        )}
      </div>
    </div>
  );
}
