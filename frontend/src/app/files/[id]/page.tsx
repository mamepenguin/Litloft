"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Maximize2, Check, X, ThumbsUp, ThumbsDown } from "lucide-react";

import { useTranslations } from "next-intl";
import { getFile, getFileNeighbors, updateFile, likeFile, dislikeFile } from "@/lib/api";
import { addRecentlyPlayed } from "@/lib/recentlyPlayed";
import { formatDuration, formatFileSize } from "@/lib/format";
import type { FileItem, Neighbors } from "@/types";
import { FilePreview } from "@/components/FilePreview";
import { FavoriteButton } from "@/components/FavoriteButton";
import { TagEditor } from "@/components/TagEditor";
import { FileActions } from "@/components/FileActions";
import { CommentSection } from "@/components/CommentSection";
import { ImageGallery } from "@/components/ImageGallery";
import { PlaylistPanel, getPlaylistOnEnded } from "@/components/PlaylistPanel";
import { CastButton } from "@/components/CastButton";
import { AddonSlot } from "@/components/AddonSlot";
import { ActiveSummaryHost } from "@/components/ActiveSummaryHost";
import { RelatedFilesSection } from "@/components/RelatedFilesSection";
import { useSetOverrideDrive } from "@/components/CurrentDriveProvider";
import { useOverlaySidebar } from "@/components/SidebarProvider";
import type { MediaController } from "@/lib/mediaController";

export default function FilePage() {
  useOverlaySidebar();
  const t = useTranslations("file");
  const tc = useTranslations("common");
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileId = params.id as string;

  const sort = searchParams.get("sort") || undefined;
  const order = searchParams.get("order") || undefined;
  const playlistId = searchParams.get("playlist") || undefined;
  const folderPlay = searchParams.get("folder_play") === "1";
  const hasPlaylist = !!playlistId || folderPlay;
  const initialTime = searchParams.get("t") ? Number(searchParams.get("t")) : undefined;

  const [file, setFile] = useState<FileItem | null>(null);
  const [neighbors, setNeighbors] = useState<Neighbors | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Decoupled from videoRef on purpose: LoftRef (YouTube) supplies its
  // own MediaController via FilePreview's onMediaController callback,
  // and the underlying playback element is an iframe — there is no
  // HTMLVideoElement to point a ref at. AddonSlot consumers (citation
  // jump etc.) should prefer mediaController and fall back to videoRef.
  const [mediaController, setMediaController] =
    useState<MediaController | null>(null);
  const setOverrideDrive = useSetOverrideDrive();

  useEffect(() => {
    setNeighbors(null);
    getFile(fileId).then((f) => {
      setFile(f);
      setEditTitle(f.title);
      setEditDesc(f.description);
      setOverrideDrive(f.drive);
      addRecentlyPlayed(fileId);
      if (!hasPlaylist && f.file_type !== "archive") {
        getFileNeighbors(fileId, sort, order)
          .then(setNeighbors)
          .catch(() => setNeighbors(null));
      }
    });
    return () => setOverrideDrive(null);
  }, [fileId, sort, order, setOverrideDrive, hasPlaylist]);

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
    [playlistId, folderPlay, sort, order]
  );

  const navigatePrev = useCallback(() => {
    if (neighbors?.prev_id) router.replace(buildNavUrl(neighbors.prev_id));
  }, [neighbors, router, buildNavUrl]);

  const navigateNext = useCallback(() => {
    if (neighbors?.next_id) router.replace(buildNavUrl(neighbors.next_id));
  }, [neighbors, router, buildNavUrl]);

  const handlePlaylistNavigate = useCallback(
    (nextFileId: string) => {
      router.replace(buildNavUrl(nextFileId));
    },
    [router, buildNavUrl]
  );

  const handleMediaEnded = useCallback(() => {
    const onEnded = getPlaylistOnEnded();
    if (onEnded) onEnded();
  }, []);

  useEffect(() => {
    if (!file || !neighbors) return;
    if (file.file_type === "video" || file.file_type === "audio") return;
    // LoftRef (YouTube embed) installs its own ←/→ seek shortcuts via
    // HvlinkPlayer; double-binding here would seek AND navigate.
    if (file.mime_type === "application/vnd.litloft.link+json") return;

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigatePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateNext();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [file, neighbors, navigatePrev, navigateNext]);

  async function handleLike() {
    if (!file) return;
    const updated = await likeFile(file.id);
    setFile(updated);
  }

  async function handleDislike() {
    if (!file) return;
    const updated = await dislikeFile(file.id);
    setFile(updated);
  }

  async function handleSave() {
    if (!file) return;
    setSaving(true);
    const updated = await updateFile(file.id, {
      title: editTitle,
      description: editDesc,
    });
    setFile(updated);
    setEditing(false);
    setSaving(false);
  }

  if (!file) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const hasDuration = (file.file_type === "video" || file.file_type === "audio") && file.duration != null;
  const isVideoTheater = hasPlaylist && file.file_type === "video";
  const isAudioSide = hasPlaylist && file.file_type !== "video";

  return (
    <div className={`mx-auto w-full flex-1 px-4 py-6 ${hasPlaylist ? "max-w-6xl" : "max-w-5xl"}`}>
      <div className="mb-4">
        <button
          onClick={() => {
            if (window.history.length > 1) {
              router.back();
            } else {
              const backPath = file.folder_path
                ? `/drive/${encodeURIComponent(file.drive)}/${file.folder_path}`
                : `/drive/${encodeURIComponent(file.drive)}`;
              router.push(backPath);
            }
          }}
          className="inline-flex cursor-pointer items-center gap-1 text-sm text-text-muted hover:text-text-primary"
        >
          <ArrowLeft size={16} />
          {t("backTo", { name: file.folder_path
            ? file.folder_path.split("/").pop()!
            : file.drive
          })}
        </button>
      </div>

      <div className={`${isAudioSide ? "flex flex-col gap-4 md:flex-row" : ""}`}>
        <div className={`${isAudioSide ? "min-w-0 flex-1" : ""}`}>
          <div className="group/nav relative">
            <FilePreview
              file={file}
              onEnded={hasPlaylist ? handleMediaEnded : undefined}
              autoPlay={hasPlaylist}
              videoRef={videoRef}
              initialTime={initialTime}
              onMediaController={setMediaController}
            />

            {!hasPlaylist && neighbors?.prev_id && (
              <button
                onClick={navigatePrev}
                className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white opacity-70 transition-opacity hover:opacity-100 sm:opacity-0 sm:group-hover/nav:opacity-70 sm:group-hover/nav:hover:opacity-100"
                aria-label={t("prevFile")}
              >
                <ChevronLeft size={24} />
              </button>
            )}

            {!hasPlaylist && neighbors?.next_id && (
              <button
                onClick={navigateNext}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white opacity-70 transition-opacity hover:opacity-100 sm:opacity-0 sm:group-hover/nav:opacity-70 sm:group-hover/nav:hover:opacity-100"
                aria-label={t("nextFile")}
              >
                <ChevronRight size={24} />
              </button>
            )}
          </div>

          <div className="mt-4">
            {editing ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-lg bg-bg-card px-3 py-2 text-lg font-bold text-text-primary outline-none focus:ring-2 focus:ring-accent"
                />
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder={t("addDescription")}
                  rows={3}
                  className="w-full rounded-lg bg-bg-card px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1 rounded-2xl bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    <Check size={14} />
                    {tc("save")}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setEditTitle(file.title);
                      setEditDesc(file.description);
                    }}
                    className="flex items-center gap-1 rounded-lg bg-bg-card px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
                  >
                    <X size={14} />
                    {tc("cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h1 className="text-xl font-bold text-text-primary">
                  {file.title}
                </h1>
                {(hasDuration || file.description) && (
                  <div className="mt-1 text-xs text-text-muted">
                    {hasDuration && <span>{formatDuration(file.duration)} · </span>}
                    <span>{formatFileSize(file.file_size)}</span>
                    {file.description && (
                      <p className="mt-1 text-sm whitespace-pre-wrap">
                        {file.description}
                      </p>
                    )}
                  </div>
                )}
                {!hasDuration && !file.description && (
                  <p className="mt-1 text-xs text-text-muted">{formatFileSize(file.file_size)}</p>
                )}
                <div className="mt-2 flex items-center gap-1">
                  <div className="flex items-center overflow-hidden rounded-full bg-bg-card">
                    <button
                      onClick={handleLike}
                      className="px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
                      aria-label="Like"
                    >
                      <ThumbsUp size={16} />
                    </button>
                    <span className="min-w-[1.5rem] text-center text-sm text-text-muted">{file.likes}</span>
                    <button
                      onClick={handleDislike}
                      className="px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
                      aria-label="Dislike"
                    >
                      <ThumbsDown size={16} />
                    </button>
                  </div>
                  <FavoriteButton
                    fileId={file.id}
                    isFavorite={file.is_favorite}
                    onToggle={setFile}
                    showLabel
                  />
                  {file.file_type === "image" && (
                    <button
                      onClick={() => setGalleryOpen(true)}
                      className="rounded-lg p-2 text-text-muted hover:bg-bg-card hover:text-text-primary"
                      aria-label={t("galleryMode")}
                    >
                      <Maximize2 size={16} />
                    </button>
                  )}
                  {file.file_type === "video" && (
                    <CastButton mediaRef={videoRef} />
                  )}
                  <FileActions
                    file={file}
                    onUpdate={() => getFile(fileId).then(setFile)}
                    onDelete={() => {
                      const backPath = file.folder_path
                        ? `/drive/${encodeURIComponent(file.drive)}/${file.folder_path}`
                        : `/drive/${encodeURIComponent(file.drive)}`;
                      router.push(backPath);
                    }}
                    onEdit={() => setEditing(true)}
                  />
                </div>
                {file.tags.length > 0 && (
                  <TagEditor
                    fileId={file.id}
                    drive={file.drive}
                    tags={file.tags}
                    onUpdate={setFile}
                  />
                )}
              </div>
            )}
          </div>

          {/* Addon file detail sections (transcript, clip frames, index details, similar files) */}
          <div className="mt-4 space-y-4">
            <ActiveSummaryHost fileId={fileId} drive={file.drive} />
            <RelatedFilesSection fileId={fileId} />
            <AddonSlot
              id="file-detail-sections"
              layout="stack"
              props={{ fileId, drive: file.drive, videoRef, mediaController, subtitles: file.subtitles }}
            />
          </div>

          <CommentSection fileId={fileId} />

          {/* Video theater: playlist below */}
          {isVideoTheater && (
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

        {/* Audio side panel */}
        {isAudioSide && (
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
    </div>
  );
}
