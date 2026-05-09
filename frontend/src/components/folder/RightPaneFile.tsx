"use client";

import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { FilePreview } from "@/components/FilePreview";
import { TreeToggle } from "@/components/TreeToggle";
import { useSelectedFile } from "@/hooks/useSelectedFile";
import { getFile } from "@/lib/api";
import type { FileItem } from "@/types";

interface RightPaneFileProps {
  fileId: string;
  drive: string;
}

/**
 * 2-pane right column: read-only file preview.
 *
 * Topic 7 (vault-core merger 2026-05-08, hako N0O6vCld8BjJOtF9Ot_uO):
 *   右ペイン = 閲覧専用クイックビュー（最薄）。編集系・タグ編集・
 *   recordFileView は /files/{id} へ集約する。
 *
 * This component therefore deliberately omits FileActions, tag editing,
 * comments, related files, and any WatchHistory recording.
 */
export function RightPaneFile({ fileId, drive }: RightPaneFileProps) {
  const t = useTranslations("rightPane");
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "loaded"; file: FileItem }
    | { status: "error" }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    getFile(fileId)
      .then((file) => {
        if (!cancelled) setState({ status: "loaded", file });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (state.status === "loading") {
    return <PaneShell title="" drive={drive} rightPane={null}>
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        {t("loading")}
      </div>
    </PaneShell>;
  }

  if (state.status === "error") {
    return <PaneShell title="" drive={drive} rightPane={null}>
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        {t("notFound")}
      </div>
    </PaneShell>;
  }

  const { file } = state;
  const title = file.title || file.filename;

  return (
    <PaneShell
      title={title}
      drive={drive}
      rightPane={
        <Link
          href={`/files/${file.id}`}
          className="inline-flex items-center gap-1 rounded-2xl bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
        >
          {t("openDetails")}
          <ArrowUpRight size={14} />
        </Link>
      }
    >
      <FilePreview file={file} />
    </PaneShell>
  );
}

function PaneShell({
  title,
  drive,
  rightPane,
  children,
}: {
  title: string;
  drive: string;
  rightPane: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations("rightPane");
  const { clearFile } = useSelectedFile();
  return (
    <div className="flex h-full flex-col bg-bg-base">
      <div className="flex items-center gap-2 border-b border-bg-border px-4 py-3">
        {/* Tree-pane toggle, leftmost — same role as the breadcrumb's
            leading toggle in the folder view: it lives at the outermost
            level of the main pane, not inside a content-specific
            toolbar. */}
        <TreeToggle drive={drive} />
        <button
          type="button"
          onClick={clearFile}
          className="inline-flex items-center gap-1 rounded-2xl px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary md:hidden"
        >
          <ArrowLeft size={14} />
          {t("backToTree")}
        </button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary" title={title}>
          {title}
        </h2>
        {rightPane}
      </div>
      <div className="flex-1 overflow-auto p-4">{children}</div>
    </div>
  );
}
