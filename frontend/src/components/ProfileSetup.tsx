"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useProfile } from "./ProfileProvider";

const DISMISSED_KEY = "profile-dismissed";

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function setDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // localStorage unavailable
  }
}

export function ProfileSetup({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const { nickname, setNickname } = useProfile();
  const [visible, setVisible] = useState(false);
  const [input, setInput] = useState("");
  const [dontShow, setDontShow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-show on first visit
  useEffect(() => {
    if (open !== undefined) {
      setVisible(open);
      if (open && nickname) {
        setInput(nickname);
      }
      return;
    }
    if (!nickname && !isDismissed()) {
      setVisible(true);
    }
  }, [open, nickname]);

  useEffect(() => {
    if (visible) {
      inputRef.current?.focus();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleLater();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible]);

  const handleSave = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setNickname(trimmed);
    setVisible(false);
    onClose?.();
  }, [input, setNickname, onClose]);

  const handleLater = useCallback(() => {
    if (dontShow) {
      setDismissed();
    }
    setVisible(false);
    onClose?.();
  }, [dontShow, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSave();
      }
    },
    [handleSave]
  );

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={handleLater}
      />
      <div className="relative mx-4 w-full max-w-sm rounded-2xl bg-bg-card p-6 shadow-2xl animate-fade-in-scale">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">{t("setup")}</h2>
          <button
            onClick={handleLater}
            className="rounded-lg p-1 text-text-muted hover:text-text-primary"
            aria-label={tc("close")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4">
          <label htmlFor="profile-nickname" className="mb-1.5 block text-sm text-text-muted">
            {t("nickname")}
          </label>
          <input
            id="profile-nickname"
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("nicknamePlaceholder")}
            className="w-full rounded-lg border border-bg-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
            maxLength={50}
          />
        </div>

        {open === undefined && (
          <label className="mb-4 flex items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              className="rounded border-bg-border"
            />
            {t("dontShowAgain")}
          </label>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={handleLater}
            className="rounded-2xl bg-bg-elevated px-4 py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            {t("later")}
          </button>
          <button
            onClick={handleSave}
            disabled={!input.trim()}
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover active:scale-[0.97] disabled:opacity-50"
          >
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
