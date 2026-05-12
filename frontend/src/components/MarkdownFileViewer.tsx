"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getStreamUrl,
  getWikiResolutions,
  type WikiResolveResult,
} from "@/lib/api";
import { MarkdownPreview } from "@/components/MarkdownPreview";

/**
 * Fetch-and-render wrapper for use in FilePreview. Loads the file
 * content then pipes it through MarkdownPreview.
 *
 * Phase C (spec 2026-05-12 §3.8): also fetches wiki-link resolutions
 * from ``GET /api/files/{id}/wiki-resolutions`` so the renderer can
 * decorate ``[[X]]`` links as resolved / unresolved / ambiguous. The
 * resolutions fetch is intentionally decoupled from the body fetch —
 * the preview renders immediately with the body and links flip from
 * the pessimistic "unresolved" default to their real state once the
 * resolutions request returns.
 *
 * Lives in its own module (re-exported from ``MarkdownPreview.tsx``
 * for backward-compatible imports) so the file naming matches the
 * spec deliverable list and the editor preview path can grow without
 * making ``MarkdownPreview.tsx`` even larger.
 */
export function MarkdownFileViewer({
  fileId,
  editable,
  externalReloadKey,
  onTagsSaved,
  highlight,
}: {
  fileId: string;
  editable?: {
    mime_type: string;
    filename: string;
    drive: string;
  };
  /**
   * Bump this from the parent to force a source refetch. Combined
   * with ``fileId`` so a change to either triggers the reload.
   */
  externalReloadKey?: number;
  /**
   * Fires after the Properties Panel chip's debounced save lands.
   * The parent is responsible for bumping ``externalReloadKey`` and
   * refreshing any sibling state (outer ``File.tags`` chip row,
   * sidebar tag list).
   */
  onTagsSaved?: (tags: string[]) => void;
  /** Forwarded to MarkdownPreview for citation jump. */
  highlight?: string;
}) {
  const t = useTranslations("text");
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wikiResolution, setWikiResolution] = useState<
    Record<string, WikiResolveResult> | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(getStreamUrl(fileId), { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setSource(text);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, externalReloadKey]);

  useEffect(() => {
    let cancelled = false;
    setWikiResolution(undefined);
    getWikiResolutions(fileId)
      .then((map) => {
        if (!cancelled) setWikiResolution(map);
      })
      .catch(() => {
        // Swallow — links degrade to their pessimistic unresolved
        // default, the body still renders fine.
        if (!cancelled) setWikiResolution(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, externalReloadKey]);

  if (error) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-bg-card py-16">
        <p className="text-sm text-danger">{t("loadFailed", { error })}</p>
      </div>
    );
  }

  if (source === null) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-bg-card py-16">
        <p className="text-sm text-text-muted">{t("loading")}</p>
      </div>
    );
  }

  const edit = editable
    ? {
        id: fileId,
        mime_type: editable.mime_type,
        filename: editable.filename,
        drive: editable.drive,
      }
    : undefined;

  return (
    <MarkdownPreview
      source={source}
      editable={edit}
      onTagsSaved={onTagsSaved}
      highlight={highlight}
      wikiResolution={wikiResolution}
    />
  );
}
