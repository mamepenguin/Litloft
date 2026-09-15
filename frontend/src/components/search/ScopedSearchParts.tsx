"use client";

import { Fragment, type MouseEvent, type ReactNode } from "react";
import { ChevronRight, CornerDownLeft, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { FileItem, FileType } from "@/types";
import { FileTypeIcon } from "../FileTypeIcon";
import type { SearchScope } from "./GlobalSearchProvider";

function markMatches(text: string, query: string): ReactNode {
  const needle = query.trim().toLowerCase();
  if (!needle) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(needle);
  while (at >= 0) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark className="rounded-sm bg-highlight-bg text-inherit">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
    at = lower.indexOf(needle, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts.map((part, i) => <Fragment key={i}>{part}</Fragment>);
}

function formatRowDate(iso: string, locale: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(locale, {
    ...(sameYear ? {} : { year: "numeric" }),
    month: "short",
    day: "numeric",
  });
}

export function ScopeChip({
  scope,
  onRemove,
}: {
  scope: SearchScope;
  onRemove: () => void;
}) {
  const t = useTranslations("search");
  return (
    <span className="flex flex-shrink-0 items-center gap-0.5 rounded-full bg-sand py-0.5 pr-1 pl-2.5 text-xs font-semibold whitespace-nowrap text-text-primary">
      {scope.label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("scopeRemove", { label: scope.label })}
        className="inline-flex items-center justify-center rounded-full p-0.5 text-text-muted transition-colors hover:text-text-primary pointer-coarse:min-h-11 pointer-coarse:min-w-11"
      >
        <X size={12} />
      </button>
    </span>
  );
}

export function ScopedResultItem({
  file,
  query,
  isSelected,
  onSelect,
}: {
  file: FileItem;
  query: string;
  isSelected: boolean;
  onSelect: (url: string) => void;
}) {
  const t = useTranslations("search");
  const locale = useLocale();

  return (
    <button
      type="button"
      data-testid="scoped-result-item"
      data-file-id={file.id}
      onClick={() => onSelect(`/files/${file.id}`)}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${isSelected ? "bg-bg-elevated" : "hover:bg-bg-elevated"}`}
    >
      <span className="flex-shrink-0 text-text-muted">
        <FileTypeIcon fileType={file.file_type as FileType} size={16} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
        {markMatches(file.title || file.filename, query)}
      </span>
      <span className="hidden w-40 flex-shrink-0 truncate text-xs text-text-muted sm:block">
        {file.folder_path || t("driveRoot")}
      </span>
      <span className="w-14 flex-shrink-0 text-right text-xs text-text-muted tabular-nums">
        {formatRowDate(file.updated_at, locale)}
      </span>
      <span aria-hidden="true" className="hidden w-4 flex-shrink-0 text-text-muted sm:block">
        {isSelected && <CornerDownLeft size={14} />}
      </span>
    </button>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-bg-border px-1.5 py-0.5 font-sans text-[11px]">
      {children}
    </kbd>
  );
}

function KeyHint({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      {children}
      {label}
    </span>
  );
}

export function ScopedFooter({
  scope,
  query,
  mobile,
  onSeeAll,
}: {
  scope: SearchScope;
  query: string;
  mobile: boolean;
  onSeeAll: (href: string) => void;
}) {
  const t = useTranslations("search");
  const trimmed = query.trim();
  const href = trimmed && scope.seeAllHref ? scope.seeAllHref(trimmed) : null;
  if (mobile && !href) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-bg-border px-4 py-2">
      {mobile ? (
        <span />
      ) : (
        <div className="flex items-center gap-3.5 text-xs text-text-muted">
          <KeyHint label={t("hintSelect")}>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
          </KeyHint>
          <KeyHint label={t("hintOpen")}>
            <Kbd>Enter</Kbd>
          </KeyHint>
          <KeyHint label={t("hintRemoveScope")}>
            <Kbd>⌫</Kbd>
          </KeyHint>
        </div>
      )}
      {href && (
        <a
          href={href}
          onClick={(e: MouseEvent<HTMLAnchorElement>) => {
            e.preventDefault();
            onSeeAll(href);
          }}
          className="inline-flex min-w-0 items-center gap-0.5 text-xs text-accent transition-colors hover:text-accent-hover pointer-coarse:min-h-11"
        >
          <span className="truncate">
            {t("scopeSeeAll", { label: scope.label, query: trimmed })}
          </span>
          <ChevronRight size={14} className="flex-shrink-0" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
