"use client";

import type { RefObject, UIEvent } from "react";
import { useTranslations } from "next-intl";

import type { FindRow } from "@/lib/fileFind";

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
  onFormatLocator: (row: FindRow) => string;
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
            return (
              <li key={rowKey(row, index)}>
                <button
                  type="button"
                  onClick={() => onSelectRow(row)}
                  data-find-current={current ? "true" : undefined}
                  className={`flex w-full flex-col rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-bg-elevated ${
                    current ? "bg-bg-elevated" : ""
                  }`}
                >
                  <span className="text-text-primary [line-break:strict]">
                    <Snippet row={row} />
                  </span>
                  <span className="text-xs text-text-muted">
                    {onFormatLocator(row)}
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
