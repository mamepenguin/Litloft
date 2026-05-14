"use client";

// PasswordsSection: lists masked passwords (server returns "***"), lets the
// admin add new entries. The masked value is never sent back — when adding
// or editing, the input starts blank and the user must enter a fresh value.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  AdminConfigError,
  appendPassword,
  deletePassword,
  getPasswords,
  type PasswordEntry,
} from "@/lib/adminConfig";

interface ModalState {
  draft: { password: string; groups: string };
}

function describeError(
  err: unknown,
  t: (key: string) => string,
): { message: string; field?: string } {
  if (err instanceof AdminConfigError) {
    const detail = err.detail;
    if (typeof detail === "object" && detail?.message) {
      return { message: detail.message, field: detail.field };
    }
    const code = err.code;
    if (code) {
      const message = t(`errors.${code}`);
      if (!message.startsWith("errors.")) {
        return {
          message,
          field:
            typeof detail === "object" ? detail?.field : undefined,
        };
      }
    }
  }
  return {
    message: err instanceof Error ? err.message : t("errors.saveFailed"),
  };
}

export function PasswordsSection(): React.ReactElement {
  const t = useTranslations("settings.passwords");
  const [entries, setEntries] = useState<PasswordEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [saveError, setSaveError] = useState<{
    message: string;
    field?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPasswords()
      .then((list) => {
        if (!cancelled) {
          setEntries(list);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load passwords",
          );
          setEntries([]);
        }
      });
    return () => {
      cancelled = true;
    };
    // Mount-only fetch. The handler doesn't reload on i18n changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAdd = useCallback(() => {
    setSaveError(null);
    setModal({ draft: { password: "", groups: "" } });
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
    setSaveError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!modal) return;
    const groups = modal.draft.groups
      .split(",")
      .map((g) => g.trim())
      .filter((g) => g.length > 0);
    const newEntry: PasswordEntry = {
      password: modal.draft.password,
      groups,
    };
    try {
      await appendPassword(newEntry);
      setEntries([...(entries ?? []), { password: "***", groups }]);
      setModal(null);
      setSaveError(null);
    } catch (err) {
      setSaveError(describeError(err, t));
    }
  }, [entries, modal, t]);

  const handleDelete = useCallback(
    async (index: number) => {
      if (!entries) return;
      try {
        await deletePassword(index);
        setEntries(entries.filter((_, i) => i !== index));
      } catch (err) {
        setSaveError(describeError(err, t));
      }
    },
    [entries, t],
  );

  const updateDraft = useCallback(
    (patch: Partial<{ password: string; groups: string }>) => {
      setModal((prev) =>
        prev ? { draft: { ...prev.draft, ...patch } } : prev,
      );
    },
    [],
  );

  const isPublic = entries !== null && entries.length === 0;

  return (
    <section className="rounded-xl border border-bg-border bg-bg-card p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-text-muted">{t("description")}</p>
        </div>
        {!isPublic && (
          <button
            type="button"
            onClick={openAdd}
            className="rounded-2xl bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
          >
            {t("addButton")}
          </button>
        )}
      </div>

      {loadError && (
        <p className="mb-3 text-xs text-danger">{loadError}</p>
      )}

      {entries === null ? (
        <p className="text-xs text-text-muted">…</p>
      ) : isPublic ? (
        <div className="rounded-2xl bg-bg-elevated p-4">
          <p className="mb-3 text-sm text-text-primary">{t("publicMode")}</p>
          <button
            type="button"
            onClick={openAdd}
            className="rounded-2xl bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
          >
            {t("enableProtection")}
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-bg-border">
          {entries.map((entry, index) => (
            <li
              key={index}
              className="flex items-center justify-between gap-2 py-3"
            >
              <div className="min-w-0">
                <div className="font-mono text-sm text-text-primary">
                  {entry.password}
                </div>
                <div className="text-xs text-text-muted">
                  {entry.groups.join(", ")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(index)}
                className="rounded-2xl px-3 py-1 text-xs text-danger hover:bg-danger/10"
              >
                {t("deleteButton")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {modal && (
        <PasswordModal
          draft={modal.draft}
          onChange={updateDraft}
          onCancel={closeModal}
          onSave={handleSave}
          error={saveError}
          t={t}
        />
      )}
    </section>
  );
}

interface PasswordModalProps {
  draft: { password: string; groups: string };
  onChange: (patch: Partial<{ password: string; groups: string }>) => void;
  onCancel: () => void;
  onSave: () => void;
  error: { message: string; field?: string } | null;
  t: (key: string) => string;
}

function PasswordModal({
  draft,
  onChange,
  onCancel,
  onSave,
  error,
  t,
}: PasswordModalProps): React.ReactElement {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-bg-card p-5">
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text-primary">
              {t("fields.password")}
            </span>
            <input
              type="password"
              value={draft.password}
              onChange={(e) => onChange({ password: e.target.value })}
              className="w-full rounded-2xl border border-warm-silver/40 bg-bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus-ring"
              autoComplete="new-password"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text-primary">
              {t("fields.groups")}
            </span>
            <input
              type="text"
              value={draft.groups}
              onChange={(e) => onChange({ groups: e.target.value })}
              className="w-full rounded-2xl border border-warm-silver/40 bg-bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus-ring"
            />
          </label>
        </div>
        {error && (
          <p className="mt-3 text-xs text-danger">{error.message}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl bg-sand px-4 py-2 text-sm hover:bg-sand-hover"
          >
            {t("cancelButton")}
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            {t("saveButton")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PasswordsSection;
