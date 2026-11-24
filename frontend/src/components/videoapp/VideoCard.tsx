"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

import { CardProgress } from "@/components/CardProgress";
import { ContextMenu, type MenuItem } from "@/components/ContextMenu";
import { FileTypeIcon } from "@/components/FileTypeIcon";
import { useToast } from "@/components/ToastProvider";
import {
  useCardFileMenuHandlers,
  type CardItemActions,
  type CardFileMenuHandlers,
} from "@/components/appshell/CardFileMenu";
import { useContextMenu } from "@/hooks/useContextMenu";
import type { ShelfItemAction } from "@/lib/addons";
import { getThumbnailUrl, type ShelfItem } from "@/lib/api";
import { fileLinkHref } from "@/lib/canonicalFileUrl";
import { formatDuration } from "@/lib/format";
import { hasKnownLength } from "@/lib/primaryMeta";

export type VideoCardMenu = CardItemActions;

interface CardLinkProps {
  item: ShelfItem;
  byline?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  onContextMenu?: React.MouseEventHandler<HTMLAnchorElement>;
  onTouchStart?: React.TouchEventHandler<HTMLAnchorElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLAnchorElement>;
  onTouchMove?: React.TouchEventHandler<HTMLAnchorElement>;
  /** The card opens the page's file menu rather than a menu of its own. */
  fileMenu?: boolean;
}

function EmptyIcon() {
  return <span className="inline-block h-3.5 w-3.5" aria-hidden="true" />;
}

function CardLink({
  item,
  byline,
  onClick,
  onContextMenu,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  fileMenu = false,
}: CardLinkProps) {
  const progress = item.watch_progress;
  const interactive = onContextMenu !== undefined;
  return (
    <Link
      href={fileLinkHref(item)}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
      className={`group block min-w-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring${
        fileMenu
          ? " select-none [-webkit-touch-callout:none]"
          : interactive
            ? " [-webkit-touch-callout:none]"
            : ""
      }`}
    >
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-bg-elevated">
        {item.has_thumbnail ? (
          <img
            src={getThumbnailUrl(item.id)}
            alt=""
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileTypeIcon fileType={item.file_type} size={40} className="text-text-muted" />
          </div>
        )}
        {hasKnownLength(item) && (
          <span className="absolute bottom-2 right-2 rounded-lg bg-black/70 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
            {formatDuration(item.duration)}
          </span>
        )}
        {progress && progress.duration > 0 && (
          <CardProgress
            position={progress.position}
            duration={progress.duration}
            ranges={item.watched_ranges}
            trackClassName="h-1 bg-black/50"
            fillClassName="bg-white"
          />
        )}
      </div>
      <span className="mt-3 line-clamp-2 text-base/[1.375rem] font-medium text-text-primary">
        {item.title}
      </span>
      {typeof byline === "string" && byline !== "" && (
        <>
          {" "}
          <span className="mt-1 block truncate text-sm text-text-muted">{byline}</span>
        </>
      )}
    </Link>
  );
}

function VideoCardWithMenu({
  item,
  byline,
  menu,
}: {
  item: ShelfItem;
  byline?: string;
  menu: VideoCardMenu;
}) {
  const tf = useTranslations("file");
  const tc = useTranslations("common");
  const toast = useToast();
  const { menuState, close, handlers } = useContextMenu();
  const [pending, setPending] = useState<string | null>(null);
  const suppressClick = useRef(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!menuState.open) return;
    const onContextMenu = () => close();
    document.addEventListener("contextmenu", onContextMenu, true);
    return () => document.removeEventListener("contextmenu", onContextMenu, true);
  }, [menuState.open, close]);

  const clearPressTimer = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLAnchorElement>) => {
    suppressClick.current = false;
    handlers.onTouchStart(e);
    clearPressTimer();
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      suppressClick.current = true;
    }, 500);
  };

  const handleTouchEnd = () => {
    handlers.onTouchEnd();
    clearPressTimer();
  };

  const handleTouchMove = () => {
    handlers.onTouchMove();
    clearPressTimer();
  };

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const runAction = async (action: ShelfItemAction) => {
    if (pending !== null) return;
    const { viewer, isSameViewer, onRemoved, onRestored } = menu;
    setPending(action.id);

    let result: unknown;
    try {
      result = await action.run(item.id);
    } catch {
      setPending(null);
      toast.error(tc("saveFailed"));
      return;
    }
    if (
      result === null ||
      typeof result !== "object" ||
      typeof (result as { message?: unknown }).message !== "string"
    ) {
      setPending(null);
      toast.error(tc("saveFailed"));
      return;
    }

    const { message, undo } = result as { message: string; undo?: unknown };
    const undoAction = typeof undo === "function" ? undo : undefined;
    setPending(null);
    onRemoved(item);
    toast.success(
      message,
      undoAction
        ? {
            action: {
              label: tc("undo"),
              onClick: () => {
                void (async () => {
                  if (!isSameViewer(viewer)) return;
                  try {
                    await undoAction();
                  } catch {
                    toast.error(tc("saveFailed"));
                    return;
                  }
                  onRestored(item);
                })();
              },
            },
          }
        : undefined,
    );
  };

  const menuItems: MenuItem[] = [
    {
      icon: ExternalLink,
      label: tf("openInNewTab"),
      immediate: true,
      onClick: () => {
        window.open(fileLinkHref(item), "_blank");
      },
    },
    ...menu.actions.map((action) => ({
      icon: action.icon ?? EmptyIcon,
      label: action.label,
      disabled: pending === action.id,
      immediate: true,
      onClick: () => {
        void runAction(action);
      },
    })),
  ];

  return (
    <>
      <CardLink
        item={item}
        byline={byline}
        onClick={handleClick}
        onContextMenu={handlers.onContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
      />
      <ContextMenu
        open={menuState.open}
        position={menuState.position}
        items={menuItems}
        onClose={close}
      />
    </>
  );
}

export function VideoCard({
  item,
  byline,
  menu,
  fileMenu,
}: {
  item: ShelfItem;
  byline?: string;
  menu?: VideoCardMenu;
  /** Attach the page's file menu; absent leaves the card as it was. */
  fileMenu?: { listKey: string };
}) {
  const handlers: CardFileMenuHandlers = useCardFileMenuHandlers(item, {
    enabled: fileMenu !== undefined,
    listKey: fileMenu?.listKey ?? "",
    actions: menu,
  });

  if (fileMenu === undefined) {
    if (!menu || menu.actions.length === 0) {
      return <CardLink item={item} byline={byline} />;
    }
    return <VideoCardWithMenu item={item} byline={byline} menu={menu} />;
  }

  return (
    <CardLink
      item={item}
      byline={byline}
      onClick={handlers.onClick}
      onContextMenu={handlers.onContextMenu}
      onTouchStart={handlers.onTouchStart}
      onTouchEnd={handlers.onTouchEnd}
      onTouchMove={handlers.onTouchMove}
      fileMenu
    />
  );
}
