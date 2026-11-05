"use client";

import type { KeyboardEvent, RefObject } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

interface FindBarPresenterProps {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  count: string | null;
  message: string | null;
  canRetry: boolean;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: (value: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  onRetry: () => void;
}

const ICON_BUTTON =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary";

export function FindBarPresenter({
  inputRef,
  query,
  count,
  message,
  canRetry,
  onChange,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  onPrevious,
  onNext,
  onClose,
  onRetry,
}: FindBarPresenterProps) {
  const t = useTranslations("find");
  return (
    <div
      data-testid="find-bar"
      className="sticky top-0 z-20 flex shrink-0 flex-col gap-1 border-b border-bg-border bg-bg-card px-4 py-2"
    >
      <div className="flex items-center gap-2">
        <Search size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          maxLength={200}
          aria-label={t("inputLabel")}
          placeholder={t("inputPlaceholder")}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={(event) => onCompositionEnd(event.currentTarget.value)}
          className="min-w-0 flex-1 rounded-2xl border border-bg-border bg-bg-primary px-3 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-accent"
        />
        {count !== null && (
          <span className="shrink-0 text-xs tabular-nums text-text-muted">{count}</span>
        )}
        <button
          type="button"
          aria-label={t("previous")}
          title={t("previous")}
          onClick={onPrevious}
          className={ICON_BUTTON}
        >
          <ChevronUp size={16} />
        </button>
        <button
          type="button"
          aria-label={t("next")}
          title={t("next")}
          onClick={onNext}
          className={ICON_BUTTON}
        >
          <ChevronDown size={16} />
        </button>
        <button
          type="button"
          aria-label={t("close")}
          title={t("close")}
          onClick={onClose}
          className={ICON_BUTTON}
        >
          <X size={16} />
        </button>
      </div>
      <div role="status" aria-live="polite" className="min-h-5 text-xs text-text-muted">
        {message !== null && (
          <span className="inline-flex items-center gap-2">
            <span>{message}</span>
            {canRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-lg px-2 py-0.5 font-medium text-text-primary hover:bg-bg-elevated"
              >
                {t("retry")}
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
