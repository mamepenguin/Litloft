"use client";

// DrivesSection: lists drives.json entries, lets the admin add / edit /
// delete entries via a modal. Submits the full array via PUT, surfaces
// 422 validation errors inline.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  AdminConfigError,
  getDrives,
  putDrives,
  type DriveEntry,
} from "@/lib/adminConfig";

interface ModalState {
  mode: "add" | "edit";
  index: number;
  draft: DriveEntry;
}

interface ConfirmState {
  index: number;
}

function describeError(
  err: unknown,
  t: (key: string, values?: Record<string, string | number>) => string,
): { message: string; field?: string } {
  if (err instanceof AdminConfigError) {
    const detail = err.detail;
    // Prefer the server-provided message — it is already localized and
    // tends to carry the most specific phrasing of the problem.
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

export function DrivesSection(): React.ReactElement {
  const t = useTranslations("settings.drives");
  const [drives, setDrives] = useState<DriveEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [saveError, setSaveError] = useState<{
    message: string;
    field?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDrives()
      .then((list) => {
        if (!cancelled) {
          setDrives(list);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load drives",
          );
        }
      });
    return () => {
      cancelled = true;
    };
    // Mount-only fetch — i18n changes shouldn't re-trigger the load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAdd = useCallback(() => {
    setSaveError(null);
    setModal({
      mode: "add",
      index: -1,
      draft: { name: "", path: "", access_group: "" },
    });
  }, []);

  const openEdit = useCallback(
    (index: number) => {
      setSaveError(null);
      const drive = drives[index];
      setModal({
        mode: "edit",
        index,
        draft: { ...drive },
      });
    },
    [drives],
  );

  const closeModal = useCallback(() => {
    setModal(null);
    setSaveError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!modal) return;
    const next = [...drives];
    if (modal.mode === "add") {
      next.push(modal.draft);
    } else {
      next[modal.index] = modal.draft;
    }
    try {
      await putDrives(next);
      setDrives(next);
      setModal(null);
      setSaveError(null);
    } catch (err) {
      setSaveError(describeError(err, t));
    }
  }, [drives, modal, t]);

  const handleDelete = useCallback(async () => {
    if (!confirm) return;
    const next = drives.filter((_, i) => i !== confirm.index);
    try {
      await putDrives(next);
      setDrives(next);
      setConfirm(null);
      setSaveError(null);
    } catch (err) {
      setSaveError(describeError(err, t));
    }
  }, [confirm, drives, t]);

  const updateDraft = useCallback(
    (patch: Partial<DriveEntry>) => {
      setModal((prev) =>
        prev ? { ...prev, draft: { ...prev.draft, ...patch } } : prev,
      );
    },
    [],
  );

  const sortedDrives = useMemo(() => drives, [drives]);

  return (
    <section className="rounded-xl border border-bg-border bg-bg-card p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-text-muted">{t("description")}</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="rounded-2xl bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
        >
          {t("addButton")}
        </button>
      </div>

      <details className="mb-4 rounded-xl bg-bg-elevated p-4 text-sm">
        <summary className="cursor-pointer font-medium text-text-primary">
          {t("addMountHelp.title")}
        </summary>
        <div className="mt-3 space-y-2 text-text-muted">
          <p>{t("addMountHelp.body")}</p>
          <code className="block break-anywhere rounded-lg bg-bg-card px-3 py-2 text-xs text-text-primary">
            {t("addMountHelp.command")}
          </code>
        </div>
      </details>

      {loadError && (
        <p className="mb-3 text-xs text-danger">{loadError}</p>
      )}

      <ul className="divide-y divide-bg-border">
        {sortedDrives.map((drive, index) => (
          <li
            key={`${drive.name}-${index}`}
            className="flex items-center justify-between gap-2 py-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary">
                {drive.name}
              </div>
              <div className="break-anywhere text-xs text-text-muted">
                {drive.path}
              </div>
              {drive.access_group && (
                <div className="text-xs text-text-muted">
                  group: {drive.access_group}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => openEdit(index)}
                className="rounded-2xl bg-sand px-3 py-1 text-xs text-text-primary hover:bg-sand-hover"
              >
                {t("editButton")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSaveError(null);
                  setConfirm({ index });
                }}
                className="rounded-2xl px-3 py-1 text-xs text-danger hover:bg-danger/10"
              >
                {t("deleteButton")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {modal && (
        <DriveModal
          draft={modal.draft}
          onChange={updateDraft}
          onCancel={closeModal}
          onSave={handleSave}
          error={saveError}
          t={t}
        />
      )}

      {confirm && (
        <ConfirmDeleteDialog
          name={drives[confirm.index]?.name ?? ""}
          onCancel={() => setConfirm(null)}
          onConfirm={handleDelete}
          error={saveError}
          t={t}
        />
      )}
    </section>
  );
}

interface DriveModalProps {
  draft: DriveEntry;
  onChange: (patch: Partial<DriveEntry>) => void;
  onCancel: () => void;
  onSave: () => void;
  error: { message: string; field?: string } | null;
  t: (key: string) => string;
}

function DriveModal({
  draft,
  onChange,
  onCancel,
  onSave,
  error,
  t,
}: DriveModalProps): React.ReactElement {
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
              {t("fields.name")}
            </span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => onChange({ name: e.target.value })}
              className="w-full rounded-2xl border border-warm-silver/40 bg-bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus-ring"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text-primary">
              {t("fields.path")}
            </span>
            <input
              type="text"
              value={draft.path}
              onChange={(e) => onChange({ path: e.target.value })}
              className="w-full rounded-2xl border border-warm-silver/40 bg-bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus-ring"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-text-primary">
              {t("fields.group")}
            </span>
            <input
              type="text"
              value={draft.access_group ?? ""}
              onChange={(e) => onChange({ access_group: e.target.value })}
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

interface ConfirmDeleteDialogProps {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
  error: { message: string; field?: string } | null;
  t: (key: string, values?: Record<string, string | number>) => string;
}

function ConfirmDeleteDialog({
  name,
  onCancel,
  onConfirm,
  error,
  t,
}: ConfirmDeleteDialogProps): React.ReactElement {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-bg-card p-5">
        <h3 className="mb-2 text-base font-semibold text-text-primary">
          {t("deleteConfirmTitle")}
        </h3>
        <p className="text-sm text-text-muted">
          {t("deleteConfirmBody", { name })}
        </p>
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
            onClick={onConfirm}
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            {t("confirmButton")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DrivesSection;
