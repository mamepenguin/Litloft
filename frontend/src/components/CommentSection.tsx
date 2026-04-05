"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, MessageCircle, Pencil, Send, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { createComment, deleteComment, getComments, updateComment } from "@/lib/api";
import { formatRelativeDate } from "@/lib/format";
import type { Comment } from "@/types";
import { ConfirmDialog } from "./ConfirmDialog";

interface CommentSectionProps {
  fileId: string;
}

export function CommentSection({ fileId }: CommentSectionProps) {
  const t = useTranslations("comments");
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    try {
      const res = await getComments(fileId);
      setComments(res.comments);
      setTotal(res.total);
    } catch {
      // silently fail, keep existing state
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    setLoading(true);
    fetchComments();
  }, [fetchComments]);

  const handlePost = useCallback(async () => {
    const trimmed = body.trim();
    if (!trimmed || posting) return;
    setError(null);
    setPosting(true);
    try {
      await createComment(fileId, trimmed);
      setBody("");
      await fetchComments();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("401")) {
        setError(t("profileRequired"));
      } else if (message.includes("429")) {
        setError(t("rateLimited"));
      } else {
        setError(t("postFailed"));
      }
    } finally {
      setPosting(false);
    }
  }, [body, posting, fileId, fetchComments, t]);

  const handleEditSave = useCallback(async () => {
    const trimmed = editBody.trim();
    if (!trimmed || !editingId || savingEdit) return;
    setSavingEdit(true);
    try {
      await updateComment(fileId, editingId, trimmed);
      setEditingId(null);
      setEditBody("");
      await fetchComments();
    } catch {
      // silently fail
    } finally {
      setSavingEdit(false);
    }
  }, [editBody, editingId, savingEdit, fileId, fetchComments]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteComment(fileId, deleteTarget);
      setDeleteTarget(null);
      await fetchComments();
    } catch {
      // silently fail
    }
  }, [deleteTarget, fileId, fetchComments]);

  const startEdit = useCallback((comment: Comment) => {
    setEditingId(comment.id);
    setEditBody(comment.body);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditBody("");
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handlePost();
      }
    },
    [handlePost]
  );

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleEditSave();
      }
      if (e.key === "Escape") {
        cancelEdit();
      }
    },
    [handleEditSave, cancelEdit]
  );

  const headerButton = (
    <button
      onClick={() => setExpanded((v) => !v)}
      className="flex items-center gap-2 text-text-muted transition-colors hover:text-text-primary"
    >
      <ChevronRight
        size={16}
        className={`transition-transform ${expanded ? "rotate-90" : ""}`}
      />
      <MessageCircle size={18} />
      <span className="text-sm font-medium">{t("title")}</span>
      {!loading && total > 0 && (
        <span className="text-xs text-text-muted">
          {t("count", { count: total })}
        </span>
      )}
    </button>
  );

  if (!expanded) {
    return (
      <div className="mt-6">
        {headerButton}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-6">
        {headerButton}
        <div className="mt-3 flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {headerButton}

      <div className="mt-3 flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("placeholder")}
          rows={2}
          maxLength={1000}
          className="flex-1 resize-none rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          onClick={handlePost}
          disabled={!body.trim() || posting}
          className="self-end rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/80 disabled:opacity-50"
          aria-label={t("post")}
        >
          <Send size={16} />
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}

      {comments.length === 0 ? (
        <p className="mt-4 text-center text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="rounded-lg bg-bg-card px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-accent">
                    {comment.nickname ?? t("anonymous")}
                  </span>
                  <span className="text-xs text-text-muted">
                    {formatRelativeDate(comment.created_at)}
                  </span>
                  {comment.updated_at !== comment.created_at && (
                    <span className="text-xs text-text-muted">
                      ({t("edited")})
                    </span>
                  )}
                </div>
                {comment.is_mine && editingId !== comment.id && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(comment)}
                      className="rounded p-1 text-text-muted transition-colors hover:text-text-primary"
                      aria-label={t("edit")}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(comment.id)}
                      className="rounded p-1 text-text-muted transition-colors hover:text-text-primary"
                      aria-label={t("delete")}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
              {editingId === comment.id ? (
                <div className="mt-2">
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    rows={2}
                    maxLength={1000}
                    autoFocus
                    className="w-full resize-none rounded-lg border border-border bg-bg-card px-3 py-2 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={handleEditSave}
                      disabled={!editBody.trim() || savingEdit}
                      className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/80 disabled:opacity-50"
                    >
                      {t("save")}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="rounded-lg bg-bg-elevated px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-sm text-text-primary whitespace-pre-wrap">
                  {comment.body}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("delete")}
        message={t("confirmDelete")}
        confirmLabel={t("delete")}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
