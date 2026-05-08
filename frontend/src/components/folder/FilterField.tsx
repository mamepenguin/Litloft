"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { TreeTypeFilter } from "@/types";

const DEFAULT_TYPE_OPTIONS: TreeTypeFilter[] = ["markdown", "video", "image", "pdf"];
const DEBOUNCE_MS = 300;

const TYPE_LABEL_KEYS: Record<TreeTypeFilter, string> = {
  markdown: "type.markdown",
  video: "type.video",
  image: "type.image",
  pdf: "type.pdf",
};

interface FilterFieldProps {
  text: string;
  onTextChange: (next: string) => void;
  placeholder?: string;
  typeFilter: TreeTypeFilter | null;
  onTypeFilterChange: (next: TreeTypeFilter | null) => void;
  typeOptions?: TreeTypeFilter[];
  onClear?: () => void;
}

/**
 * Shared text + type filter input for the tree pane and the right pane.
 * Spec: docs/superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md §4.
 */
export function FilterField({
  text,
  onTextChange,
  placeholder,
  typeFilter,
  onTypeFilterChange,
  typeOptions,
  onClear,
}: FilterFieldProps) {
  const t = useTranslations("filter");
  const [localText, setLocalText] = useState(text);
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Keep local text synced with parent when the parent resets it
  // (e.g. folder navigation, clear button).
  useEffect(() => {
    setLocalText(text);
  }, [text]);

  // Debounce text input by 300ms before bubbling to the parent.
  useEffect(() => {
    if (localText === text) return;
    const handle = window.setTimeout(() => {
      onTextChange(localText);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
    // onTextChange identity may shift; we intentionally key on the value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localText]);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const options = typeOptions ?? DEFAULT_TYPE_OPTIONS;
  // The full menu list including the leading "All" entry; we walk this
  // array with the keyboard so indices stay stable.
  const menuValues: Array<TreeTypeFilter | null> = [null, ...options];
  const triggerLabel = typeFilter ? t(TYPE_LABEL_KEYS[typeFilter]) : t("type.all");
  const showClear = localText.length > 0 || typeFilter !== null;

  // When opening, focus the currently selected option so keyboard
  // navigation starts from a sensible place.
  useEffect(() => {
    if (!open) {
      setFocusedIndex(-1);
      return;
    }
    const idx = menuValues.findIndex((v) => v === typeFilter);
    setFocusedIndex(idx >= 0 ? idx : 0);
    // We intentionally only react to opening, not to typeFilter changes
    // while the menu is already open (keyboard movement owns focus then).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Move DOM focus when focusedIndex changes (keyboard navigation only).
  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    optionRefs.current[focusedIndex]?.focus();
  }, [open, focusedIndex]);

  const handleSelect = (value: TreeTypeFilter | null) => {
    onTypeFilterChange(value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key === "Tab") {
      // Let focus leave naturally; just close.
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => (i + 1) % menuValues.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => (i <= 0 ? menuValues.length - 1 : i - 1));
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const value = menuValues[focusedIndex];
      if (value !== undefined) handleSelect(value);
      return;
    }
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const handleClear = () => {
    setLocalText("");
    onTextChange("");
    onTypeFilterChange(null);
    onClear?.();
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="relative flex flex-1 items-center">
        <Search
          size={14}
          className="pointer-events-none absolute left-2 text-text-muted"
          aria-hidden
        />
        <input
          type="text"
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-bg-border bg-bg-card pl-7 pr-7 py-1.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        {showClear && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={t("clearInput")}
            className="absolute right-1.5 flex items-center justify-center rounded-2xl p-0.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div ref={popoverRef} className="relative flex-shrink-0">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          onKeyDown={handleTriggerKeyDown}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`flex items-center gap-1 rounded-2xl border border-bg-border bg-bg-card px-2 py-1.5 text-sm transition-colors hover:bg-bg-elevated ${
            typeFilter !== null ? "text-accent" : "text-text-muted"
          }`}
        >
          <span>{triggerLabel}</span>
          <ChevronDown size={14} aria-hidden />
        </button>
        {open && (
          <div
            role="menu"
            onKeyDown={handleMenuKeyDown}
            className="absolute right-0 top-full z-30 mt-1 min-w-[140px] rounded-2xl border border-bg-border bg-bg-primary py-1 shadow-xl"
          >
            {menuValues.map((value, idx) => {
              const isSelected = value === typeFilter;
              const label = value === null ? t("type.all") : t(TYPE_LABEL_KEYS[value]);
              return (
                <button
                  key={value ?? "__all__"}
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={focusedIndex === idx ? 0 : -1}
                  onClick={() => handleSelect(value)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                    isSelected ? "text-accent" : "text-text-primary hover:bg-bg-elevated"
                  }`}
                >
                  <span className="w-4 flex-shrink-0">
                    {isSelected && <Check size={14} />}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
