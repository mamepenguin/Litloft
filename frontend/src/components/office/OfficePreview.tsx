"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileQuestion } from "lucide-react";

import { EmptyState } from "@/components/EmptyState";
import { OfficeExcerpt } from "@/components/OfficeExcerpt";
import { getDownloadUrl, getStreamUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { useFillHeight } from "@/hooks/useFillHeight";
import type { FileItem } from "@/types";

export type OfficeViewerKind = "word" | "excel";

type Status = "loading" | "shown" | "failed";

export function OfficePreview({
  file,
  viewer,
  fillCanvas = false,
}: {
  file: FileItem;
  viewer: OfficeViewerKind;
  /** Take the canvas's height; otherwise the frame keeps 80vh. */
  fillCanvas?: boolean;
}) {
  const t = useTranslations("file");
  const tc = useTranslations("common");
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const fillHeight = useFillHeight(frameRef);

  const identity = `${file.id}\u0000${file.file_size}\u0000${file.modified_at ?? ""}`;
  const [state, setState] = useState<{ identity: string; status: Status }>({
    identity,
    status: "loading",
  });
  // Derived rather than reset in the effect: a file handed after a failure
  // must render its loading frame before the effect can draw into it.
  const status: Status = state.identity === identity ? state.status : "loading";

  useEffect(() => {
    const host = hostRef.current;
    const frame = frameRef.current;
    if (!host || !frame) return;

    let cancelled = false;
    let dispose: (() => void) | null = null;
    const controller = new AbortController();

    const surface = document.createElement("div");
    surface.className = "h-full w-full";
    host.replaceChildren(surface);

    const load = async () => {
      const response = await fetch(getStreamUrl(file.id), {
        credentials: "include",
        signal: controller.signal,
      });
      if (cancelled) return;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const downloaded = await response.arrayBuffer();
      if (cancelled) return;
      // The Excel library tests its input with `instanceof ArrayBuffer`, which
      // is false for a buffer from another realm; keep a copy this one owns.
      const bytes = new Uint8Array(downloaded).slice().buffer;

      let nextDispose: () => void;
      if (viewer === "word") {
        const { drawWord } = await import("./wordAdapter");
        if (cancelled) return;
        nextDispose = await drawWord(surface, bytes);
      } else {
        const { drawExcel } = await import("./excelAdapter");
        if (cancelled) return;
        nextDispose = await drawExcel(surface, frame, bytes);
      }
      if (cancelled) {
        nextDispose();
        return;
      }
      dispose = nextDispose;
      setState({ identity, status: "shown" });
    };

    load().catch((error: unknown) => {
      if (cancelled || controller.signal.aborted) return;
      host.replaceChildren();
      console.warn(`Office preview failed for file ${file.id}`, error);
      setState({ identity, status: "failed" });
    });

    return () => {
      cancelled = true;
      controller.abort();
      dispose?.();
      host.replaceChildren();
    };
  }, [identity, file.id, viewer]);

  if (status === "failed") {
    return (
      <div className="w-full rounded-xl bg-bg-card">
        <EmptyState
          icon={FileQuestion}
          title={t("noPreview")}
          description={`${file.filename} · ${formatFileSize(file.file_size)}`}
          primaryAction={{ label: tc("download"), href: getDownloadUrl(file.id), download: true }}
          secondaryActions={[{ label: t("openInNewTab"), href: getStreamUrl(file.id), newTab: true }]}
        />
        <OfficeExcerpt
          fileId={file.id}
          mimeType={file.mime_type}
          fileSize={file.file_size}
          missing={file.missing_since !== null}
        />
      </div>
    );
  }

  // `isolate` keeps the libraries' own z-indexes inside the frame; without it
  // the grid rises above a menu's dismiss scrim and takes the closing click.
  return (
    <div
      ref={frameRef}
      role="region"
      aria-label={t("officeViewer")}
      className={`relative isolate w-full overflow-hidden rounded-xl bg-bg-card ${
        fillCanvas ? "" : "h-[80vh]"
      }`}
      style={fillCanvas ? { height: fillHeight ?? 0 } : undefined}
    >
      {status === "loading" && (
        <div
          className="absolute inset-0 animate-pulse rounded-xl bg-bg-card"
          aria-hidden="true"
        />
      )}
      <div
        ref={hostRef}
        className={`h-full w-full ${viewer === "word" ? "overflow-auto" : "overflow-hidden"}`}
      />
    </div>
  );
}
