"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, X } from "lucide-react";
import { useShortcuts } from "@/hooks/useShortcuts";
import { MatchLegend } from "@/components/search/MatchLegend";
import { useShortcutsContext } from "@/components/ShortcutsProvider";
import { NESTED_OVERLAY_PRIORITY, OVERLAY_PRIORITY } from "@/lib/shortcuts";

import { useTranslations } from "next-intl";
import { useImeKeyGuard } from "@/lib/ime";
import { parseSearchQuery } from "@/lib/searchQuery";
import type { FileKind } from "@/types";
import {
  browseFolderHref,
  browseKeyAction,
  browseRowHref,
  launchKeyAction,
  startsRootBrowse,
  type BrowseNode,
} from "@/lib/folderBrowse";
import { BrowseChip, BrowseRows } from "./search/BrowseRows";
import { useFolderBrowse } from "./search/useFolderBrowse";
import { useCurrentDrive, useSetOverrideDrive } from "./CurrentDriveProvider";
import type { JumpDestination } from "./search/useJumpDestinations";
import { useFileSearch } from "./search/useFileSearch";
import { useLauncherRows } from "./search/useLauncherRows";
import { useRecentAndHistory } from "./search/useRecentAndHistory";
import { SearchFooter } from "./search/SearchFooter";
import { SearchResultsList } from "./search/SearchResultsList";
import { SearchEmptyState, type EmptyItem } from "./search/SearchEmptyState";
import {
  useActiveSearchScope,
  useRegisterGlobalSearch,
} from "./search/GlobalSearchProvider";
import { ScopeChip, ScopedFooter } from "./search/ScopedSearchParts";

function isModified(e: React.KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey || e.altKey || e.shiftKey;
}


function searchPageHref(drive: string, term: string, type?: FileKind): string {
  const base = `/drive/${encodeURIComponent(drive)}/search?q=${encodeURIComponent(term)}`;
  return type ? `${base}&type=${type}` : base;
}

export function GlobalSearch() {
  const t = useTranslations("search");
  const tsc = useTranslations("shortcuts");
  const tc = useTranslations("common");
  const tj = useTranslations("pageJump");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The scope is read live from whatever screen is mounted, never copied: a
  // modal left open across a navigation must not keep the previous screen's
  // destination. Only the viewer's removal belongs to this opening.
  const registeredScope = useActiveSearchScope();
  const [scopeRemoved, setScopeRemoved] = useState(false);
  const scope = scopeRemoved ? null : registeredScope;
  const scopeType = scope?.type ?? null;
  const ime = useImeKeyGuard();
  const [selectedIndex, setSelectedIndex] = useState(-1);
  /**
   * The highlight is a promise about where the next Enter lands, and the
   * list moves underneath it: the second stage reorders by relevance. A
   * position cannot keep that promise; a file can.
   */
  type Highlighted =
    | { kind: "none" }
    | { kind: "tail" }
    | { kind: "jump"; key: string }
    | { kind: "file"; id: string };
  const highlightedRef = useRef<Highlighted>({ kind: "none" });
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drive = useCurrentDrive();
  const setOverrideDrive = useSetOverrideDrive();
  const browse = useFolderBrowse(open, drive, !scope);
  const browsing = browse.path !== null;
  const { merged, total, loading, semanticPending, reset: resetResults } = useFileSearch({
    open,
    drive,
    query,
    scopeType,
    browsing,
  });
  const { recentFiles, recentReply, history, record, forget } = useRecentAndHistory(
    open,
    drive,
    scopeType,
  );
  const { pageJumps, folderJumps, jumps, browseRows } = useLauncherRows(
    open,
    scope,
    drive,
    query,
    browse,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 639px)");
    const apply = () => setIsMobileViewport(mql.matches);
    apply();
    mql.addEventListener?.("change", apply);
    return () => mql.removeEventListener?.("change", apply);
  }, []);

  const focusInput = useCallback(() => {
    const isMobile = window.matchMedia("(max-width: 639px)").matches;
    if (isMobile) {
      mobileInputRef.current?.focus();
    } else {
      desktopInputRef.current?.focus();
    }
  }, []);

  const openSearch = useCallback(() => {
    setScopeRemoved(false);
    setOpen(true);
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    focusTimerRef.current = setTimeout(focusInput, 50);
  }, [focusInput]);

  useEffect(
    () => () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    },
    [],
  );

  useRegisterGlobalSearch(() => {
    if (!open) openSearch();
  });

  const { openCheatSheet } = useShortcutsContext();

  const closeSearch = useCallback(() => {
    setOpen(false);
    setLegendOpen(false);
    setQuery("");
    resetResults();
  }, [resetResults]);

  /**
   * Two overlays at once make Escape ambiguous: the reader would press Escape
   * twice to leave something they opened once.
   */
  const openShortcuts = useCallback(() => {
    closeSearch();
    openCheatSheet();
  }, [closeSearch, openCheatSheet]);

  // `editingOnly` is deliberately left unset here. Unset means "fires only
  // when no editing element has focus", which is what partitions these from
  // the Knowledge editor's own ctrl+k (insert link, editingOnly: true).
  useShortcuts("global", tsc("global"), [
    {
      key: "ctrl+shift+f",
      label: tsc("search"),
      handler: openSearch,
    },
    {
      key: "ctrl+k",
      label: tsc("search"),
      handler: openSearch,
    },
  ]);

  // Closing needs its own context: opening focuses the search input, which the
  // provider classifies as "editing", so a closing handler registered above
  // would never fire; and an addon editor mounted beneath (Knowledge binds
  // ctrl+k while editing) would otherwise win the chord. `OVERLAY_PRIORITY`
  // stops a context that enables *after* the modal opened taking the chord back.
  useShortcuts(
    "search-modal",
    tsc("search"),
    [
      { key: "escape", label: tc("close"), editingOnly: false, hidden: true, handler: closeSearch },
      { key: "ctrl+k", label: tc("close"), editingOnly: false, handler: closeSearch },
      { key: "ctrl+shift+f", label: tc("close"), editingOnly: false, handler: closeSearch },
    ],
    open,
    OVERLAY_PRIORITY,
  );

  useShortcuts(
    "search-legend",
    t("badgeLegend"),
    [
      {
        key: "escape",
        label: tc("close"),
        editingOnly: false,
        hidden: true,
        handler: () => setLegendOpen(false),
      },
    ],
    open && legendOpen,
    NESTED_OVERLAY_PRIORITY,
  );


  // It is the *order*, not the array. `paint()` builds a fresh array every
  // run, including the one where the second stage came back with nothing to
  // add, so keying on the array would yank the highlight off a list that
  // never moved.
  const rowOrder = [...jumps.map((j) => j.key), "", ...merged.map((f) => f.id)].join("\u0000");
  useEffect(() => {
    const held = highlightedRef.current;
    if (held.kind === "none") return;
    if (held.kind === "tail") {
      setSelectedIndex(jumps.length + merged.length);
      return;
    }
    const next =
      held.kind === "jump"
        ? jumps.findIndex((jump) => jump.key === held.key)
        : merged.findIndex((file) => file.id === held.id);
    if (next === -1) {
      highlightedRef.current = { kind: "none" };
      setSelectedIndex(-1);
      return;
    }
    setSelectedIndex(held.kind === "jump" ? next : jumps.length + next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowOrder]);

  useEffect(() => {
    highlightedRef.current = { kind: "none" };
    setSelectedIndex(-1);
  }, [query, open, scopeType, browse.path]);

  // A history reply landing after the reader arrowed onto a result would
  // otherwise take the highlight off a row that never moved.
  const queryIsEmpty = query.trim().length === 0;
  useEffect(() => {
    if (!queryIsEmpty || browsing) return;
    highlightedRef.current = { kind: "none" };
    setSelectedIndex(-1);
  }, [recentReply, queryIsEmpty]);

  useEffect(() => {
    if (selectedIndex < 0) return;
    const el = document.querySelector<HTMLElement>(`[data-search-item="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);


  const navigateToSearchPage = useCallback(
    (term: string, type?: FileKind) => {
      const normalized = term.trim();
      if (!normalized || !drive) return;
      record(normalized);
      closeSearch();
      router.push(searchPageHref(drive, normalized, type));
    },
    [drive, router, closeSearch, record],
  );

  /**
   * A scope's own page does not read operators, so a filtered scoped search
   * goes to the core search page, still narrowed to the scope's kind.
   */
  const scopedSeeAll = useMemo(() => {
    if (!scope?.seeAllHref || !drive) return scope;
    const own = scope.seeAllHref;
    return {
      ...scope,
      seeAllHref: (term: string) =>
        parseSearchQuery(term).hasOperators ? searchPageHref(drive, term, scope.type) : own(term),
    };
  }, [scope, drive]);

  function handleSelect(url: string) {
    record(query);
    closeSearch();
    router.push(url);
  }

  function enterFolder(path: string) {
    browse.enter(path);
    setQuery("");
  }

  function openBrowseRow(row: BrowseNode | null) {
    if (!drive || browse.path === null) return;
    const href = row ? browseRowHref(drive, row) : browseFolderHref(drive, browse.path);
    closeSearch();
    router.push(href);
  }

  function handleBrowseKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const action = browseKeyAction(e.key, query, selectedIndex, browseRows);
    if (action.kind === "none") return;
    // Cmd+← and friends move the caret, and a held Backspace must not climb
    // one level per repeat.
    if ((action.kind === "up" || action.kind === "enter") && (isModified(e) || e.repeat)) return;
    e.preventDefault();
    if (action.kind === "move") setSelectedIndex(action.index);
    else if (action.kind === "enter") enterFolder(action.path);
    else if (action.kind === "up") browse.up();
    else openBrowseRow(action.row);
  }

  function openJump(jump: JumpDestination) {
    closeSearch();
    if (jump.overrideDrive) setOverrideDrive(jump.overrideDrive);
    router.push(jump.href);
  }

  function handleSubmit(term: string) {
    const normalized = term.trim();
    if (scopedSeeAll?.seeAllHref && normalized) {
      handleSelect(scopedSeeAll.seeAllHref(normalized));
      return;
    }
    navigateToSearchPage(term);
  }

  function removeScope() {
    setScopeRemoved(true);
    focusInput();
  }

  function handleHistorySubmit(term: string) {
    setQuery(term);
    navigateToSearchPage(term);
  }

  function handleRemoveHistory(term: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!drive) return;
    const removedIndex = emptyItems.findIndex(
      (item) => item.kind === "term" && item.term === term,
    );
    if (removedIndex >= 0 && selectedIndex >= 0) {
      if (removedIndex === selectedIndex) setSelectedIndex(-1);
      else if (removedIndex < selectedIndex) setSelectedIndex(selectedIndex - 1);
    }
    forget(term);
  }

  function handleFillInput(term: string, e: React.MouseEvent) {
    e.stopPropagation();
    setQuery(term);
    focusInput();
  }

  const hasResults = merged.length > 0;
  const hasQuery = query.trim().length > 0;

  // Files first: the chord's main use is getting back to what you just had
  // open, which should be one Enter away. A recent term leads to the unscoped
  // search page, so a scoped modal offers none.
  const emptyItems: EmptyItem[] = hasQuery
    ? []
    : [
        ...recentFiles.map<EmptyItem>((file) => ({ kind: "file", file })),
        ...(scope ? [] : history).map<EmptyItem>((term) => ({ kind: "term", term })),
      ];
  const showEmptyState = emptyItems.length > 0;
  const recentFileCount = hasQuery ? 0 : recentFiles.length;

  /**
   * The recording happens here rather than in an effect on `selectedIndex`:
   * an effect also runs when the *list* changes, and would re-read the row
   * at the old position.
   */
  function moveHighlight(next: (prev: number) => number) {
    setSelectedIndex((prev) => {
      const index = next(prev);
      if (showEmptyState || index < 0) {
        highlightedRef.current = { kind: "none" };
      } else if (index < jumps.length) {
        highlightedRef.current = { kind: "jump", key: jumps[index].key };
      } else if (index >= jumps.length + merged.length) {
        highlightedRef.current = { kind: "tail" };
      } else {
        highlightedRef.current = { kind: "file", id: merged[index - jumps.length].id };
      }
      return index;
    });
  }

  function activateEmptyItem(item: EmptyItem | undefined) {
    if (!item) return;
    if (item.kind === "term") {
      handleHistorySubmit(item.term);
    } else {
      handleSelect(`/files/${item.file.id}`);
    }
  }

  const searchInput = (
    ref: React.RefObject<HTMLInputElement | null>,
    mobile: boolean,
  ) => (
    <input
      ref={ref}
      type="text"
      value={query}
      onChange={(e) => {
        const next = e.target.value;
        const composing = (e.nativeEvent as InputEvent).isComposing === true;
        if (!browsing && !scope && drive && !composing && startsRootBrowse(query, next)) {
          enterFolder("");
        } else {
          setQuery(next);
        }
      }}
      onCompositionEnd={ime.onCompositionEnd}
      onKeyDown={(e) => {
        if (ime.isImeKeystroke(e)) return;
        if (browsing) {
          handleBrowseKey(e);
          return;
        }
        const startAt = launchKeyAction(e.key, selectedIndex, jumps, !!scope || !drive);
        if (startAt !== null && !isModified(e)) {
          e.preventDefault();
          enterFolder(startAt);
        } else if (e.key === "Backspace" && scope && query === "") {
          e.preventDefault();
          removeScope();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          const maxIdx = showEmptyState
            ? emptyItems.length - 1
            : hasResults
              ? scope
                ? jumps.length + merged.length - 1
                : jumps.length + merged.length
              : jumps.length - 1;
          if (maxIdx >= 0) moveHighlight((prev) => Math.min(maxIdx, prev + 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          moveHighlight((prev) => Math.max(-1, prev - 1));
        } else if (e.key === "Enter") {
          if (selectedIndex >= 0 && showEmptyState) {
            activateEmptyItem(emptyItems[selectedIndex]);
          } else if (selectedIndex >= 0 && selectedIndex < jumps.length) {
            openJump(jumps[selectedIndex]);
          } else if (selectedIndex >= 0 && hasResults) {
            const fileIndex = selectedIndex - jumps.length;
            if (fileIndex < merged.length) {
              handleSelect(`/files/${merged[fileIndex].id}`);
            } else {
              handleSubmit(query);
            }
          } else {
            handleSubmit(query);
          }
        }
      }}
      placeholder={drive ? t("searchInDrive", { drive }) : t("selectDrive")}
      disabled={!drive}
      className={
        mobile
          ? "w-full rounded-full bg-sand px-4 py-2 text-base text-text-primary placeholder:text-text-muted outline-none"
          : "flex-1 bg-transparent text-base text-text-primary placeholder:text-text-muted outline-none"
      }
    />
  );

  const resultsList = (mobile: boolean) => (
    <SearchResultsList
      mobile={mobile}
      query={query}
      scope={scope}
      pageJumps={pageJumps}
      folderJumps={folderJumps}
      merged={merged}
      total={total}
      loading={loading}
      semanticPending={semanticPending}
      selectedIndex={selectedIndex}
      onOpenJump={openJump}
      onEnterFolder={enterFolder}
      onSelect={handleSelect}
      onSubmit={handleSubmit}
    />
  );

  const browseChip = browse.path !== null && (
    <BrowseChip
      label={browse.path || t("driveRoot")}
      removeLabel={tj("browseLeave")}
      upLabel={tj("browseUp")}
      onUp={browse.path === "" ? undefined : browse.up}
      onRemove={() => {
        browse.leave();
        focusInput();
      }}
    />
  );

  const browseList = (mobile: boolean) =>
    browse.loading ? null : (
      <BrowseRows
        rows={browseRows}
        selectedIndex={selectedIndex}
        mobile={mobile}
        emptyText={query.trim() ? tj("browseNoMatch") : tj("browseEmpty")}
        onOpen={openBrowseRow}
        onEnterFolder={enterFolder}
      />
    );

  const body = (mobile: boolean) =>
    legendOpen ? (
      <MatchLegend />
    ) : !drive ? (
      <div className={`${mobile ? "py-12" : "py-8"} text-center text-sm text-text-muted`}>
        {t("goToDrive")}
      </div>
    ) : browsing ? (
      browseList(mobile)
    ) : showEmptyState ? (
      <SearchEmptyState
        items={emptyItems}
        selectedIndex={selectedIndex}
        recentFileCount={recentFileCount}
        mobile={mobile}
        onOpenFile={(file) => handleSelect(`/files/${file.id}`)}
        onSubmitTerm={handleHistorySubmit}
        onFillInput={handleFillInput}
        onRemoveTerm={handleRemoveHistory}
      />
    ) : hasQuery ? (
      resultsList(mobile)
    ) : null;

  const footer = (mobile: boolean) =>
    scope ? (
      <ScopedFooter scope={scopedSeeAll ?? scope} query={query} mobile={mobile} onSeeAll={handleSelect} />
    ) : (
      <SearchFooter
        semanticPending={semanticPending}
        legendOpen={legendOpen}
        onToggleLegend={() => setLegendOpen((v) => !v)}
        onOpenShortcuts={openShortcuts}
      />
    );

  const clearQuery = (focusRef?: React.RefObject<HTMLInputElement | null>) => {
    setQuery("");
    resetResults();
    focusRef?.current?.focus();
  };

  return (
    <>
      <button
        onClick={openSearch}
        className="rounded-2xl p-2 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
        aria-label={t("label")}
        title={t("title")}
      >
        <Search size={18} />
      </button>

      {open &&
        isMobileViewport &&
        createPortal(
          <div className="fixed inset-0 z-50 flex flex-col bg-bg-primary animate-fade-in">
          <div className="flex items-center gap-2 border-b border-bg-border px-2 py-2">
            <button
              onClick={closeSearch}
              className="flex-shrink-0 rounded-lg p-2 text-text-muted hover:text-text-primary"
              aria-label={tc("close")}
            >
              <ArrowLeft size={20} />
            </button>
            {scope && <ScopeChip scope={scope} onRemove={removeScope} />}
            {browseChip}
            <div className="relative flex-1">
              {searchInput(mobileInputRef, true)}
              {query && (
                <button
                  onClick={() => clearQuery(mobileInputRef)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>

            <div className="flex-1 overflow-y-auto">
              {body(true)}
            </div>

            {footer(true)}
          </div>,
          document.body
        )}

      {open &&
        !isMobileViewport &&
        createPortal(
        // `px-4`: between the mobile sheet and `max-w-3xl` binding the panel is
        // `w-full` against an unpadded container, so without it the card sits
        // flush against the viewport edge.
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh]">
          <div
            className="fixed inset-0 bg-black/50 animate-fade-in"
            onClick={closeSearch}
          />
          <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-bg-border bg-bg-primary shadow-lg animate-fade-in-scale">
            <div className="flex items-center gap-3 border-b border-bg-border px-4 py-3">
              <Search size={18} className="flex-shrink-0 text-text-muted" />
              {scope && <ScopeChip scope={scope} onRemove={removeScope} />}
              {browseChip}
              {searchInput(desktopInputRef, false)}
              {query && (
                <button
                  onClick={() => clearQuery()}
                  className="text-text-muted hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              )}
              <kbd className="rounded-lg bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-muted">
                ESC
              </kbd>
            </div>

            {body(false)}

            {footer(false)}
          </div>
        </div>,
          document.body
        )}
    </>
  );
}
