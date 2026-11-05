"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { DismissScrim } from "@/components/DismissScrim";
import { useMenuSurface } from "@/components/ToolbarMenu";
import { getCollections, getDriveTags, getFolderTree } from "@/lib/api";
import { useImeKeyGuard } from "@/lib/ime";
import {
  FILE_KINDS,
  closeOpenQuote,
  formatOperatorToken,
  kindHolds,
  parseSearchQuery,
  resolveKinds,
  suggestValues,
} from "@/lib/searchQuery";
import type {
  CollectionSummary,
  FileKind,
  FolderTreeNode,
  SortField,
  SortOrder,
} from "@/types";

import { SearchFilterChips } from "./SearchFilterChips";

type Level = "closed" | "root" | "tag" | "kind" | "folder" | "collection";

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

interface SearchQueryHeaderProps {
  drive: string;
  query: string;
  typeFilter: FileKind | null;
  sort: SortField;
  order: SortOrder;
  smartFolderId: string | null;
  includeSceneClip: boolean;
  /** `passages` while the page shows the Passages view. */
  show?: string | null;
}

export function SearchQueryHeader({
  drive,
  query,
  typeFilter,
  sort,
  order,
  smartFolderId,
  includeSceneClip,
  show,
}: SearchQueryHeaderProps) {
  const t = useTranslations("search");
  const tFilter = useTranslations("filter");
  const router = useRouter();
  const ime = useImeKeyGuard();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(query);
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
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setText(query);
  }, [query]);

  const parsed = useMemo(() => parseSearchQuery(text), [text]);

  const searchHref = (value: string): string => {
    const params = new URLSearchParams({ q: value });
    if (typeFilter) params.set("type", typeFilter);
    if (sort !== "relevance") params.set("sort", sort);
    if (order !== "desc") params.set("order", order);
    if (smartFolderId) params.set("smart_folder_id", smartFolderId);
    if (includeSceneClip) params.set("include_scene_clip", "true");
    if (show === "passages") params.set("show", "passages");
    return `/drive/${encodeURIComponent(drive)}/search?${params.toString()}`;
  };

  const submit = (value: string) => {
    const normalized = value.trim();
    if (!normalized) {
      setText("");
      inputRef.current?.focus();
      return;
    }
    if (normalized === query.trim()) return;
    router.push(searchHref(normalized));
  };

  const closeMenu = (focusTrigger = true) => {
    setLevel("closed");
    if (focusTrigger) triggerRef.current?.focus();
  };

  const openRoot = () => {
    setLevel("root");
    triggerRef.current?.focus();
  };

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
    const closed = closeOpenQuote(text);
    const token = formatOperatorToken(operator, value);
    const next = closed.trim() ? `${closed.trim()} ${token}` : token;
    closeMenu(false);
    setText(next);
    submit(next);
  };

  const removeChip = (next: string) => {
    setText(next);
    const normalized = next.trim();
    if (!normalized) {
      const params = new URLSearchParams();
      if (sort !== "relevance") {
        params.set("sort", sort);
        params.set("order", order);
      } else if (order !== "desc") {
        params.set("order", order);
      }
      const qs = params.toString();
      router.push(`/drive/${encodeURIComponent(drive)}${qs ? `?${qs}` : ""}`);
      return;
    }
    router.push(searchHref(normalized));
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

  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (level === "root") closeMenu();
      else setLevel("root");
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

  return (
    <div className="min-w-0">
      <input
        ref={inputRef}
        type="text"
        value={text}
        aria-label={t("queryField")}
        data-role="query-field"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (ime.isImeKeystroke(e)) return;
          if (e.key === "Enter") {
            e.preventDefault();
            submit(text);
          } else if (e.key === "Escape") {
            e.preventDefault();
            if (level !== "closed") closeMenu();
            else setText(query);
          }
        }}
        className="w-full rounded-2xl border border-warm-silver/40 bg-bg-card px-3 py-1.5 text-lg text-text-primary outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <SearchFilterChips
          query={text}
          onRemove={(next) => removeChip(next)}
          fallbackRef={inputRef}
        />

        <div ref={surface.wrapperRef} className="relative">
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={level !== "closed"}
            aria-label={t("addFilter")}
            onClick={() => {
              if (level === "closed") openRoot();
              else closeMenu();
            }}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-warm-silver px-2.5 py-1 text-xs text-text-muted transition-colors hover:text-text-primary"
          >
            <span aria-hidden="true">＋</span>
            <span className="hidden sm:inline">{t("addFilterWord")}</span>
          </button>

          {level !== "closed" &&
            surface.layer(
              <DismissScrim onDismiss={() => closeMenu()}>
                <div
                  ref={surface.panelRef}
                  role="menu"
                  aria-label={t("addFilter")}
                  className={surface.className}
                  onKeyDown={handleMenuKeyDown}
                >
                  {level === "root" && (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        className={rootItemClass}
                        onClick={openTags}
                      >
                        {t("filterTag")}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={rootItemClass}
                        onClick={openKinds}
                      >
                        {t("filterKind")}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={rootItemClass}
                        disabled={parsed.folders.length >= 10}
                        onClick={openFolders}
                      >
                        {t("filterPath")}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={rootItemClass}
                        disabled={parsed.collections.length >= 10}
                        onClick={openCollections}
                      >
                        {t("filterCollection")}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={rootItemClass}
                        disabled={parsed.favorite}
                        onClick={() => choose("is", "favorite")}
                      >
                        {t("filterFavorite")}
                      </button>
                    </>
                  )}

                  {level === "tag" && (
                    <>
                      <button
                        type="button"
                        onClick={() => setLevel("root")}
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
                        onClick={() => setLevel("root")}
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
                        onClick={() => setLevel("root")}
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
      </div>
    </div>
  );
}
