"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { FileDetailContent } from "@/components/FileDetailContent";
import { ImageGallery } from "@/components/ImageGallery";
import {
  PlaylistPanel,
  getPlaylistOnEnded,
} from "@/components/PlaylistPanel";
import { useSetOverrideDrive } from "@/components/CurrentDriveProvider";
import { useOverlaySidebar } from "@/components/SidebarProvider";
import { useFileNav } from "@/hooks/useFileNav";
import { getFile } from "@/lib/api";
import type { FileItem } from "@/types";

interface FileDetailFullScreenProps {
  fileId: string;
}

/**
 * Fullscreen route host for ``/files/{id}``. Used in two situations
 * (per spec §4.6 / §4.7):
 *
 * 1. ``?playlist=`` / ``?folder_play=1`` is set — the spec keeps the
 *    playlist-exception route fullscreen (2-pane离脱) so the
 *    PlaylistPanel and the player share the same visual focus.
 * 2. (Future) any URL the Server Component decides not to redirect.
 *
 * Composes ``<FileDetailContent>`` with the chrome the legacy
 * `/files/[id]/page.tsx` carried: a back button, ImageGallery on
 * Maximize, PlaylistPanel when in playlist mode, useOverlaySidebar
 * to collapse the global sidebar to overlay, and useFileNav for
 * arrow-key navigation in non-playlist mode.
 */
export function FileDetailFullScreen({ fileId }: FileDetailFullScreenProps) {
  // Unlike RightPaneFile, the fullscreen host DOES collapse the
  // global sidebar — there's no tree pane next to us, so the inline
  // sidebar would just steal width from the player.
  useOverlaySidebar();

  const t = useTranslations("file");
  const router = useRouter();
  const searchParams = useSearchParams();
  const setOverrideDrive = useSetOverrideDrive();

  const sort = searchParams.get("sort") || undefined;
  const order = searchParams.get("order") || undefined;
  const playlistId = searchParams.get("playlist") || undefined;
  const folderPlay = searchParams.get("folder_play") === "1";
  const hasPlaylist = !!playlistId || folderPlay;
  const tParam = searchParams.get("t");
  const initialTime = tParam ? Number(tParam) : undefined;
  const pageParam = searchParams.get("page");
  const initialPage = pageParam ? Number(pageParam) : undefined;
  const highlight = searchParams.get("highlight") || undefined;

  // Local file state for chrome (back nav, ImageGallery, override drive).
  // FileDetailContent does its own getFile internally — accepted dual
  // fetch is short and cheap.
  const [file, setFile] = useState<FileItem | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFile(null);
    getFile(fileId)
      .then((f) => {
        if (cancelled) return;
        setFile(f);
        // Tell the global sidebar what drive we're "on" since the
        // URL doesn't carry it.
        setOverrideDrive(f.drive);
      })
      .catch(() => {
        // 404 / network errors fall through to a blank chrome; the
        // FileDetailContent below renders its own loading spinner
        // and the user can navigate away with the browser's back.
      });
    return () => {
      cancelled = true;
      setOverrideDrive(null);
    };
  }, [fileId, setOverrideDrive]);

  const buildNavUrl = useCallback(
    (id: string) => {
      const params = new URLSearchParams();
      if (playlistId) params.set("playlist", playlistId);
      if (folderPlay) params.set("folder_play", "1");
      if (sort) params.set("sort", sort);
      if (order) params.set("order", order);
      const qs = params.toString();
      return `/files/${id}${qs ? `?${qs}` : ""}`;
    },
    [playlistId, folderPlay, sort, order],
  );

  // Arrow-key navigation. Disabled in playlist mode — the playlist
  // owns "next" semantics there; ArrowLeft/Right would conflict.
  // PR-5: ``router.replace`` here is the legacy router (no
  // useGuardedRouter wrapper) but it doesn't matter — the dirty
  // editor lives in the 2-pane host, not the fullscreen host. The
  // global popstate / beforeunload listeners in ``<DirtyBlocker />``
  // catch any escape paths.
  useFileNav({
    fileId: !hasPlaylist && file ? fileId : null,
    sort,
    order,
    fileType: file?.file_type ?? null,
    mimeType: file?.mime_type ?? null,
    enabled: !hasPlaylist,
    onNavigate: (id) => router.replace(buildNavUrl(id)),
  });

  const handlePlaylistNavigate = useCallback(
    (nextFileId: string) => {
      router.replace(buildNavUrl(nextFileId));
    },
    [router, buildNavUrl],
  );

  const handleMediaEnded = useCallback(() => {
    const onEnded = getPlaylistOnEnded();
    if (onEnded) onEnded();
  }, []);

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    if (file) {
      const backPath = file.folder_path
        ? `/drive/${encodeURIComponent(file.drive)}/${file.folder_path}`
        : `/drive/${encodeURIComponent(file.drive)}`;
      router.push(backPath);
    }
  }, [router, file]);

  const handleAfterDelete = useCallback(() => {
    if (!file) return;
    const backPath = file.folder_path
      ? `/drive/${encodeURIComponent(file.drive)}/${file.folder_path}`
      : `/drive/${encodeURIComponent(file.drive)}`;
    router.push(backPath);
  }, [router, file]);

  const isVideoTheater = hasPlaylist && file?.file_type === "video";
  const isAudioSide = hasPlaylist && file?.file_type !== "video";

  return (
    <div
      className={`mx-auto w-full flex-1 px-4 py-6 ${hasPlaylist ? "max-w-6xl" : "max-w-5xl"}`}
    >
      <div className="mb-4">
        <button
          onClick={handleBack}
          className="inline-flex cursor-pointer items-center gap-1 text-sm text-text-muted hover:text-text-primary"
        >
          <ArrowLeft size={16} />
          {t("backTo", {
            name: file?.folder_path
              ? file.folder_path.split("/").pop()!
              : (file?.drive ?? ""),
          })}
        </button>
      </div>

      <div className={isAudioSide ? "flex flex-col gap-4 md:flex-row" : ""}>
        <div className={isAudioSide ? "min-w-0 flex-1" : ""}>
          <FileDetailContent
            fileId={fileId}
            drive={file?.drive ?? ""}
            initialTime={initialTime}
            initialPage={initialPage}
            highlight={highlight}
            onEnded={hasPlaylist ? handleMediaEnded : undefined}
            autoPlay={hasPlaylist}
            onRequestImageGallery={() => setGalleryOpen(true)}
            onAfterDelete={handleAfterDelete}
          />

          {isVideoTheater && (
            <PlaylistPanel
              playlistId={playlistId}
              folderPlay={folderPlay}
              currentFileId={fileId}
              currentFileType={file!.file_type}
              drive={file!.drive}
              folderPath={file!.folder_path}
              sort={sort}
              order={order}
              onNavigate={handlePlaylistNavigate}
            />
          )}
        </div>

        {isAudioSide && file && (
          <PlaylistPanel
            playlistId={playlistId}
            folderPlay={folderPlay}
            currentFileId={fileId}
            currentFileType={file.file_type}
            drive={file.drive}
            folderPath={file.folder_path}
            sort={sort}
            order={order}
            onNavigate={handlePlaylistNavigate}
          />
        )}
      </div>

      {file && (
        <ImageGallery
          open={galleryOpen}
          file={file}
          sort={sort}
          order={order}
          onClose={(currentFileId) => {
            setGalleryOpen(false);
            if (currentFileId && currentFileId !== fileId) {
              router.replace(buildNavUrl(currentFileId));
            }
          }}
        />
      )}
    </div>
  );
}
