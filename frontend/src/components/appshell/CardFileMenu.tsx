"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";

import { FileContextMenu } from "@/components/FileContextMenu";
import { useToast } from "@/components/ToastProvider";
import type { ShelfItemAction } from "@/lib/addons";
import {
  deleteWatchProgress,
  dismissContinueItem,
  getShelves,
  type ShelfItem,
} from "@/lib/api";
import { fileLinkHref } from "@/lib/canonicalFileUrl";
import type { FileItem } from "@/types";

/** The Recommended card's actions and the list callbacks they run against. */
export interface CardItemActions {
  actions: ShelfItemAction[];
  viewer: string | null;
  isSameViewer: (viewer: string | null) => boolean;
  onRemoved: (item: ShelfItem) => void;
  onRestored: (item: ShelfItem) => void;
}

export interface CardFileLists {
  /** The list's items with menu removals and re-read answers applied, in order. */
  filter: (listKey: string, items: readonly ShelfItem[]) => ShelfItem[];
  /** How many of the held items this list has lost, for a drawn count and offset paging. */
  removedCount: (listKey: string, items: readonly ShelfItem[]) => number;
}

interface CardFileMenuContextValue extends CardFileLists {
  open: (
    item: ShelfItem,
    listKey: string,
    position: { x: number; y: number },
    actions?: CardItemActions,
  ) => void;
}

/** A Discover shelf's list key; the two apps name their shelves alike. */
export function discoverListKey(id: string): string {
  return `discover:${id}`;
}

/**
 * A page request that stays aligned after items left the pages already held.
 * A page-number request after a removal would start past the shifted boundary;
 * the offset starts where the held list now ends.
 */
export function pagedParams(
  page: number,
  removedBefore: number,
  size: number,
): { page: number } | { offset: number } {
  if (removedBefore === 0) return { page };
  if (page === 1) return { offset: 0 };
  return { offset: Math.max(0, (page - 1) * size - removedBefore) };
}

const CardFileMenuContext = createContext<CardFileMenuContextValue | null>(null);
const NO_LISTS: CardFileLists = {
  filter: (_listKey, items) => [...items],
  removedCount: () => 0,
};

interface PageState {
  scope: string;
  trashed: ReadonlySet<string>;
  removed: ReadonlyMap<string, ReadonlySet<string>>;
  overrides: ReadonlyMap<string, ShelfItem>;
}

interface Opened {
  scope: string;
  item: ShelfItem;
  listKey: string;
  actions?: CardItemActions;
  position: { x: number; y: number };
  menuOpen: boolean;
}

interface Pending {
  scope: string;
  keys: ReadonlySet<string>;
}

const EMPTY_KEYS: ReadonlySet<string> = new Set();
const NO_LIST: ReadonlySet<string> = new Set();

function freshPage(scope: string): PageState {
  return {
    scope,
    trashed: new Set(),
    removed: new Map(),
    overrides: new Map(),
  };
}

function mergeAnswer(drawn: ShelfItem, answer: ShelfItem): ShelfItem {
  return {
    ...answer,
    ...(answer.watch_progress === undefined ? { watch_progress: drawn.watch_progress } : {}),
    ...(answer.watched_ranges === undefined ? { watched_ranges: drawn.watched_ranges } : {}),
  };
}

function pendingKey(fileId: string, actionId: string): string {
  return `${fileId}\u0000${actionId}`;
}

export interface CardFileMenuOptions {
  /** Changes when the drive, Target, profile or Discover visit the page shows changes. */
  scope: string;
  hasProfile: boolean;
  /** The list keys whose cards offer the two history rows. */
  continueListKeys?: readonly string[];
  /** A cache store to keep an id out of after a trash, such as Video Discover's. */
  onTrashed?: (id: string) => void;
}

/**
 * One file menu for a page, and the list changes its rows make. The menu lives
 * here rather than on a card, so a dialog outlives the card behind it and a
 * second card moves the menu instead of opening another.
 */
export function useCardFileMenu({
  scope,
  hasProfile,
  continueListKeys = [],
  onTrashed,
}: CardFileMenuOptions): {
  context: CardFileMenuContextValue;
  menu: ReactNode;
  filter: CardFileLists["filter"];
  removedCount: CardFileLists["removedCount"];
} {
  const tDrive = useTranslations("drive");
  const tc = useTranslations("common");
  const toast = useToast();

  const [page, setPage] = useState<PageState>(() => freshPage(scope));
  if (page.scope !== scope) setPage(freshPage(scope));
  const livePage = page.scope === scope ? page : freshPage(scope);

  const [opened, setOpened] = useState<Opened | null>(null);
  const liveOpened = opened !== null && opened.scope === scope ? opened : null;

  const [pending, setPending] = useState<Pending>(() => ({ scope, keys: EMPTY_KEYS }));
  if (pending.scope !== scope) setPending({ scope, keys: EMPTY_KEYS });
  const livePending = pending.scope === scope ? pending.keys : EMPTY_KEYS;

  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const pendingRef = useRef<ReadonlySet<string>>(livePending);
  pendingRef.current = livePending;
  const tickets = useRef(new Map<string, number>());
  // Kept for the page's lifetime: an item action's undo must not restore an id
  // the menu trashed, even after the page moved to another Target.
  const trashedEver = useRef(new Set<string>());
  const openedRef = useRef<Opened | null>(liveOpened);
  openedRef.current = liveOpened;
  const onTrashedRef = useRef(onTrashed);
  onTrashedRef.current = onTrashed;

  const change = (captured: string, next: (held: PageState) => PageState) => {
    setPage((held) => (held.scope === captured ? next(held) : held));
  };

  const hide = (captured: string, listKey: string, id: string) => {
    change(captured, (held) => {
      const removed = new Map(held.removed);
      removed.set(listKey, new Set(removed.get(listKey) ?? NO_LIST).add(id));
      return { ...held, removed };
    });
  };

  const setRunning = (key: string, running: boolean) => {
    const keys = new Set(pendingRef.current);
    if (running) keys.add(key);
    else keys.delete(key);
    pendingRef.current = keys;
    setPending((held) => ({
      scope: held.scope,
      keys: new Set(keys),
    }));
  };

  const runAction = async (target: Opened, action: ShelfItemAction) => {
    const key = pendingKey(target.item.id, action.id);
    if (pendingRef.current.has(key)) return;
    const owner = target.actions;
    if (!owner) return;
    setRunning(key, true);

    let result: unknown;
    try {
      result = await action.run(target.item.id);
    } catch {
      setRunning(key, false);
      toast.error(tc("saveFailed"));
      return;
    }
    if (
      result === null ||
      typeof result !== "object" ||
      typeof (result as { message?: unknown }).message !== "string"
    ) {
      setRunning(key, false);
      toast.error(tc("saveFailed"));
      return;
    }

    const { message, undo } = result as { message: string; undo?: unknown };
    const undoAction = typeof undo === "function" ? undo : undefined;
    setRunning(key, false);
    owner.onRemoved(target.item);
    toast.success(
      message,
      undoAction
        ? {
            action: {
              label: tc("undo"),
              onClick: () => {
                void (async () => {
                  if (!owner.isSameViewer(target.actions?.viewer ?? null)) return;
                  try {
                    await undoAction();
                  } catch {
                    toast.error(tc("saveFailed"));
                    return;
                  }
                  if (trashedEver.current.has(target.item.id)) return;
                  owner.onRestored(target.item);
                })();
              },
            },
          }
        : undefined,
    );
  };

  const filter: CardFileLists["filter"] = (listKey, items) => {
    const gone = livePage.removed.get(listKey);
    const out: ShelfItem[] = [];
    for (const item of items) {
      if (livePage.trashed.has(item.id) || gone?.has(item.id)) continue;
      const answer = livePage.overrides.get(item.id);
      out.push(answer === undefined ? item : mergeAnswer(item, answer));
    }
    return out;
  };

  const removedCount: CardFileLists["removedCount"] = (listKey, items) => {
    const gone = livePage.removed.get(listKey);
    return items.filter(
      (item) => livePage.trashed.has(item.id) || gone?.has(item.id),
    ).length;
  };

  const open: CardFileMenuContextValue["open"] = (item, listKey, position, actions) => {
    setOpened({ scope: scopeRef.current, item, listKey, actions, position, menuOpen: true });
  };

  const close = () => {
    setOpened((held) => (held === null ? held : { ...held, menuOpen: false }));
  };

  const offersHistory =
    liveOpened !== null && hasProfile && continueListKeys.includes(liveOpened.listKey);

  const onRemoveFromContinue = offersHistory
    ? async () => {
        const target = openedRef.current;
        if (target === null) return;
        try {
          await dismissContinueItem(target.item.id);
        } catch (error) {
          toast.error(tDrive("couldNotRemoveFromContinue"));
          throw error;
        }
        if (scopeRef.current === target.scope) hide(target.scope, target.listKey, target.item.id);
      }
    : undefined;

  const onRemoveFromHistory = offersHistory
    ? async () => {
        const target = openedRef.current;
        if (target === null) return;
        try {
          await deleteWatchProgress(target.item.id);
        } catch {
          return;
        }
        if (scopeRef.current === target.scope) hide(target.scope, target.listKey, target.item.id);
      }
    : undefined;

  const extraMenuItems =
    liveOpened?.actions && liveOpened.actions.actions.length > 0
      ? () =>
          liveOpened.actions!.actions.map((action) => ({
            id: action.id,
            label: action.label,
            icon: action.icon ?? EmptyIcon,
            disabled: livePending.has(pendingKey(liveOpened.item.id, action.id)),
            onSelect: () => {
              void runAction(liveOpened, action);
            },
          }))
      : undefined;

  const handleTrashed = (file: FileItem) => {
    const target = openedRef.current;
    trashedEver.current.add(file.id);
    onTrashedRef.current?.(file.id);
    if (target === null || scopeRef.current !== target.scope) return;
    change(target.scope, (held) => ({
      ...held,
      trashed: new Set(held.trashed).add(file.id),
    }));
  };

  const handleReRead = (file: FileItem) => {
    const target = openedRef.current;
    const id = file.id;
    const ticket = (tickets.current.get(id) ?? 0) + 1;
    tickets.current.set(id, ticket);
    const captured = target?.scope ?? null;
    void getShelves(file.drive, { by: "all", ids: [id] }).then(
      (answer) => {
        if (captured === null || scopeRef.current !== captured) return;
        if (tickets.current.get(id) !== ticket) return;
        const found = answer.shelves.flatMap((shelf) => shelf.items).find((item) => item.id === id);
        if (found === undefined) return;
        change(captured, (held) => ({
          ...held,
          overrides: new Map(held.overrides).set(id, found),
        }));
      },
      () => {
        // The cards keep what they drew; the next load shows the truth.
      },
    );
  };

  const context: CardFileMenuContextValue = { open, filter, removedCount };

  const menu =
    liveOpened === null ? null : (
      <FileContextMenu
        open={liveOpened.menuOpen}
        position={liveOpened.position}
        target={liveOpened.item}
        onClose={close}
        onOpenInNewTab={() => {
          window.open(fileLinkHref(liveOpened.item), "_blank");
        }}
        extraMenuItems={extraMenuItems}
        immediateRows
        onRemoveFromContinue={onRemoveFromContinue}
        onRemoveFromHistory={onRemoveFromHistory}
        onTrashed={handleTrashed}
        onRenamed={handleReRead}
        onMoved={handleReRead}
      />
    );

  return { context, menu, filter, removedCount };
}

export function CardFileMenuProvider({
  value,
  children,
}: {
  value: CardFileMenuContextValue;
  children: ReactNode;
}) {
  return (
    <CardFileMenuContext.Provider value={value}>{children}</CardFileMenuContext.Provider>
  );
}

/** The page's list changes, for a component that is not the page itself. */
export function useCardFileLists(): CardFileLists {
  return useContext(CardFileMenuContext) ?? NO_LISTS;
}

export interface CardFileMenuHandlers {
  onContextMenu?: React.MouseEventHandler<HTMLElement>;
  onTouchStart?: React.TouchEventHandler<HTMLElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLElement>;
  onTouchMove?: React.TouchEventHandler<HTMLElement>;
  onClick?: React.MouseEventHandler<HTMLElement>;
}

/**
 * A card's entry into the page's file menu: a right-click, or a 500 ms press
 * without movement. The click that ends a press that opened the menu is
 * swallowed so it does not open the card.
 */
export function useCardFileMenuHandlers(
  item: ShelfItem,
  {
    enabled,
    listKey,
    actions,
  }: {
    enabled: boolean;
    listKey: string;
    actions?: CardItemActions;
  },
): CardFileMenuHandlers {
  const menu = useContext(CardFileMenuContext);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const pressAt = useRef({ x: 0, y: 0 });
  const latest = useRef({ item, listKey, actions });
  latest.current = { item, listKey, actions };

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!enabled || menu === null) return {};

  return {
    onContextMenu: (event) => {
      event.preventDefault();
      event.stopPropagation();
      suppressClick.current = false;
      clear();
      menu.open(
        latest.current.item,
        latest.current.listKey,
        { x: event.clientX, y: event.clientY },
        latest.current.actions,
      );
    },
    onTouchStart: (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      pressAt.current = { x: touch.clientX, y: touch.clientY };
      suppressClick.current = false;
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        suppressClick.current = true;
        menu.open(
          latest.current.item,
          latest.current.listKey,
          pressAt.current,
          latest.current.actions,
        );
      }, 500);
    },
    onTouchMove: () => {
      clear();
    },
    onTouchEnd: () => {
      clear();
    },
    onClick: (event) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}

function EmptyIcon() {
  return <span className="inline-block h-3.5 w-3.5" aria-hidden="true" />;
}
