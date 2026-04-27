"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useProfile } from "@/components/ProfileProvider";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function ProfileSection() {
  const t = useTranslations("settings.profile");
  const { nickname, setNickname, clearNickname } = useProfile();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const showForm = !nickname || editing;

  const handleSave = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setNickname(trimmed);
    setInput("");
    setEditing(false);
  }, [input, setNickname]);

  const handleEdit = useCallback(() => {
    setInput(nickname ?? "");
    setEditing(true);
  }, [nickname]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setInput("");
  }, []);

  const handleConfirmClear = useCallback(() => {
    clearNickname();
    setConfirmClear(false);
    setEditing(false);
    setInput("");
  }, [clearNickname]);

  return (
    <section
      aria-labelledby="settings-profile-title"
      className="rounded-xl border border-bg-border bg-bg-card p-6"
    >
      <h2
        id="settings-profile-title"
        className="mb-4 text-base font-semibold text-text-primary"
      >
        {t("title")}
      </h2>

      {nickname && !editing && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white"
            >
              {nickname.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-text-primary">
              {nickname}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleEdit}
              className="rounded-2xl bg-sand px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-sand-hover"
            >
              {t("edit")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="rounded-2xl px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
            >
              {t("clear")}
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              else if (e.key === "Escape" && nickname) handleCancel();
            }}
            placeholder={t("nicknamePlaceholder")}
            maxLength={50}
            className="flex-1 rounded-2xl border border-bg-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!input.trim()}
              className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {t("save")}
            </button>
            {nickname && editing && (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-2xl px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
              >
                {t("cancel")}
              </button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        title={t("clear")}
        message={t("clearConfirm")}
        confirmLabel={t("clear")}
        onConfirm={handleConfirmClear}
        onCancel={() => setConfirmClear(false)}
      />
    </section>
  );
}
