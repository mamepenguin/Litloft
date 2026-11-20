"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useImeKeyGuard } from "@/lib/ime";

/** The pause after the last input event before the draft is applied. */
const APPLY_DELAY = 300;

/**
 * The applied form of a draft: trimmed, cut to the 200 UTF-16 code units the
 * backend accepts, then trimmed again because the cut may land on a space.
 * A cut through a surrogate pair drops its first half, which would otherwise
 * be a lone surrogate the request URL cannot carry.
 */
export function normaliseName(raw: string): string {
  const cut = raw.trim().slice(0, 200);
  const last = cut.charCodeAt(cut.length - 1);
  const whole = last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
  return whole.trim();
}

export interface NameFilterProps {
  /** The applied name. */
  value: string;
  onApply: (name: string) => void;
  /** Never collapses to the icon. */
  alwaysOpen?: boolean;
  /** Called once on unmount when an apply is still pending. */
  onLeavePending?: (name: string) => void;
  /** When it changes, a pending apply is dropped without being handed on. */
  scopeKey?: string;
}

export function NameFilter({
  value,
  onApply,
  alwaysOpen = false,
  onLeavePending,
  scopeKey,
}: NameFilterProps) {
  const t = useTranslations("appFilters");
  const ime = useImeKeyGuard();
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(alwaysOpen || value !== "");
  const inputRef = useRef<HTMLInputElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composingRef = useRef(false);
  const lastAppliedRef = useRef(value);
  const previousValueRef = useRef(value);
  const previousScopeRef = useRef(scopeKey);
  const focusOnOpenRef = useRef(false);
  const focusOnCloseRef = useRef(false);
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const onLeavePendingRef = useRef(onLeavePending);
  onLeavePendingRef.current = onLeavePending;

  const cancel = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const commit = (name: string) => {
    cancel();
    lastAppliedRef.current = name;
    onApplyRef.current(name);
  };

  const schedule = () => {
    cancel();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const name = normaliseName(draftRef.current);
      lastAppliedRef.current = name;
      onApplyRef.current(name);
    }, APPLY_DELAY);
  };

  // Only a change of `value` is news from outside. A re-render while the
  // applied name is on its way through the URL must not overwrite the draft.
  useEffect(() => {
    const previous = previousValueRef.current;
    previousValueRef.current = value;
    if (value === previous) return;
    if (value === lastAppliedRef.current) return;
    lastAppliedRef.current = value;
    cancel();
    setDraft(value);
    draftRef.current = value;
    if (alwaysOpen) return;
    if (value !== "") {
      setOpen(true);
      return;
    }
    if (document.activeElement !== inputRef.current) setOpen(false);
  }, [value, alwaysOpen]);

  useEffect(() => {
    if (scopeKey === previousScopeRef.current) return;
    previousScopeRef.current = scopeKey;
    cancel();
  }, [scopeKey]);

  useEffect(() => {
    if (open && focusOnOpenRef.current) {
      focusOnOpenRef.current = false;
      inputRef.current?.focus();
    } else if (!open && focusOnCloseRef.current) {
      focusOnCloseRef.current = false;
      iconRef.current?.focus();
    }
  }, [open]);

  useEffect(
    () => () => {
      if (timerRef.current === null) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
      onLeavePendingRef.current?.(normaliseName(draftRef.current));
    },
    [],
  );

  const holdsText = draft !== "";

  const icon = (
    <button
      ref={iconRef}
      type="button"
      aria-label={t("nameFilter")}
      onClick={() => {
        focusOnOpenRef.current = true;
        setOpen(true);
      }}
      className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring pointer-coarse:h-11 pointer-coarse:w-11"
    >
      <Search size={18} aria-hidden="true" />
    </button>
  );

  if (!alwaysOpen && !open) return icon;

  return (
    <div
      className={`flex h-9 w-full min-w-0 items-center gap-1.5 rounded-2xl border bg-bg-card pl-2.5 pr-1.5 text-text-muted pointer-coarse:h-11 sm:w-[260px] ${
        holdsText ? "border-text-primary" : "border-bg-border"
      }`}
    >
      <Search size={16} className="flex-shrink-0" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={draft}
        maxLength={200}
        aria-label={t("nameFilter")}
        placeholder={t("nameFilterPlaceholder")}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          draftRef.current = next;
          if (composingRef.current) {
            cancel();
            return;
          }
          schedule();
        }}
        onCompositionStart={() => {
          composingRef.current = true;
          cancel();
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
          ime.onCompositionEnd();
          schedule();
        }}
        onKeyDown={(event) => {
          if (ime.isImeKeystroke(event)) return;
          if (event.key === "Enter") {
            event.preventDefault();
            if (composingRef.current) return;
            commit(normaliseName(draftRef.current));
            return;
          }
          if (event.key !== "Escape") return;
          if (draftRef.current !== "") {
            setDraft("");
            draftRef.current = "";
            commit("");
            inputRef.current?.focus();
            return;
          }
          if (alwaysOpen) return;
          focusOnCloseRef.current = true;
          setOpen(false);
        }}
        onBlur={() => {
          if (alwaysOpen) return;
          if (draftRef.current.trim() !== "") return;
          setDraft("");
          draftRef.current = "";
          setOpen(false);
        }}
        className="w-full min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm text-text-primary outline-none placeholder:text-text-muted focus:ring-0 pointer-coarse:text-base [&::-webkit-search-cancel-button]:appearance-none"
      />
      {holdsText && (
        <button
          type="button"
          aria-label={t("clearName")}
          onClick={() => {
            setDraft("");
            draftRef.current = "";
            commit("");
            inputRef.current?.focus();
          }}
          className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring pointer-coarse:h-9 pointer-coarse:w-9"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
