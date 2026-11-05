"use client";

import { useState } from "react";
import Link from "next/link";
import { ImagePlus, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { FileTypeIcon } from "@/components/FileTypeIcon";
import { PageHeader } from "@/components/PageHeader";
import { SearchQueryHeader } from "@/components/search/SearchQueryHeader";
import { formatDuration } from "@/lib/format";
import type {
  ImageAnswer,
  ImageAvailability,
  ImageEntry,
  ImageHit,
  SceneHit,
} from "@/lib/imageQuery";
import type { FileType } from "@/types";

import type { ImageInputError } from "./useImageInput";

export const IMAGE_GROUP_ORDER = ["documents", "pictures", "scenes"] as const;
export type ImageGroup = (typeof IMAGE_GROUP_ORDER)[number];

export function failureMessage(
  t: (key: string) => string,
  status: number | "network",
): string {
  if (status === 403) return t("imageDriveLocked");
  if (status === 400 || status === 404) return t("imageUnavailable");
  if (status === 413) return t("imageTooLarge");
  if (status === 415 || status === 422) return t("imageUnreadable");
  return t("imageFailed");
}

function sizeMessage(
  t: (key: string) => string,
  error: ImageInputError,
): string {
  if (error === "too_large") return t("imageTooLarge");
  if (error === "unreadable") return t("imageUnreadable");
  return t("imageOneOnly");
}

function documentHref(fileId: string, passage: ImageAnswer["documents"][number]["passages"][number]): string {
  if (passage.kind === "page") return `/files/${fileId}?page=${passage.page}`;
  if (passage.kind === "section") return `/files/${fileId}?section=${passage.section}`;
  return `/files/${fileId}`;
}

function documentLocator(
  t: (key: string, values?: Record<string, string | number | Date>) => string,
  passage: ImageAnswer["documents"][number]["passages"][number],
): string {
  if (passage.kind === "page") return t("matchedPages", { pages: passage.page ?? 0 });
  if (passage.kind === "section") {
    return passage.section_title || t("matchedSectionNumber", { section: passage.section ?? 0 });
  }
  return t("passageText");
}

function DocumentThumb({ document }: { document: ImageAnswer["documents"][number] }) {
  const [stage, setStage] = useState<"thumb" | "icon">(
    document.file !== null ? "thumb" : "icon",
  );
  if (stage === "icon") {
    return (
      <span className="flex h-full w-full items-center justify-center text-text-muted">
        <FileTypeIcon fileType={document.file_type as FileType} size={18} />
      </span>
    );
  }
  return (
    <img
      src={`/api/files/${document.file_id}/thumbnail`}
      alt=""
      loading="lazy"
      className="h-full w-full object-cover"
      onError={() => setStage("icon")}
    />
  );
}

function DocumentRows({
  documents,
}: {
  documents: ImageAnswer["documents"];
}) {
  const t = useTranslations("search");
  return (
    <ol className="mx-auto w-full max-w-list-row">
      {documents.map((document) => (
        <li key={document.file_id} className="border-b border-bg-border">
          {document.passages.map((passage, index) => (
            <Link
              key={index}
              href={documentHref(document.file_id, passage)}
              className="grid grid-cols-[auto_1fr] gap-3 rounded-xl px-1.5 py-2.5 transition-colors hover:bg-accent/5"
            >
              <span className="relative h-9 w-16 shrink-0 overflow-hidden rounded-lg bg-bg-elevated sm:h-[50px] sm:w-[88px]">
                <DocumentThumb document={document} />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-text-primary">
                  {documentLocator(t, passage)}
                </span>
                <span className="block truncate text-xs text-text-muted" title={document.filename}>
                  {document.filename}
                </span>
                <span className="block text-[13px] leading-relaxed text-text-primary [line-break:strict]">
                  {passage.text}
                </span>
              </span>
            </Link>
          ))}
        </li>
      ))}
    </ol>
  );
}

function SceneFrame({ hit }: { hit: SceneHit }) {
  const [stage, setStage] = useState<"frame" | "thumb" | "icon">("frame");
  if (stage === "icon") {
    return (
      <span className="flex h-full w-full items-center justify-center text-text-muted">
        <FileTypeIcon fileType="video" size={18} />
      </span>
    );
  }
  return (
    <img
      src={
        stage === "frame"
          ? hit.frame_url
          : `/api/files/${hit.file_id}/thumbnail`
      }
      alt=""
      loading="lazy"
      className="h-full w-full object-cover"
      onError={() => setStage(stage === "frame" ? "thumb" : "icon")}
    />
  );
}

export interface ImageQueryPresenterProps {
  drive: string;
  availability: ImageAvailability;
  entry: ImageEntry | undefined;
  error: ImageInputError | null;
  preparing: boolean;
  overlay: boolean;
  onRemoveImage: () => void;
  onImagePick: (file: File) => void;
  onImagePaste: (file: File) => void;
  onImageMany: () => void;
  onEdit: () => void;
  onRetry: () => void;
  onDrop: (event: React.DragEvent) => void;
  onDragEnter: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
}

export function ImageQueryViewPresenter({
  drive,
  availability,
  entry,
  error,
  preparing,
  overlay,
  onRemoveImage,
  onImagePick,
  onImagePaste,
  onImageMany,
  onEdit,
  onRetry,
  onDrop,
  onDragEnter,
  onDragOver,
  onDragLeave,
}: ImageQueryPresenterProps) {
  const t = useTranslations("search");
  const available = availability === "available";
  const answer = entry?.state === "answered" ? entry.answer : null;
  const failure = entry?.state === "failed" ? entry.failure : null;
  const loading = entry?.state === "loading" || entry?.state === "pending";

  const parts: string[] = [];
  if (answer) {
    if (answer.documents.length) {
      parts.push(`${t("imageScopeDocuments")} ${answer.documents.length}`);
    }
    if (answer.images.length) {
      parts.push(`${t("imageScopePictures")} ${answer.images.length}`);
    }
    if (answer.scenes.length) {
      parts.push(`${t("imageScopeScenes")} ${answer.scenes.length}`);
    }
  }
  const scope = answer
    ? parts.length
      ? parts.join(t("imageScopeSeparator"))
      : t("imageScopeZero")
    : undefined;

  const groups: ImageGroup[] = [];
  if (answer) {
    if (answer.documents.length) groups.push("documents");
    if (answer.images.length) groups.push("pictures");
    if (answer.scenes.length || answer.scenes_partial) groups.push("scenes");
    if (!answer.documents.length && answer.text.status === "failed") {
      groups.push("documents");
    }
  }
  const hasHits = !!answer && (
    answer.documents.length > 0 || answer.images.length > 0 || answer.scenes.length > 0
  );

  const header = (
    <PageHeader
      title={t("imageSearch")}
      titleField={
        <SearchQueryHeader
          drive={drive}
          query=""
          typeFilter={null}
          sort="relevance"
          order="desc"
          smartFolderId={null}
          includeSceneClip={false}
          imageSrc={entry?.objectUrl ?? null}
          onRemoveImage={available ? onRemoveImage : undefined}
          onImagePick={available ? onImagePick : undefined}
          onImagePaste={available ? onImagePaste : undefined}
          onImageMany={available ? onImageMany : undefined}
          onEdit={onEdit}
          imagePreparing={preparing}
        />
      }
      scope={scope}
    />
  );

  return (
    <div
      className="flex flex-1 flex-col"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {header}

      {error && (
        <p role="alert" className="px-4 pb-2 text-xs text-text-muted">
          {sizeMessage(t, error)}
        </p>
      )}

      {!entry && (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-text-muted">
            {available ? t("imageGone") : t("imageUnavailable")}
          </p>
        </div>
      )}

      {entry && loading && (
        <div className="px-4 py-4" data-testid="image-query-loading">
          <span className="block h-24 w-full max-w-list-row animate-pulse rounded-xl bg-bg-elevated" />
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="mt-3 block h-12 w-full max-w-list-row animate-pulse rounded-xl bg-bg-elevated"
            />
          ))}
        </div>
      )}

      {failure && (
        <div role="alert" className="flex flex-col items-start gap-3 px-4 py-6">
          <p className="text-sm text-text-muted">
            {failureMessage(t, failure.status)}
          </p>
          {failure.retryable && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t("retry")}
            </Button>
          )}
        </div>
      )}

      {answer && (
        <div className="px-4 pb-8">
          {!hasHits && groups.length === 0 && (
            <EmptyState icon={Search} title={t("imageEmpty")} />
          )}

          {groups.map((group) => {
            if (group === "documents") {
              const hits = answer.documents;
              return (
                <section key={group} aria-label={t("imageDocuments")} className="mt-8">
                  <h2 className="text-lg font-bold text-text-primary">
                    {t("imageDocuments")}
                    {hits.length > 0 && (
                      <span className="ml-1 font-normal text-text-muted"> {hits.length}</span>
                    )}
                  </h2>
                  {hits.length > 0 && answer.text.excerpt && (
                    <p className="mt-1 text-sm text-text-muted" title={answer.text.excerpt}>
                      「{answer.text.excerpt}」
                    </p>
                  )}
                  {hits.length > 0 ? (
                    <DocumentRows documents={hits} />
                  ) : (
                    <p className="mt-2 text-sm text-text-muted">{t("imageTextFailed")}</p>
                  )}
                </section>
              );
            }
            if (group === "pictures") {
              const hits: ImageHit[] = answer.images;
              return (
                <section key={group} aria-label={t("imagePictures")} className="mt-8">
                  <h2 className="text-lg font-bold text-text-primary">
                    {t("imagePictures")}
                    <span className="ml-1 font-normal text-text-muted"> {hits.length}</span>
                  </h2>
                  <ol className="mt-2 flex flex-wrap gap-2">
                    {hits.map((hit) => (
                      <li key={hit.file_id}>
                        <Link
                          href={`/files/${hit.file_id}`}
                          aria-label={hit.filename}
                          className="block overflow-hidden rounded-xl bg-bg-elevated"
                        >
                          <img
                            src={`/api/files/${hit.file_id}/thumbnail`}
                            alt=""
                            loading="lazy"
                            className="h-32 w-32 object-cover"
                          />
                        </Link>
                      </li>
                    ))}
                  </ol>
                </section>
              );
            }
            const hits = answer.scenes;
            return (
              <section key={group} aria-label={t("imageScenes")} className="mt-8">
                <h2 className="text-lg font-bold text-text-primary">
                  {t("imageScenes")}
                  {hits.length > 0 && (
                    <span className="ml-1 font-normal text-text-muted"> {hits.length}</span>
                  )}
                </h2>
                {answer.scenes_partial && (
                  <p className="mt-1 text-sm text-text-muted">{t("imageScenesPartial")}</p>
                )}
                <ol className="mx-auto w-full max-w-list-row">
                  {hits.map((hit) => (
                    <li key={`${hit.file_id}-${hit.start}`} className="border-b border-bg-border">
                      <Link
                        href={`/files/${hit.file_id}?t=${Math.floor(hit.start)}`}
                        className="grid grid-cols-[auto_1fr] gap-3 rounded-xl px-1.5 py-2.5 transition-colors hover:bg-accent/5"
                      >
                        <span className="relative h-9 w-16 shrink-0 overflow-hidden rounded-lg bg-bg-elevated sm:h-[50px] sm:w-[88px]">
                          <SceneFrame hit={hit} />
                          <span className="absolute bottom-1 right-1 rounded bg-black/55 px-1 text-[10px] leading-tight text-white">
                            {formatDuration(hit.start)}
                          </span>
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-text-primary">
                            {formatDuration(hit.start)}–{formatDuration(hit.end)}
                          </span>
                          <span className="block truncate text-xs text-text-muted" title={hit.filename}>
                            {hit.filename}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}

      {overlay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg-primary/75 backdrop-blur-sm"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-warm-silver bg-bg-card/90 px-12 py-10">
            <ImagePlus size={48} className="text-text-muted" />
            <p className="text-lg font-medium text-text-primary">
              {t("dropToSearchByImage")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
