"use client";

import { useLayoutEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useSelectedFile } from "@/hooks/useSelectedFile";
import { getThumbnailUrl } from "@/lib/api";
import type { CollectionItemEntry } from "@/types";

interface CollectionItemsPaneProps {
  items: CollectionItemEntry[];
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (itemId: number) => void;
}

/**
 * Left-aside content for the collection detail page. Substitutes for
 * ``FolderTreePane`` inside the shared ``<TwoPaneLayout>`` shell, so the
 * top-left ``<TreeToggle>`` controls a single "show/hide the left pane"
 * concept whether the right pane is in folder context or collection
 * context.
 *
 * Spec ``2026-05-12-playlist-to-collection.md`` PR-B redo.
 *
 * Reorder controls are intentionally always visible (no
 * ``group-hover:flex`` reveal). Mobile / touch devices cannot trigger a
 * hover state, and keyboard users benefit from tab-reachable controls.
 * The trade-off is a slightly denser row on desktop; the icons are
 * compact and the row already truncates the title, so the visual cost
 * is small.
 *
 * Reorder also animates via FLIP (capture rects before update, animate
 * from delta back to zero after the new layout settles) so users get a
 * visual cue that the change happened.
 */
export function CollectionItemsPane({
  items,
  onMoveUp,
  onMoveDown,
  onRemove,
}: CollectionItemsPaneProps) {
  const t = useTranslations("collection");
  const { fileId, selectFile } = useSelectedFile();

  // FLIP: track each row's DOM node by item id, capture its bounding
  // rect after every commit, and on the next commit animate any row
  // whose top shifted. Newly-mounted rows (e.g. just added) have no
  // previous rect, so they skip the animation. Removed rows have
  // already unmounted so they're never animated either — only rows
  // that survive a re-order get the slide.
  //
  // Subsequent reorders also need to cancel any in-flight animation
  // before measuring — ``getBoundingClientRect()`` reflects active
  // transforms, so reading it mid-animation would yield the visually
  // offset rect instead of the layout position and break the
  // delta calculation on the next swap (regression seen 2026-05-12).
  const rowRefs = useRef(new Map<number, HTMLLIElement>());
  const prevRectsRef = useRef(new Map<number, DOMRect>());
  const animationsRef = useRef(new Map<number, Animation>());

  useLayoutEffect(() => {
    // 1. Cancel any in-flight animations so the elements snap back to
    //    their layout position before we measure.
    for (const anim of animationsRef.current.values()) {
      anim.cancel();
    }
    animationsRef.current.clear();

    // 2. Measure the post-commit layout position for every current row.
    const newRects = new Map<number, DOMRect>();
    for (const [id, el] of rowRefs.current) {
      newRects.set(id, el.getBoundingClientRect());
    }

    // 3. For each row that survived, animate from its previous rect
    //    back to the new rect (FLIP: First, Last, Invert, Play).
    const prev = prevRectsRef.current;
    for (const [id, prevRect] of prev) {
      const newRect = newRects.get(id);
      if (!newRect) continue;
      const dy = prevRect.top - newRect.top;
      if (dy === 0) continue;
      const el = rowRefs.current.get(id);
      if (!el || typeof el.animate !== "function") continue;
      const anim = el.animate(
        [
          { transform: `translateY(${dy}px)` },
          { transform: "translateY(0)" },
        ],
        { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" },
      );
      animationsRef.current.set(id, anim);
      anim.finished
        .then(() => {
          if (animationsRef.current.get(id) === anim) {
            animationsRef.current.delete(id);
          }
        })
        .catch(() => {
          // cancel() rejects ``anim.finished`` with AbortError — drop.
        });
    }

    // 4. Save the measured layout rects (not a fresh
    //    getBoundingClientRect, which would now include the freshly
    //    applied transform) for the next reorder.
    prevRectsRef.current = newRects;
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col border-r border-bg-border bg-bg-card">
        <div className="flex flex-1 items-center justify-center p-4 text-xs text-text-muted">
          {t("empty")}
        </div>
      </div>
    );
  }

  return (
    <ul className="flex h-full flex-col gap-0.5 overflow-y-auto border-r border-bg-border bg-bg-card p-2">
      {items.map((item, index) => {
        const isCurrent = item.file.id === fileId;
        return (
          <li
            key={item.id}
            ref={(el) => {
              if (el) rowRefs.current.set(item.id, el);
              else rowRefs.current.delete(item.id);
            }}
            className={`flex items-center gap-1 rounded-lg px-1.5 py-1 transition-colors ${
              isCurrent
                ? "bg-accent/10 ring-1 ring-accent/40"
                : "hover:bg-bg-elevated"
            }`}
          >
            <button
              type="button"
              onClick={() => selectFile(item.file.id)}
              className={`flex min-w-0 flex-1 items-center gap-2 text-left text-sm ${
                isCurrent ? "text-text-primary" : "text-text-muted"
              }`}
            >
              <span
                className={`w-5 flex-shrink-0 text-center font-mono text-[10px] ${
                  isCurrent ? "text-accent" : "text-text-muted/60"
                }`}
              >
                {index + 1}
              </span>
              {item.file.has_thumbnail ? (
                <img
                  src={getThumbnailUrl(item.file.id)}
                  alt=""
                  className="h-6 w-6 flex-shrink-0 rounded object-cover"
                />
              ) : (
                <span className="h-6 w-6 flex-shrink-0 rounded bg-bg-elevated" />
              )}
              <span className="min-w-0 flex-1 truncate text-xs">
                {item.file.title}
              </span>
            </button>
            <div className="flex flex-shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveUp(index);
                }}
                disabled={index === 0}
                className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-bg-elevated hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label={t("moveUp")}
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveDown(index);
                }}
                disabled={index === items.length - 1}
                className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-bg-elevated hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label={t("moveDown")}
              >
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.id);
                }}
                className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-bg-elevated hover:text-danger"
                aria-label={t("removeItem")}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
