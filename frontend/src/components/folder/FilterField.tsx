"use client";

import {
  Check,
  FileText,
  FileType,
  Image as ImageIcon,
  Search,
  SlidersHorizontal,
  Video,
  X,
} from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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

const TYPE_ICONS: Record<TreeTypeFilter, typeof FileText> = {
  markdown: FileText,
  video: Video,
  image: ImageIcon,
  pdf: FileType,
};

// Chip is anchored at left-7 (28px) inside the relative container; the input
// pads its left side by chip width + this gap so text never overlaps.
const CHIP_LEFT_OFFSET_PX = 28;
const CHIP_TEXT_GAP_PX = 8;

interface FilterFieldProps {
  text: string;
  onTextChange: (next: string) => void;
  placeholder?: string;
  typeFilter: TreeTypeFilter | null;
  onTypeFilterChange: (next: TreeTypeFilter | null) => void;
  typeOptions?: TreeTypeFilter[];
}

/**
 * Shared text + type filter input for the tree pane and the right pane.
 * Spec: docs/superpowers/specs/2026-05-09-folder-filter-and-tree-filter.md §4
 * (chip inline 化、2026-05-09 改訂版).
 */
export function FilterField({
  text,
  onTextChange,
  placeholder,
  typeFilter,
  onTypeFilterChange,
  typeOptions,
}: FilterFieldProps) {
  const t = useTranslations("filter");
  const [localText, setLocalText] = useState(text);
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chipWrapperRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [chipWidth, setChipWidth] = useState(0);
  const menuId = useId();

  useEffect(() => {
    setLocalText(text);
  }, [text]);

  useEffect(() => {
    if (localText === text) return;
    const handle = window.setTimeout(() => {
      onTextChange(localText);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localText]);

  useEffect(() => {
    if (!open) return;
    function handlePointer(e: Event) {
      const inside =
        popoverRef.current?.contains(e.target as Node) ||
        chipWrapperRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node);
      if (!inside) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
    };
  }, [open]);

  // Measure chip width so the input's paddingLeft can avoid overlap. Use a
  // layout effect (run before paint) plus ResizeObserver so font load /
  // locale change / container resize all stay in sync — a stale offsetWidth
  // would otherwise make the input text bleed under the chip.
  useLayoutEffect(() => {
    const el = chipWrapperRef.current;
    if (!el || typeFilter === null) {
      setChipWidth(0);
      return;
    }
    const update = () => setChipWidth(el.offsetWidth);
    update();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [typeFilter]);

  const options = typeOptions ?? DEFAULT_TYPE_OPTIONS;
  const menuValues: Array<TreeTypeFilter | null> = [null, ...options];

  // Reset focus to the currently selected entry whenever the menu opens or
  // the active type changes while open — keeps keyboard focus tracking the
  // displayed selection.
  useEffect(() => {
    if (!open) {
      setFocusedIndex(-1);
      return;
    }
    const idx = menuValues.findIndex((v) => v === typeFilter);
    setFocusedIndex(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, typeFilter]);

  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    optionRefs.current[focusedIndex]?.focus();
  }, [open, focusedIndex]);

  const handleSelect = (value: TreeTypeFilter | null) => {
    onTypeFilterChange(value);
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      (chipRef.current ?? triggerRef.current)?.focus();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      setOpen(false);
      // Hand focus back to whichever element opened the menu so Tab order
      // stays predictable.
      (chipRef.current ?? triggerRef.current)?.focus();
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

  const handleClearText = () => {
    setLocalText("");
    onTextChange("");
  };

  const handleRemoveType = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onTypeFilterChange(null);
  };

  const handleChipClick = () => {
    setOpen((o) => !o);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Backspace") return;
    if (typeFilter === null) return;
    const target = e.currentTarget;
    // Linear / Slack convention: only delete the chip when the input is
    // empty AND the caret is at the start. Avoids accidentally clearing the
    // type filter when the user moves the caret to the start of existing
    // text and hits Backspace.
    if (
      target.value.length === 0 &&
      target.selectionStart === 0 &&
      target.selectionEnd === 0
    ) {
      e.preventDefault();
      onTypeFilterChange(null);
    }
  };

  const TypeIcon = typeFilter ? TYPE_ICONS[typeFilter] : null;
  const typeLabel = typeFilter ? t(TYPE_LABEL_KEYS[typeFilter]) : "";

  const renderMenu = () => (
    <div
      ref={popoverRef}
      id={menuId}
      role="menu"
      onKeyDown={handleMenuKeyDown}
      className={
        typeFilter === null
          ? "absolute right-0 top-full z-30 mt-1 min-w-[140px] rounded-2xl border border-bg-border bg-bg-primary py-1 shadow-lg"
          : "absolute left-7 top-full z-30 mt-1 min-w-[140px] rounded-2xl border border-bg-border bg-bg-primary py-1 shadow-lg"
      }
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
              isSelected ? "bg-bg-elevated text-text-primary font-medium" : "text-text-primary hover:bg-bg-elevated"
            }`}
          >
            <span className="w-4 flex-shrink-0">{isSelected && <Check size={14} />}</span>
            {label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex flex-1 items-center">
        <Search
          size={14}
          className="pointer-events-none absolute left-2 z-10 text-text-muted"
          aria-hidden
        />
        {typeFilter !== null && TypeIcon && (
          <div
            ref={chipWrapperRef}
            className="absolute left-7 z-10 flex items-center overflow-hidden rounded-full border border-bg-border bg-bg-card text-xs"
          >
            <button
              ref={chipRef}
              type="button"
              onClick={handleChipClick}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={open ? menuId : undefined}
              aria-label={t("chipChange", { type: typeLabel })}
              className="flex items-center gap-1 px-2 py-0.5 text-text-primary transition-colors hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring"
            >
              <TypeIcon size={12} className="text-text-muted" aria-hidden />
              <span>{typeLabel}</span>
            </button>
            <button
              type="button"
              onClick={handleRemoveType}
              aria-label={t("chipRemove", { type: typeLabel })}
              // Visible icon stays at 10px to keep the chip compact, but the
              // button itself is padded to ~20×20 so the click/touch target
              // is large enough without enlarging the chip footprint.
              className="flex items-center justify-center px-1.5 py-1 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring"
            >
              <X size={10} aria-hidden />
            </button>
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          style={
            typeFilter !== null && chipWidth > 0
              ? {
                  paddingLeft: `${
                    CHIP_LEFT_OFFSET_PX + chipWidth + CHIP_TEXT_GAP_PX
                  }px`,
                }
              : undefined
          }
          className="w-full rounded-2xl border border-bg-border bg-bg-card pl-7 pr-7 py-1.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-focus-ring focus:ring-1 focus:ring-focus-ring"
        />
        {localText.length > 0 && (
          <button
            type="button"
            onClick={handleClearText}
            aria-label={t("clearInput")}
            className="absolute right-1.5 z-10 flex items-center justify-center rounded-2xl p-0.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
          >
            <X size={14} />
          </button>
        )}
        {typeFilter !== null && open && renderMenu()}
      </div>

      {typeFilter === null && (
        <div className="relative flex-shrink-0">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen((o) => !o)}
            onKeyDown={handleTriggerKeyDown}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            aria-label={t("openTypeFilter")}
            className="flex items-center justify-center rounded-2xl border border-bg-border bg-bg-card p-1.5 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus-ring"
          >
            <SlidersHorizontal size={14} aria-hidden />
          </button>
          {open && renderMenu()}
        </div>
      )}
    </div>
  );
}
