"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, Check } from "lucide-react";
import type { SortField, SortOrder } from "@/types";

interface SortOption {
  label: string;
  sort: SortField;
  order: SortOrder;
}

const sortOptions: SortOption[] = [
  { label: "新しい順", sort: "created_at", order: "desc" },
  { label: "古い順", sort: "created_at", order: "asc" },
  { label: "タイトル A→Z", sort: "title", order: "asc" },
  { label: "タイトル Z→A", sort: "title", order: "desc" },
  { label: "サイズ 大→小", sort: "file_size", order: "desc" },
  { label: "サイズ 小→大", sort: "file_size", order: "asc" },
  { label: "いいね 多→少", sort: "likes", order: "desc" },
  { label: "いいね 少→多", sort: "likes", order: "asc" },
];

interface SortButtonProps {
  sort: SortField;
  order: SortOrder;
  onChange: (sort: SortField, order: SortOrder) => void;
}

export function SortButton({ sort, order, onChange }: SortButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const isActive = sort !== "created_at" || order !== "desc";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((s) => !s)}
        className={`flex items-center gap-1.5 rounded-md p-2 text-sm transition-colors ${
          isActive
            ? "bg-accent/20 text-accent"
            : "text-text-muted hover:text-text-primary"
        }`}
        aria-label="ソート"
      >
        <ArrowDownUp size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[180px] rounded-xl border border-bg-border bg-bg-primary py-1 shadow-xl animate-fade-in-scale origin-top-right">
          {sortOptions.map((opt) => {
            const selected = opt.sort === sort && opt.order === order;
            return (
              <button
                key={`${opt.sort}-${opt.order}`}
                onClick={() => {
                  onChange(opt.sort, opt.order);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? "text-accent"
                    : "text-text-primary hover:bg-bg-elevated"
                }`}
              >
                <span className="w-4 flex-shrink-0">
                  {selected && <Check size={14} />}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
