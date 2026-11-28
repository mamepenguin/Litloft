"use client";

import Link from "next/link";
import { Repeat, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export type QueuePaneStatus = "ready" | "loading" | "failed";

interface QueuePaneProps {
  name: string;
  /** The queue's own destination; the pane's name is plain text without one. */
  href?: string;
  /** Not drawn on a collection with no file open. */
  showPosition?: boolean;
  position?: number | null;
  total?: number | null;
  loop: boolean;
  onToggleLoop: () => void;
  /** The × that ends the queue; a collection has none. */
  onClose?: () => void;
  status?: QueuePaneStatus;
  children?: ReactNode;
}

const POSITION_UNKNOWN = "–";

export function QueuePane({
  name,
  href,
  showPosition = false,
  position,
  total,
  loop,
  onToggleLoop,
  onClose,
  status = "ready",
  children,
}: QueuePaneProps) {
  const t = useTranslations("playback");
  const tFile = useTranslations("file");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-2 border-b border-r border-bg-border bg-bg-card px-4 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          {href ? (
            <Link
              href={href}
              className="block truncate text-[15px] font-semibold text-text-primary hover:text-accent"
            >
              {name}
            </Link>
          ) : (
            <span className="block truncate text-[15px] font-semibold text-text-primary">
              {name}
            </span>
          )}
          {showPosition && (
            <div className="mt-0.5 text-xs tabular-nums text-text-muted">
              {tFile("positionOf", {
                position: position ?? POSITION_UNKNOWN,
                total: total ?? POSITION_UNKNOWN,
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleLoop}
          aria-pressed={loop}
          aria-label={loop ? t("loopOff") : t("loopOn")}
          title={loop ? t("loopOff") : t("loopOn")}
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] transition-colors pointer-coarse:h-11 pointer-coarse:w-11 ${
            loop
              ? "bg-accent/10 text-accent"
              : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
          }`}
        >
          <Repeat size={17} />
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("queueEnd")}
            title={t("queueEnd")}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary pointer-coarse:h-11 pointer-coarse:w-11"
          >
            <X size={17} />
          </button>
        )}
      </div>
      {status === "loading" ? (
        <div className="border-r border-bg-border p-4 text-xs text-text-muted">
          {t("queueLoading")}
        </div>
      ) : status === "failed" ? (
        <div className="border-r border-bg-border p-4 text-xs text-text-muted">
          {t("queueFailed")}
        </div>
      ) : (
        <div className="min-h-0 flex-1">{children}</div>
      )}
    </div>
  );
}
