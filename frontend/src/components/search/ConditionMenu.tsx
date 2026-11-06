"use client";

/**
 * The 「＋ 条件」 menu: value lists and token writer for a search query.
 *
 * Extracted so the Ask page can offer the same folder / collection / tag /
 * kind lists without the results header around them. The menu only builds the
 * next query string; what a choice does (submit, set a scope, …) is the
 * caller's `onChoose`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { DismissScrim } from "@/components/DismissScrim";
import { useMenuSurface } from "@/components/ToolbarMenu";
import { getCollections, getDriveTags, getFolderTree } from "@/lib/api";
import {
  FILE_KINDS,
  closeOpenQuote,
  comparisonWireForm,
  comparisonsImpossible,
  formatOperatorToken,
  kindHolds,
  parseSearchQuery,
  resolveKinds,
  suggestValues,
} from "@/lib/searchQuery";
import type { Comparison } from "@/lib/searchQuery";
import type {
  CollectionSummary,
  FileKind,
  FolderTreeNode,
} from "@/types";

export type ConditionEntry =
  | "tag"
  | "kind"
  | "folder"
  | "collection"
  | "size"
  | "duration"
  | "favorite";

interface ConditionMenuProps {
  drive: string;
  query: string;
  typeFilter: FileKind | null;
  /** First-level items, in this order. */
  entries: ConditionEntry[];
  /** The trigger's visible text, e.g. 「＋ 条件」 or “Filter”. */
  label: string;
  /**
   * The trigger's accessible name when it differs from the visible text.
   * The search page calls the menu “Filter” and names it “Add filter”.
   */
  ariaLabel?: string;
  onChoose: (next: string) => void;
}

type Level = "closed" | "root" | ConditionEntry;

interface Preset {
  label:
    | "filterSizeUnder10MB"
    | "filterSize100MBOrMore"
    | "filterSize1GBOrMore"
    | "filterDurationUnder5Min"
    | "filterDuration30MinOrMore"
    | "filterDuration1HourOrMore";
  value: string;
  comparison: Comparison;
}

const SIZE_PRESETS: readonly Preset[] = [
  {
    label: "filterSizeUnder10MB",
    value: "<10MB",
    comparison: { operator: "lt", value: 10 * 1024 ** 2 },
  },
  {
    label: "filterSize100MBOrMore",
    value: ">=100MB",
    comparison: { operator: "gte", value: 100 * 1024 ** 2 },
  },
  {
    label: "filterSize1GBOrMore",
    value: ">=1GB",
    comparison: { operator: "gte", value: 1024 ** 3 },
  },
];

const LENGTH_PRESETS: readonly Preset[] = [
  {
    label: "filterDurationUnder5Min",
    value: "<5m",
    comparison: { operator: "lt", value: 300 },
  },
  {
    label: "filterDuration30MinOrMore",
    value: ">=30m",
    comparison: { operator: "gte", value: 1800 },
  },
  {
    label: "filterDuration1HourOrMore",
    value: ">=1h",
    comparison: { operator: "gte", value: 3600 },
  },
];

function includesComparison(
  held: readonly Comparison[],
  comparison: Comparison,
): boolean {
  return held.some(
    (item) => comparisonWireForm(item) === comparisonWireForm(comparison),
  );
}

interface TagState {
  status: "loading" | "ready" | "failed";
  items: { name: string; count: number }[];
}

interface ListState<T> {
  status: "loading" | "ready" | "failed";
  items: T[];
}

const OPTION_LIMIT = 8;

function fold(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

function hasQuote(value: string): boolean {
  return value.includes('"') || value.includes("＂");
}

function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function ConditionMenu({
  drive,
  query,
  typeFilter,
  entries,
  label,
  ariaLabel,
  onChoose,
}: ConditionMenuProps) {
  const t = useTranslations("search");
  const tFilter = useTranslations("filter");
  const [level, setLevel] = useState<Level>("closed");
  const [tagFilterText, setTagFilterText] = useState("");
  const [tags, setTags] = useState<TagState>({ status: "loading", items: [] });
  const [folderFilterText, setFolderFilterText] = useState("");
  const [folders, setFolders] = useState<ListState<FolderTreeNode>>({
    status: "loading",
    items: [],
  });
  const [collectionFilterText, setCollectionFilterText] = useState("");
  const [collections, setCollections] = useState<ListState<CollectionSummary>>({
    status: "loading",
    items: [],
  });
  const surface = useMenuSurface(level !== "closed", "start");
  const panelRef = surface.panelRef;
  const triggerRef = useRef<HTMLButtonElement>(null);

  const parsed = useMemo(() => parseSearchQuery(query), [query]);

  const closeMenu = (focusTrigger = true) => {
    setLevel("closed");
    if (focusTrigger) triggerRef.current?.focus();
  };

  const openRoot = () => {
    setLevel("root");
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (level === "closed" || level === "root") return;
    const panel = panelRef.current;
    if (!panel) return;
    // The row that opened this list unmounts, so focus would drop to the page
    // and the menu would stop answering keys.
    const target =
      panel.querySelector<HTMLElement>("input") ??
      panel.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])') ??
      panel;
    target.focus();
  }, [level, panelRef]);

  const openTags = () => {
    setLevel("tag");
    setTagFilterText("");
    setTags({ status: "loading", items: [] });
    getDriveTags(drive)
      .then((items) => setTags({ status: "ready", items }))
      .catch(() => setTags({ status: "failed", items: [] }));
  };

  const openKinds = () => {
    setLevel("kind");
  };

  const openFolders = () => {
    setLevel("folder");
    setFolderFilterText("");
    setFolders({ status: "loading", items: [] });
    getFolderTree(drive, { flat: true })
      .then((items) => setFolders({ status: "ready", items }))
      .catch(() => setFolders({ status: "failed", items: [] }));
  };

  const openCollections = () => {
    setLevel("collection");
    setCollectionFilterText("");
    setCollections({ status: "loading", items: [] });
    getCollections(drive)
      .then((items) => setCollections({ status: "ready", items }))
      .catch(() => setCollections({ status: "failed", items: [] }));
  };

  const choose = (operator: string, value: string) => {
    const closed = closeOpenQuote(query);
    const token = formatOperatorToken(operator, value);
    const next = closed.trim() ? `${closed.trim()} ${token}` : token;
    closeMenu(false);
    onChoose(next);
  };

  const kindOptions = useMemo(() => {
    const chosen = [...parsed.types, ...(typeFilter ? [typeFilter] : [])];
    return FILE_KINDS.filter((kind) => {
      if (chosen.includes(kind)) return false;
      if (chosen.some((held) => kindHolds(held, kind) || kindHolds(kind, held))) {
        return false;
      }
      return !resolveKinds(typeFilter, [...parsed.types, kind]).impossible;
    });
  }, [parsed.types, typeFilter]);

  const tagOptions = useMemo(() => {
    if (tags.status !== "ready") return [];
    return suggestValues(
      { operator: "tag", partial: tagFilterText, replaceFrom: 0 },
      tags.items,
      parsed.tags,
    );
  }, [tags, tagFilterText, parsed.tags]);

  const folderOptions = useMemo(() => {
    if (folders.status !== "ready") return [];
    const needle = fold(folderFilterText);
    const used = new Set(parsed.folders);
    return folders.items
      .filter(
        (node): node is Extract<FolderTreeNode, { kind: "folder" }> =>
          node.kind === "folder",
      )
      .filter((node) => node.path !== "" && !used.has(node.path) && !hasQuote(node.path))
      .map((node) => {
        const path = fold(node.path);
        const last = fold(node.path.split("/").at(-1) ?? "");
        return {
          node,
          group: last.startsWith(needle) ? 0 : path.includes(needle) ? 1 : -1,
          depth: node.path.split("/").length,
        };
      })
      .filter(({ group }) => group >= 0)
      .sort(
        (a, b) =>
          a.group - b.group ||
          a.depth - b.depth ||
          comparePaths(a.node.path, b.node.path),
      )
      .slice(0, OPTION_LIMIT)
      .map(({ node }) => node);
  }, [folders, folderFilterText, parsed.folders]);

  const collectionOptions = useMemo(() => {
    if (collections.status !== "ready") return [];
    const needle = fold(collectionFilterText);
    const used = new Set(parsed.collections.map((name) => name.toLowerCase()));
    return collections.items
      .filter(
        (collection) =>
          !used.has(collection.name.toLowerCase()) && !hasQuote(collection.name),
      )
      .map((collection) => {
        const name = fold(collection.name);
        return {
          collection,
          group: name.startsWith(needle) ? 0 : name.includes(needle) ? 1 : -1,
        };
      })
      .filter(({ group }) => group >= 0)
      .sort((a, b) => a.group - b.group)
      .slice(0, OPTION_LIMIT)
      .map(({ collection }) => collection);
  }, [collections, collectionFilterText, parsed.collections]);

  const sizePresets = useMemo(
    () =>
      SIZE_PRESETS.filter(
        (preset) =>
          !includesComparison(parsed.sizes, preset.comparison) &&
          !comparisonsImpossible([...parsed.sizes, preset.comparison], "size"),
      ),
    [parsed.sizes],
  );

  const lengthPresets = useMemo(
    () =>
      LENGTH_PRESETS.filter(
        (preset) =>
          !includesComparison(parsed.durations, preset.comparison) &&
          !comparisonsImpossible(
            [...parsed.durations, preset.comparison],
            "duration",
          ),
      ),
    [parsed.durations],
  );

  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (level === "closed") return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (level === "root") closeMenu();
      else openRoot();
      return;
    }
    if (e.key === "Tab") {
      closeMenu(false);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(
      surface.panelRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled])',
      ) ?? [],
    );
    if (items.length === 0) return;
    e.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    const next =
      current === -1
        ? step === 1
          ? 0
          : items.length - 1
        : (current + step + items.length) % items.length;
    items[next].focus();
  }

  const rootItemClass =
    "flex w-full items-center px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-elevated disabled:opacity-50 disabled:hover:bg-transparent";
  const backItemClass =
    "flex w-full items-center px-3 py-2 text-left text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary";
  const filterInputClass =
    "mx-2 my-1 w-[calc(100%-1rem)] rounded-lg border border-bg-border bg-bg-card px-2 py-1 text-sm text-text-primary outline-none focus:ring-2 focus:ring-[var(--focus-ring)]";
  const stateRowClass = "flex items-center gap-2 px-3 py-2 text-sm text-text-muted";

  const hasPlus = label.startsWith("＋") || label.startsWith("+");

  const presetLabel = (key: Preset["label"]): string => {
    if (key === "filterSizeUnder10MB") return t("filterSizeUnder10MB");
    if (key === "filterSize100MBOrMore") return t("filterSize100MBOrMore");
    if (key === "filterSize1GBOrMore") return t("filterSize1GBOrMore");
    if (key === "filterDurationUnder5Min") return t("filterDurationUnder5Min");
    if (key === "filterDuration30MinOrMore") return t("filterDuration30MinOrMore");
    if (key === "filterDuration1HourOrMore") return t("filterDuration1HourOrMore");
    return "";
  };

  const presetList = (
    presets: readonly Preset[],
    operator: "size" | "duration",
  ) => (
    <>
      <button
        type="button"
        role="menuitem"
        aria-label={t("filterBack")}
        onClick={openRoot}
        className={backItemClass}
      >
        ← {t("filterBack")}
      </button>
      {presets.length === 0 ? (
        <div className={stateRowClass}>{t("filterNoPreset")}</div>
      ) : (
        presets.map((preset) => (
          <button
            key={preset.value}
            type="button"
            role="menuitem"
            className={rootItemClass}
            onClick={() => choose(operator, preset.value)}
          >
            {presetLabel(preset.label)}
          </button>
        ))
      )}
    </>
  );

  return (
    <div
      ref={surface.wrapperRef}
      className="relative"
      // On the wrapper, not the panel: opening leaves focus on the trigger,
      // which is outside the panel.
      onKeyDown={handleMenuKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={level !== "closed"}
        aria-label={ariaLabel ?? label}
        onClick={() => {
          if (level === "closed") openRoot();
          else closeMenu();
        }}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-warm-silver px-2.5 py-1 text-xs text-text-muted transition-colors hover:text-text-primary"
      >
        {hasPlus ? (
          <span>{label}</span>
        ) : (
          <>
            <span aria-hidden="true">＋</span>
            <span className="hidden sm:inline">{label}</span>
          </>
        )}
      </button>

      {level !== "closed" &&
        surface.layer(
          <DismissScrim onDismiss={() => closeMenu()}>
            <div
              ref={surface.panelRef}
              role="menu"
              aria-label={ariaLabel ?? label}
              tabIndex={-1}
              className={surface.className}
            >
              {level === "root" && (
                <>
                  {entries.map((entry) => {
                    if (entry === "tag") {
                      return (
                        <button
                          key={entry}
                          type="button"
                          role="menuitem"
                          className={rootItemClass}
                          onClick={openTags}
                        >
                          {t("filterTag")}
                        </button>
                      );
                    }
                    if (entry === "kind") {
                      return (
                        <button
                          key={entry}
                          type="button"
                          role="menuitem"
                          className={rootItemClass}
                          onClick={openKinds}
                        >
                          {t("filterKind")}
                        </button>
                      );
                    }
                    if (entry === "folder") {
                      return (
                        <button
                          key={entry}
                          type="button"
                          role="menuitem"
                          className={rootItemClass}
                          disabled={parsed.folders.length >= 10}
                          onClick={openFolders}
                        >
                          {t("filterPath")}
                        </button>
                      );
                    }
                    if (entry === "collection") {
                      return (
                        <button
                          key={entry}
                          type="button"
                          role="menuitem"
                          className={rootItemClass}
                          disabled={parsed.collections.length >= 10}
                          onClick={openCollections}
                        >
                          {t("filterCollection")}
                        </button>
                      );
                    }
                    if (entry === "size") {
                      return (
                        <button
                          key={entry}
                          type="button"
                          role="menuitem"
                          className={rootItemClass}
                          disabled={parsed.sizes.length >= 4}
                          onClick={() => setLevel("size")}
                        >
                          {t("filterSize")}
                        </button>
                      );
                    }
                    if (entry === "duration") {
                      return (
                        <button
                          key={entry}
                          type="button"
                          role="menuitem"
                          className={rootItemClass}
                          disabled={parsed.durations.length >= 4}
                          onClick={() => setLevel("duration")}
                        >
                          {t("filterLength")}
                        </button>
                      );
                    }
                    return (
                      <button
                        key={entry}
                        type="button"
                        role="menuitem"
                        className={rootItemClass}
                        disabled={parsed.favorite}
                        onClick={() => choose("is", "favorite")}
                      >
                        {t("filterFavorite")}
                      </button>
                    );
                  })}
                </>
              )}

              {level === "tag" && (
                <>
                  <button
                    type="button"
                    onClick={openRoot}
                    className={backItemClass}
                  >
                    ← {t("filterBack")}
                  </button>
                  <input
                    type="text"
                    value={tagFilterText}
                    aria-label={t("filterTagSearch")}
                    onChange={(e) => setTagFilterText(e.target.value)}
                    placeholder={t("filterTagSearch")}
                    className={filterInputClass}
                  />
                  {tags.status === "loading" && (
                    <div className={stateRowClass}>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                      {t("filterTagsLoading")}
                    </div>
                  )}
                  {tags.status === "failed" && (
                    <div className={stateRowClass}>{t("filterTagsFailed")}</div>
                  )}
                  {tags.status === "ready" && tagOptions.length === 0 && (
                    <div className={stateRowClass}>
                      {tags.items.length === 0
                        ? t("filterTagsNone")
                        : t("filterTagsNoMatch")}
                    </div>
                  )}
                  {tags.status === "ready" &&
                    tagOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="menuitem"
                        className={rootItemClass}
                        onClick={() => choose("tag", option.value)}
                      >
                        {option.value}
                      </button>
                    ))}
                </>
              )}

              {level === "folder" && (
                <>
                  <button
                    type="button"
                    onClick={openRoot}
                    className={backItemClass}
                  >
                    ← {t("filterBack")}
                  </button>
                  <input
                    type="text"
                    value={folderFilterText}
                    aria-label={t("filterFolderSearch")}
                    onChange={(e) => setFolderFilterText(e.target.value)}
                    placeholder={t("filterFolderSearch")}
                    className={filterInputClass}
                  />
                  {folders.status === "loading" && (
                    <div className={stateRowClass}>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                      {t("filterFoldersLoading")}
                    </div>
                  )}
                  {folders.status === "failed" && (
                    <div className={stateRowClass}>{t("filterFoldersFailed")}</div>
                  )}
                  {folders.status === "ready" && folderOptions.length === 0 && (
                    <div className={stateRowClass}>
                      {folders.items.length === 0
                        ? t("filterFoldersNone")
                        : t("filterFoldersNoMatch")}
                    </div>
                  )}
                  {folders.status === "ready" &&
                    folderOptions.map((node) => (
                      <button
                        key={node.path}
                        type="button"
                        role="menuitem"
                        className={`${rootItemClass} min-w-0 gap-2`}
                        onClick={() => choose("path", node.path)}
                      >
                        <span className="truncate">
                          {node.path.split("/").at(-1)}
                        </span>
                        <span className="min-w-0 truncate text-xs text-text-muted">
                          {node.path}
                        </span>
                      </button>
                    ))}
                </>
              )}

              {level === "collection" && (
                <>
                  <button
                    type="button"
                    onClick={openRoot}
                    className={backItemClass}
                  >
                    ← {t("filterBack")}
                  </button>
                  <input
                    type="text"
                    value={collectionFilterText}
                    aria-label={t("filterCollectionSearch")}
                    onChange={(e) => setCollectionFilterText(e.target.value)}
                    placeholder={t("filterCollectionSearch")}
                    className={filterInputClass}
                  />
                  {collections.status === "loading" && (
                    <div className={stateRowClass}>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                      {t("filterCollectionsLoading")}
                    </div>
                  )}
                  {collections.status === "failed" && (
                    <div className={stateRowClass}>
                      {t("filterCollectionsFailed")}
                    </div>
                  )}
                  {collections.status === "ready" &&
                    collectionOptions.length === 0 && (
                      <div className={stateRowClass}>
                        {collections.items.length === 0
                          ? t("filterCollectionsNone")
                          : t("filterCollectionsNoMatch")}
                      </div>
                    )}
                  {collections.status === "ready" &&
                    collectionOptions.map((collection) => (
                      <button
                        key={collection.id}
                        type="button"
                        role="menuitem"
                        className={`${rootItemClass} min-w-0`}
                        onClick={() => choose("in", collection.name)}
                      >
                        <span className="truncate">{collection.name}</span>
                      </button>
                    ))}
                </>
              )}

              {level === "size" && presetList(sizePresets, "size")}

              {level === "duration" && presetList(lengthPresets, "duration")}

              {level === "kind" &&
                kindOptions.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="menuitem"
                    className={rootItemClass}
                    onClick={() => choose("type", kind)}
                  >
                    {tFilter(`type.${kind}`)}
                  </button>
                ))}
            </div>
          </DismissScrim>,
        )}
    </div>
  );
}
