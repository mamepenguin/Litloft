"use client";

import { forwardRef, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import type { TocEntry } from "@/lib/epubReaderChannel";
import { isSelectable } from "@/lib/epubToc";

export interface EpubTocPanelProps {
  toc: readonly TocEntry[];
  currentIndex: number | null;
  onSelect: (index: number) => void;
  className?: string;
  style?: CSSProperties;
}

const MOVE_KEYS = new Set(["ArrowUp", "ArrowDown", "Home", "End"]);

export const EpubTocPanel = forwardRef<HTMLDivElement, EpubTocPanelProps>(function EpubTocPanel(
  { toc, currentIndex, onSelect, className = "", style },
  ref,
) {
  const t = useTranslations("file");
  const listRef = useRef<HTMLOListElement | null>(null);

  // Only the list scrolls to the current entry: the page and the frame box
  // around the book must not move.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const buttons = [...list.querySelectorAll<HTMLButtonElement>("button")];
    const current = currentIndex === null ? null : list.querySelector<HTMLElement>(`[data-toc-index="${currentIndex}"]`);
    if (current) {
      const top = current.offsetTop - list.offsetTop;
      if (top < list.scrollTop || top + current.offsetHeight > list.scrollTop + list.clientHeight)
        list.scrollTop = top - (list.clientHeight - current.offsetHeight) / 2;
    }
    const target =
      current instanceof HTMLButtonElement && !current.disabled
        ? current
        : buttons.find((b) => !b.disabled);
    target?.focus({ preventScroll: true });
    // Only when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLOListElement>) => {
    if (!MOVE_KEYS.has(e.key)) return;
    const enabled = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    if (enabled.length === 0) return;
    e.preventDefault();
    const at = enabled.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? enabled.length - 1
          : Math.min(Math.max((at < 0 ? 0 : at) + (e.key === "ArrowDown" ? 1 : -1), 0), enabled.length - 1);
    enabled[next].focus();
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t("epubContents")}
      data-testid="epub-toc-panel"
      data-swipe-exempt
      style={style}
      className={`flex flex-col rounded-xl border border-bg-border bg-bg-card py-2 shadow-lg ${className}`}
    >
      <ol ref={listRef} onKeyDown={onKeyDown} className="min-h-0 flex-1 overflow-y-auto">
        {toc.map((entry, i) => {
          const current = i === currentIndex;
          const selectable = isSelectable(entry);
          return (
            <li key={i}>
              <button
                type="button"
                data-toc-index={i}
                disabled={!selectable}
                aria-current={current ? "true" : undefined}
                onClick={() => onSelect(i)}
                style={{ paddingLeft: `${0.75 + Math.min(entry.depth, 6) * 1}rem` }}
                className={`flex min-h-9 w-full items-center border-l-2 pr-3 text-left text-sm transition-colors pointer-coarse:min-h-11 disabled:cursor-default disabled:text-text-muted/60 ${
                  current
                    ? "border-accent bg-bg-elevated text-text-primary"
                    : "border-transparent text-text-primary hover:bg-bg-elevated"
                }`}
              >
                <span className="min-w-0 truncate">{entry.label || t("epubUntitled")}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
});
