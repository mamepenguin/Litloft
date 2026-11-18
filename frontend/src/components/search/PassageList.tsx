"use client";

import { useRef, useState, type SyntheticEvent } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { FileTypeIcon } from "@/components/FileTypeIcon";
import { formatDuration } from "@/lib/format";
import {
  findTermForGroup,
  highlightSegments,
  passageHref,
  passageLocator,
  type PassageGroup,
} from "@/lib/searchPassages";
import type { SearchPassage } from "@/lib/searchMerge";
import type { FileType } from "@/types";
import { InNameNotice, type InNameNoticeState } from "./InNameNotice";

const MAX_ROWS_PER_FILE = 3;

export type PassageListState = "loading" | "listed" | "empty" | "failed";

function moreInFileHref(group: PassageGroup): string {
  const term = findTermForGroup(group);
  return term
    ? `/files/${group.fileId}?find=${encodeURIComponent(term)}`
    : `/files/${group.fileId}`;
}

interface PassageListProps {
  state: PassageListState;
  groups: PassageGroup[];
  filesCount: number;
  onRetry?: () => void;
  onShowFiles?: () => void;
  onClearFilter?: () => void;
  /** The `in:` resolution failed or was too large; it outranks `state`. */
  inNameState?: InNameNoticeState | null;
  onRetryInName?: () => void;
}

function Locator({ passage }: { passage: SearchPassage }) {
  const t = useTranslations("search");
  if (passage.kind === "screen_text") {
    return (
      <>
        <span className="block">{formatDuration(passage.start ?? 0)}</span>
        <span className="block text-[11px] font-normal text-text-muted">
          {t("passageScreenText")}
        </span>
      </>
    );
  }
  const locator = passageLocator(passage);
  switch (locator.kind) {
    case "timeRange":
      return (
        <>
          {formatDuration(locator.start)}–{formatDuration(locator.end)}
        </>
      );
    case "timeStartOnly":
      return <>{formatDuration(locator.start)}</>;
    case "page":
      return <>{t("matchedPages", { pages: locator.page })}</>;
    case "section":
      return locator.title ? (
        <span className="block truncate" title={locator.title}>
          {locator.title}
        </span>
      ) : (
        <>{t("matchedSectionNumber", { section: locator.section ?? 0 })}</>
      );
    case "pictureText":
      return <>{t("passagePictureText")}</>;
    case "text":
      return <>{t("passageText")}</>;
  }
}

function Excerpt({ passage }: { passage: SearchPassage }) {
  const t = useTranslations("search");
  if (passage.kind === "scene") {
    return (
      <span className="block text-[13px] leading-relaxed text-text-muted">
        {t("matchClip")}
      </span>
    );
  }
  return (
    <span className="block text-base leading-relaxed text-text-primary [line-break:strict]">
      {passage.keyword
        ? highlightSegments(passage.text, passage.highlight_terms).map(
            (segment, index) =>
              segment.mark ? (
                <mark key={index} className="bg-highlight-bg">
                  {segment.text}
                </mark>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
          )
        : passage.text}
    </span>
  );
}

interface CropSource {
  box: readonly number[];
  match: readonly [number, number];
  largeUrl: string;
}

interface CropRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface CropView {
  region: CropRegion;
  frameWidth: number;
  frameHeight: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function cropSource(passage: SearchPassage): CropSource | null {
  if (passage.kind !== "screen_text") return null;
  const box = passage.line_box;
  if (!Array.isArray(box) || box.length !== 8 || !box.every(isFiniteNumber)) {
    return null;
  }
  const match = passage.line_match;
  if (!Array.isArray(match) || match.length !== 2) return null;
  const m0 = match[0];
  const m1 = match[1];
  if (!isFiniteNumber(m0) || !isFiniteNumber(m1)) return null;
  if (!(m0 >= 0 && m0 <= m1 && m1 <= 1)) return null;
  if (!passage.line_frame_url || !passage.frame_url) return null;
  return { box, match: [m0, m1], largeUrl: passage.line_frame_url };
}

/**
 * The part of the large frame the slot shows, in the frame's pixels: the line
 * is sized by its height so a long line stays readable at 88 px wide.
 */
function cropRegion(
  box: readonly number[],
  match: readonly [number, number],
  frameWidth: number,
  frameHeight: number,
  aspect: number,
): CropRegion {
  const xs = [box[0], box[2], box[4], box[6]].map((x) => x * frameWidth);
  const ys = [box[1], box[3], box[5], box[7]].map((y) => y * frameHeight);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const width0 = Math.max(...xs) - x0;
  const height0 = Math.max(...ys) - y0;

  let height = Math.max(3 * height0, frameWidth / 4 / aspect);
  let width = height * aspect;
  if (height > frameHeight) {
    height = frameHeight;
    width = height * aspect;
  }
  if (width > frameWidth) {
    width = frameWidth;
    height = width / aspect;
  }

  const cx = x0 + (width0 * (match[0] + match[1])) / 2;
  const cy = y0 + height0 / 2;
  const clamp = (value: number, low: number, high: number) =>
    Math.min(Math.max(value, low), high);
  return {
    left: clamp(cx - width / 2, 0, frameWidth - width),
    top: clamp(cy - height / 2, 0, frameHeight - height),
    width,
    height,
  };
}

function PassagePicture({
  passage,
  group,
}: {
  passage: SearchPassage;
  group: PassageGroup;
}) {
  const canShowThumbnail = !group.file || group.file.has_thumbnail !== false;
  const source = cropSource(passage);
  const [stage, setStage] = useState<"frame" | "thumb" | "icon">(() => {
    if (passage.frame_url) return "frame";
    return canShowThumbnail ? "thumb" : "icon";
  });
  const [crop, setCrop] = useState<CropView | null>(null);
  const slotRef = useRef<HTMLSpanElement>(null);
  const thumbnailUrl =
    group.file?.thumbnail_url || `/api/files/${group.fileId}/thumbnail`;
  // A fallback from a failed small frame is final, even if the large frame
  // loads afterwards.
  const cropped = source !== null && stage === "frame" && crop !== null;

  const onLargeFrameLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    if (!source) return;
    const image = event.currentTarget;
    const frameWidth = image.naturalWidth;
    const frameHeight = image.naturalHeight;
    if (!(frameWidth > 0 && frameHeight > 0)) return;
    const slot = slotRef.current?.getBoundingClientRect();
    const aspect =
      slot && slot.width > 0 && slot.height > 0 ? slot.width / slot.height : 16 / 9;
    setCrop({
      region: cropRegion(
        source.box,
        source.match,
        frameWidth,
        frameHeight,
        aspect,
      ),
      frameWidth,
      frameHeight,
    });
  };

  return (
    <span
      ref={slotRef}
      className="relative h-9 w-16 shrink-0 overflow-hidden rounded-lg bg-bg-elevated sm:h-[50px] sm:w-[88px]"
    >
      {stage === "frame" && !cropped && (
        <img
          src={passage.frame_url ?? undefined}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setStage(canShowThumbnail ? "thumb" : "icon")}
        />
      )}
      {source !== null && stage === "frame" && (
        <img
          src={source.largeUrl}
          alt=""
          loading="lazy"
          className={
            cropped
              ? "absolute max-w-none"
              : "absolute inset-0 h-full w-full opacity-0"
          }
          style={
            cropped && crop
              ? {
                  left: `${(-crop.region.left / crop.region.width) * 100}%`,
                  top: `${(-crop.region.top / crop.region.height) * 100}%`,
                  width: `${(crop.frameWidth / crop.region.width) * 100}%`,
                  height: `${(crop.frameHeight / crop.region.height) * 100}%`,
                }
              : undefined
          }
          onLoad={onLargeFrameLoad}
        />
      )}
      {stage === "thumb" && (
        <img
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setStage("icon")}
        />
      )}
      {stage === "icon" && (
        <span className="flex h-full w-full items-center justify-center text-text-muted">
          <FileTypeIcon fileType={group.fileType as FileType} size={18} />
        </span>
      )}
      {stage === "frame" && passage.start !== null && (
        <span className="absolute bottom-1 right-1 rounded bg-black/55 px-1 text-[10px] leading-tight text-white">
          {formatDuration(passage.start)}
        </span>
      )}
    </span>
  );
}

function PassageRow({
  passage,
  group,
}: {
  passage: SearchPassage;
  group: PassageGroup;
}) {
  return (
    <a
      href={passageHref(group.fileId, passage)}
      className="grid grid-cols-[auto_1fr] gap-3 rounded-xl px-1.5 py-2.5 transition-colors hover:bg-accent/5"
    >
      <PassagePicture passage={passage} group={group} />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-text-primary">
          <Locator passage={passage} />
        </span>
        <span
          className="block truncate text-xs text-text-muted"
          title={group.filename}
        >
          {group.filename}
        </span>
        <Excerpt passage={passage} />
      </span>
    </a>
  );
}

function SkeletonRow() {
  return (
    <li data-testid="passage-skeleton-row">
      <span className="grid animate-pulse grid-cols-[auto_1fr] gap-3 rounded-xl px-1.5 py-2.5">
        <span className="h-9 w-16 shrink-0 rounded-lg bg-bg-elevated sm:h-[50px] sm:w-[88px]" />
        <span className="space-y-2">
          <span className="block h-3 w-20 rounded bg-bg-elevated" />
          <span className="block h-3 w-40 rounded bg-bg-elevated" />
          <span className="block h-3 w-full rounded bg-bg-elevated" />
        </span>
      </span>
    </li>
  );
}

export function PassageList({
  state,
  groups,
  filesCount,
  onRetry,
  onShowFiles,
  onClearFilter,
  inNameState,
  onRetryInName,
}: PassageListProps) {
  const t = useTranslations("search");

  if (inNameState) {
    return (
      <InNameNotice
        state={inNameState}
        onRetry={inNameState === "failed" ? onRetryInName : undefined}
      />
    );
  }

  if (state === "loading") {
    return (
      <ol className="w-full max-w-list-row">
        {[0, 1, 2].map((index) => (
          <SkeletonRow key={index} />
        ))}
      </ol>
    );
  }

  if (state === "failed") {
    return (
      <div role="alert" className="mx-auto flex w-full max-w-list-row flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-text-muted">{t("passagesFailed")}</p>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t("retry")}
          </Button>
        )}
      </div>
    );
  }

  if (state === "empty") {
    const secondaryActions = [];
    if (filesCount > 0 && onShowFiles) {
      secondaryActions.push({ label: t("showFiles"), onClick: onShowFiles });
    }
    if (onClearFilter) {
      secondaryActions.push({ label: t("clearFilter"), onClick: onClearFilter });
    }
    return (
      <EmptyState
        variant="no-results"
        secondaryActions={
          secondaryActions.length > 0 ? secondaryActions : undefined
        }
      />
    );
  }

  return (
    <ol aria-label={t("passageList")} className="w-full max-w-list-row">
      {groups.map((group) => (
        <li key={group.fileId} className="border-b border-bg-border">
          <ol>
            {group.passages.slice(0, MAX_ROWS_PER_FILE).map((passage, index) => (
              <li key={index}>
                <PassageRow passage={passage} group={group} />
              </li>
            ))}
          </ol>
          {group.passages.length > MAX_ROWS_PER_FILE && (
            <a
              href={moreInFileHref(group)}
              aria-label={t("moreInFileName", { file: group.filename })}
              className="ml-1 block py-1 text-xs text-text-muted hover:text-text-primary"
            >
              {t("moreInFile")}
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}
