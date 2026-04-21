"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Link2, FileText, Film, Image as ImageIcon, Music } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  getFileRelations,
  type FileRelationItem,
  type RelatedFileSummary,
} from "@/lib/api";

function FileTypeIcon({ fileType }: { fileType: string }) {
  const size = 14;
  const cls = "text-text-muted";
  if (fileType === "video") return <Film size={size} className={cls} />;
  if (fileType === "image") return <ImageIcon size={size} className={cls} />;
  if (fileType === "audio") return <Music size={size} className={cls} />;
  return <FileText size={size} className={cls} />;
}

function RelatedFileTile({ item }: { item: FileRelationItem }) {
  const t = useTranslations("file");
  const file = item.file;
  const isMissing = file.missing_since !== null;

  return (
    <Link
      href={`/files/${file.id}`}
      className={
        "group flex gap-3 rounded-md border border-bg-border bg-bg-card p-2 transition hover:border-accent hover:bg-bg-muted" +
        (isMissing ? " opacity-60" : "")
      }
    >
      <div className="relative flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-bg-muted">
        {file.has_thumbnail ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={file.thumbnail_url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <FileTypeIcon fileType={file.file_type} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
          <FileTypeIcon fileType={file.file_type} />
          <span className="truncate">{file.filename}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          {file.folder_path && (
            <span className="truncate">{file.folder_path}</span>
          )}
          {isMissing && (
            <span className="rounded bg-bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
              {t("relatedFileMissing")}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function RelatedFilesSection({ fileId }: { fileId: string }) {
  const t = useTranslations("file");
  const [relations, setRelations] = useState<FileRelationItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFileRelations(fileId)
      .then((res) => {
        if (!cancelled) setRelations(res.relations);
      })
      .catch(() => {
        if (!cancelled) setRelations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (!relations || relations.length === 0) return null;

  return (
    <section className="rounded-lg border border-bg-border bg-bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
        <Link2 size={16} className="text-accent" />
        <span>{t("relatedFilesTitle")}</span>
        <span className="text-xs font-normal text-text-muted">
          ({relations.length})
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {relations.map((item) => (
          <RelatedFileTile key={item.relation_id} item={item} />
        ))}
      </div>
    </section>
  );
}
