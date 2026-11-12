"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import { WORKBENCH_COLUMNS_MIN_REM, WORKBENCH_MIN_REM } from "@/lib/layoutSizes";
import type { WorkbenchPanelItem } from "./panels";

interface WorkbenchProps {
  items: WorkbenchPanelItem[];
  stored: readonly string[];
  onToggle: (id: string) => void;
  onClose: (id: string) => void;
  actions?: ReactNode;
}

export function shownPanelIds(
  items: WorkbenchPanelItem[],
  stored: readonly string[],
): string[] {
  return items
    .filter((item) => item.available && stored.includes(item.id))
    .map((item) => item.id);
}

export function Workbench({
  items,
  stored,
  onToggle,
  onClose,
  actions,
}: WorkbenchProps) {
  const t = useTranslations("workbench");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(false);

  // Measured, not a container query: the panels can hold a <video> and a
  // cross-origin iframe, and a containment context around either renders the
  // subtree rotated on iOS Safari.
  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const measure = () => {
      const rootFontSize =
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
        16;
      setWide(node.clientWidth >= WORKBENCH_COLUMNS_MIN_REM * rootFontSize);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const available = items.filter((item) => item.available);
  const shown = shownPanelIds(items, stored);

  return (
    <div
      ref={rootRef}
      data-workbench-width={wide ? "wide" : "narrow"}
      className="media-detail-workbench"
    >
      {(available.length > 0 || actions != null) && (
        <div className="media-detail-workbench-row">
          <div
            role="group"
            aria-label={t("panels")}
            className="media-detail-workbench-toggles"
          >
            {available.map((item) => {
              const pressed = stored.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => onToggle(item.id)}
                  className={`workbench-toggle${pressed ? " is-on" : ""}`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          {actions != null && (
            <div
              data-preview-actions="true"
              className="media-detail-workbench-actions empty:hidden"
            >
              {actions}
            </div>
          )}
        </div>
      )}

      <div
        className="media-detail-workbench-grid"
        hidden={shown.length === 0}
        style={
          shown.length > 0
            ? { minHeight: `${WORKBENCH_MIN_REM}rem` }
            : undefined
        }
      >
        {items.map((item) => {
          const itemShown = item.available && stored.includes(item.id);
          const headingId = `workbench-panel-${item.id}`;
          return (
            <section
              key={item.id}
              hidden={!itemShown}
              aria-labelledby={itemShown ? headingId : undefined}
              className="media-detail-workbench-panel"
            >
              {itemShown && (
                <div className="media-detail-workbench-panel-header">
                  <h2 id={headingId} className="text-sm font-semibold">
                    {item.label}
                  </h2>
                  <button
                    type="button"
                    aria-label={t("close", { label: item.label })}
                    onClick={() => onClose(item.id)}
                    className="media-detail-workbench-close"
                  >
                    <X size={16} aria-hidden />
                  </button>
                </div>
              )}
              <div className="media-detail-workbench-body">
                {item.render(itemShown)}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
