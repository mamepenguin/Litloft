"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleCheck, Search, Tag } from "lucide-react";
import { useTranslations } from "next-intl";

import { MenuRadioGroup, MenuSeparator, ToolbarMenu } from "@/components/ToolbarMenu";
import { ApiStatusError } from "@/lib/api";
import type { Tag as TagCount } from "@/types";

export interface FilterMenuOption<Value extends string> {
  value: Value;
  label: string;
}

export interface FilterMenuState<Value extends string> {
  options: ReadonlyArray<FilterMenuOption<Value>>;
  value: Value;
  onChange: (value: Value) => void;
}

export interface FilterMenusProps {
  /** The chosen names, in choice order. */
  tags: readonly string[];
  onToggle: (name: string) => void;
  onClear: () => void;
  /** The caller's own tag-counts request under its conditions. */
  loadCandidates: (signal: AbortSignal) => Promise<TagCount[]>;
  /** Changes whenever the conditions do; a load under another key is dropped. */
  conditionsKey: string;
  /** The Target's own tag conditions, which choosing would not change. */
  excludeTags: readonly string[];
  state: FilterMenuState<string> | null;
  onViewerRejected: () => void;
}

const folded = (name: string) => name.toLowerCase();

function rowClass(selected: boolean): string {
  return `flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors focus-visible:-outline-offset-2 ${
    selected
      ? "bg-bg-elevated font-medium text-text-primary"
      : "text-text-primary hover:bg-bg-elevated"
  }`;
}

function TagRows({
  tags,
  onToggle,
  onClear,
  loadCandidates,
  conditionsKey,
  excludeTags,
  onViewerRejected,
  open,
}: FilterMenusProps & { open: boolean }) {
  const t = useTranslations("appFilters");
  const [search, setSearch] = useState("");
  const [answer, setAnswer] = useState<TagCount[] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "failed">("idle");
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(loadCandidates);
  loadRef.current = loadCandidates;
  const rejectedRef = useRef(onViewerRejected);
  rejectedRef.current = onViewerRejected;
  const generation = useRef(0);

  useEffect(() => {
    if (!open) {
      generation.current += 1;
      setAnswer(null);
      setStatus("idle");
      setSearch("");
      return;
    }
    generation.current += 1;
    const current = generation.current;
    const controller = new AbortController();
    setStatus("loading");
    loadRef.current(controller.signal).then(
      (rows) => {
        if (current !== generation.current) return;
        setAnswer(rows);
        setStatus("loaded");
      },
      (error: unknown) => {
        if (current !== generation.current) return;
        if (error instanceof ApiStatusError && error.detail === "viewer_required") {
          rejectedRef.current();
        }
        setStatus("failed");
      },
    );
    return () => {
      controller.abort();
    };
  }, [open, conditionsKey, attempt]);

  const chosen: TagCount[] = [];
  const seen = new Set<string>();
  for (const name of tags) {
    const key = folded(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const found = answer?.find((candidate) => folded(candidate.name) === key);
    chosen.push({ name, count: found?.count ?? 0 });
  }
  const excluded = new Set([...tags.map(folded), ...excludeTags.map(folded)]);
  const others: TagCount[] = [];
  for (const candidate of answer ?? []) {
    const key = folded(candidate.name);
    if (excluded.has(key) || seen.has(key)) continue;
    seen.add(key);
    others.push(candidate);
  }
  const trimmed = search.trim();
  const query = folded(trimmed);
  const rows = [...chosen, ...others].filter(
    (candidate) => query === "" || folded(candidate.name).includes(query),
  );

  const loading = status === "loading";
  const failed = status === "failed";
  const firstLoad = answer === null;

  return (
    <>
      <div className="px-3 pb-1 pt-2">
        <div className="flex items-center gap-2 rounded-xl border border-bg-border px-2 py-1.5">
          <Search size={14} className="flex-shrink-0 text-text-muted" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t("searchTags")}
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>
      </div>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={tags.length === 0}
        onClick={onClear}
        className={rowClass(tags.length === 0)}
      >
        <span className="w-4 flex-shrink-0">{tags.length === 0 && <Check size={14} />}</span>
        <span className="min-w-0 flex-1">{t("any")}</span>
      </button>
      <MenuSeparator />
      {firstLoad && loading && (
        <div className="space-y-2 px-3 py-2" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-4 animate-pulse rounded bg-bg-elevated" />
          ))}
        </div>
      )}
      {(!firstLoad || !loading) &&
        rows.map((candidate) => {
          const selected = tags.some((name) => folded(name) === folded(candidate.name));
          return (
            <button
              key={candidate.name}
              type="button"
              role="menuitemcheckbox"
              aria-checked={selected}
              onClick={() => onToggle(candidate.name)}
              className={rowClass(selected)}
            >
              <span className="w-4 flex-shrink-0">{selected && <Check size={14} />}</span>
              <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
              <span className="flex-shrink-0 text-xs tabular-nums text-text-muted">
                {candidate.count}
              </span>
            </button>
          );
        })}
      {!firstLoad && !loading && rows.length === 0 && (
        <p className="px-3 py-2 text-sm text-text-muted">
          {trimmed === "" ? t("noTags") : t("noMatchingTags")}
        </p>
      )}
      {failed && (
        <div className="px-3 py-2">
          <button
            type="button"
            onClick={() => setAttempt((count) => count + 1)}
            className="rounded-2xl border border-bg-border px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring pointer-coarse:min-h-11"
          >
            {t("tryAgain")}
          </button>
        </div>
      )}
    </>
  );
}

/**
 * The Library's Tag and State filters, drawn as outlined toolbar menus. The
 * caller owns the values, the requests and what a state option means.
 */
export function FilterMenus(props: FilterMenusProps) {
  const t = useTranslations("appFilters");
  const [open, setOpen] = useState(false);
  const toggleOpen = useCallback((next: boolean) => setOpen(next), []);
  const value =
    props.tags.length === 0 ? t("tagNone") : props.tags.join(", ");
  const current = props.state?.options.find((option) => option.value === props.state?.value);

  return (
    <>
      <ToolbarMenu
        label={t("tag")}
        value={value}
        icon={Tag}
        inlineLabel
        truncateValue
        fullWidth
        className="min-w-0"
        align="start"
        onOpenChange={toggleOpen}
      >
        {() => <TagRows {...props} open={open} />}
      </ToolbarMenu>
      {props.state !== null && (
        <ToolbarMenu
          label={t("state")}
          value={current?.label ?? props.state.value}
          icon={CircleCheck}
          inlineLabel
          truncateValue
          fullWidth
          className="min-w-0"
          align="start"
        >
          {(close) => (
            <MenuRadioGroup<string>
              heading={t("state")}
              options={props.state!.options}
              isSelected={(candidate) => candidate === props.state!.value}
              onSelect={(candidate) => {
                props.state!.onChange(candidate);
                close();
              }}
            />
          )}
        </ToolbarMenu>
      )}
    </>
  );
}
