"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Check, X, ThumbsUp, ThumbsDown } from "lucide-react";
import Link from "next/link";

import { getFile, updateFile, likeFile, dislikeFile } from "@/lib/api";
import { formatDuration, formatFileSize } from "@/lib/format";
import type { FileItem } from "@/types";
import { FilePreview } from "@/components/FilePreview";
import { FavoriteButton } from "@/components/FavoriteButton";
import { TagEditor } from "@/components/TagEditor";
import { FileActions } from "@/components/FileActions";
import { useSetOverrideDrive } from "@/components/CurrentDriveProvider";

export default function FilePage() {
  const params = useParams();
  const router = useRouter();
  const fileId = Number(params.id);

  const [file, setFile] = useState<FileItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const setOverrideDrive = useSetOverrideDrive();

  useEffect(() => {
    getFile(fileId).then((f) => {
      setFile(f);
      setEditTitle(f.title);
      setEditDesc(f.description);
      setOverrideDrive(f.drive);
    });
    return () => setOverrideDrive(null);
  }, [fileId, setOverrideDrive]);

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

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <div className="mb-4">
        <Link
          href={file.folder_path
            ? `/drive/${encodeURIComponent(file.drive)}/${file.folder_path}`
            : `/drive/${encodeURIComponent(file.drive)}`
          }
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary"
        >
          <ArrowLeft size={16} />
          {file.folder_path
            ? file.folder_path.split("/").pop()
            : file.drive
          } に戻る
        </Link>
      </div>

      <FilePreview file={file} />

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
              placeholder="説明を追加..."
              rows={3}
              className="w-full rounded-lg bg-bg-card px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/80 disabled:opacity-50"
              >
                <Check size={14} />
                保存
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
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-xl font-bold text-text-primary">
                {file.title}
              </h1>
              <div className="flex flex-shrink-0 items-center gap-1">
                <div className="flex items-center overflow-hidden rounded-full bg-bg-card">
                  <button
                    onClick={handleLike}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
                    aria-label="Like"
                  >
                    <ThumbsUp size={16} />
                    <span>{file.likes}</span>
                  </button>
                  <div className="h-5 w-px bg-text-muted/30" />
                  <button
                    onClick={handleDislike}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
                    aria-label="Dislike"
                  >
                    <ThumbsDown size={16} />
                    <span>{file.dislikes}</span>
                  </button>
                </div>
                <FavoriteButton
                  fileId={file.id}
                  isFavorite={file.is_favorite}
                  onToggle={setFile}
                  showLabel
                />
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-lg p-2 text-text-muted hover:bg-bg-card hover:text-text-primary"
                  aria-label="編集"
                >
                  <Pencil size={16} />
                </button>
                <FileActions
                  file={file}
                  onUpdate={() => getFile(fileId).then(setFile)}
                  onDelete={() => {
                    const backPath = file.folder_path
                      ? `/drive/${encodeURIComponent(file.drive)}/${file.folder_path}`
                      : `/drive/${encodeURIComponent(file.drive)}`;
                    router.push(backPath);
                  }}
                />
              </div>
            </div>
            {file.description && (
              <p className="mt-2 text-sm text-text-muted whitespace-pre-wrap">
                {file.description}
              </p>
            )}
            <div className="mt-3 flex gap-4 text-xs text-text-muted">
              {hasDuration && <span>{formatDuration(file.duration)}</span>}
              <span>{formatFileSize(file.file_size)}</span>
              <span>{file.drive}{file.folder_path ? ` / ${file.folder_path}` : ""}</span>
            </div>
            <TagEditor
              fileId={file.id}
              drive={file.drive}
              tags={file.tags}
              onUpdate={setFile}
            />
          </div>
        )}
      </div>
    </div>
  );
}
