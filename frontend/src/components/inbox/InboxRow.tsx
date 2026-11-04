"use client";

import Link from "next/link";
import { useRef, type MouseEvent, type PointerEvent } from "react";
import { AlertCircle, Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { FileTypeIcon } from "@/components/FileTypeIcon";
import {
  ProcessingStageIcon,
  processingStageLabel,
} from "@/components/ProcessingStageMark";
import { getThumbnailUrl, type InboxItem } from "@/lib/api";
import type { InboxStageDisplay } from "@/lib/inboxStage";

const ROW_CLASS =
  "group/inbox-row relative flex items-center gap-3 rounded-2xl px-3 py-2 [-webkit-touch-callout:none]";
const LINK_CLASS = "flex min-w-0 flex-1 items-center gap-3";
const THUMB_CLASS = "h-12 w-12 shrink-0 rounded-lg bg-sand";
const NAME_CLASS = "block truncate text-sm font-medium text-text-primary";
const META_CLASS =
  "mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-text-muted";
const CHECKBOX_CLASS =
  "h-4 w-4 shrink-0 rounded border border-warm-silver/40 pointer-coarse:hidden";
const DONE_CLASS =
  "flex h-8 shrink-0 items-center rounded-2xl px-3 text-sm text-text-primary bg-sand opacity-0 transition-opacity group-hover/inbox-row:opacity-100 group-focus-within/inbox-row:opacity-100 focus-visible:opacity-100 pointer-coarse:h-11 pointer-coarse:px-4 pointer-coarse:md:opacity-100";

const LONG_PRESS_MS = 500;

function coarsePointer(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function fromControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("button, input") !== null
  );
}

export interface InboxRowProps {
  item: InboxItem;
  sourceLabel: string;
  timeLabel: string;
  folderLabel: string;
  stage: InboxStageDisplay;
  selected: boolean;
  selectionMode: boolean;
  onToggle: (id: string) => void;
  onDone: (id: string) => void;
  onLongPress: (id: string) => void;
  onContextMenu: (event: MouseEvent, item: InboxItem) => void;
}

export function InboxRow({
  item,
  sourceLabel,
  timeLabel,
  folderLabel,
  stage,
  selected,
  selectionMode,
  onToggle,
  onDone,
  onLongPress,
  onContextMenu,
}: InboxRowProps) {
  const t = useTranslations("inbox");
  const tu = useTranslations("upload");
  const file = item.file;
  const name = file.title || file.filename;
  const linkRef = useRef<HTMLAnchorElement | null>(null);
  const start = useRef<{ x: number; y: number; width: number } | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swiping = useRef(false);
  const scrolled = useRef(false);
  const suppressClick = useRef(false);

  function clearLongPress() {
    if (longPress.current !== null) {
      clearTimeout(longPress.current);
      longPress.current = null;
    }
  }

  function resetTransform() {
    const link = linkRef.current;
    if (!link) return;
    link.style.transform = "";
    link.style.transition = "";
  }

  function handlePointerDown(event: PointerEvent<HTMLLIElement>) {
    if (!coarsePointer() || fromControl(event.target)) return;
    start.current = {
      x: event.clientX,
      y: event.clientY,
      width: event.currentTarget.getBoundingClientRect().width,
    };
    swiping.current = false;
    scrolled.current = false;
    suppressClick.current = false;
    clearLongPress();
    longPress.current = setTimeout(() => {
      longPress.current = null;
      suppressClick.current = true;
      onLongPress(file.id);
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(event: PointerEvent<HTMLLIElement>) {
    const origin = start.current;
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
      scrolled.current = true;
      clearLongPress();
      resetTransform();
      return;
    }
    if (dx < 0 && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
      clearLongPress();
      swiping.current = true;
      const link = linkRef.current;
      if (link && !reducedMotion()) {
        link.style.transition = "none";
        link.style.transform = `translateX(${dx}px)`;
      }
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLLIElement>) {
    const origin = start.current;
    start.current = null;
    clearLongPress();
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (scrolled.current) {
      resetTransform();
      return;
    }
    if (
      dx < 0 &&
      Math.abs(dx) >= origin.width / 3 &&
      Math.abs(dx) > Math.abs(dy)
    ) {
      suppressClick.current = true;
      if (!reducedMotion()) {
        const link = linkRef.current;
        if (link) {
          link.style.transition = "transform 200ms ease-out";
          link.style.transform = `translateX(-${origin.width}px)`;
        }
      }
      onDone(file.id);
    } else if (swiping.current) {
      const link = linkRef.current;
      if (link) {
        if (reducedMotion()) {
          resetTransform();
        } else {
          link.style.transition = "transform 200ms ease-out";
          link.style.transform = "translateX(0)";
        }
      }
    }
    if (suppressClick.current) {
      // A browser dispatches the link's click right after this event; the
      // timer only clears the flag for a later, real click.
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
  }

  function handlePointerCancel() {
    start.current = null;
    clearLongPress();
    swiping.current = false;
    resetTransform();
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (selectionMode) {
      event.preventDefault();
      onToggle(file.id);
      return;
    }
    if (suppressClick.current) {
      suppressClick.current = false;
      event.preventDefault();
    }
  }

  function handleContextMenu(event: MouseEvent<HTMLLIElement>) {
    if (coarsePointer()) {
      event.preventDefault();
      return;
    }
    onContextMenu(event, item);
  }

  return (
    <li
      className={ROW_CLASS}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={handleContextMenu}
    >
      <Link
        ref={linkRef}
        href={`/files/${file.id}?nav=inbox`}
        className={LINK_CLASS}
        onClick={handleClick}
        draggable={false}
      >
        {file.has_thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={getThumbnailUrl(file.id)}
            alt=""
            className={`${THUMB_CLASS} object-cover`}
          />
        ) : (
          <span
            aria-hidden="true"
            className={`${THUMB_CLASS} flex items-center justify-center text-text-muted`}
          >
            <FileTypeIcon fileType={file.file_type} size={20} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={NAME_CLASS}>{name}</span>
          <span className={META_CLASS}>
            <span>{sourceLabel}</span>
            <span>{timeLabel}</span>
            <span>{folderLabel}</span>
            <StageMark stage={stage} tu={tu} />
          </span>
        </span>
      </Link>

      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(file.id)}
        aria-label={t("selectArrival", { name })}
        className={CHECKBOX_CLASS}
      />

      <button
        type="button"
        onClick={() => onDone(file.id)}
        aria-label={`${t("done")} ${name}`}
        className={DONE_CLASS}
      >
        {t("done")}
      </button>
    </li>
  );
}

function StageMark({
  stage,
  tu,
}: {
  stage: InboxStageDisplay;
  tu: (key: string) => string;
}) {
  if (stage.kind === "none") return null;

  if (stage.kind === "unavailable") {
    return (
      <span className="inline-flex items-center gap-1">
        <span>{tu("stageUnavailable")}</span>
        {stage.failed && <AlertCircle size={12} className="text-danger" />}
      </span>
    );
  }

  if (stage.kind === "ready") {
    return (
      <span className="inline-flex items-center gap-1 text-accent-teal">
        <Check size={12} />
        <span>{tu("ready")}</span>
        {stage.failed && <AlertCircle size={12} className="text-danger" />}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <ProcessingStageIcon stage={stage.stage} />
      <span>{processingStageLabel(tu, stage.stage)}</span>
      {stage.failed && <AlertCircle size={12} className="text-danger" />}
    </span>
  );
}
