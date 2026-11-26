"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { AlertCircle, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FileItem, SubtitleInfo } from "@/types";
import { addSubtitle, deleteSubtitle, replaceSubtitle } from "@/lib/api";
import { ApiStatusError } from "@/lib/apiError";
import {
  isSubtitleRefusal,
  subtitleErrorText,
  type SubtitleErrorText,
} from "@/lib/subtitleErrors";
import { useToast } from "@/components/ToastProvider";
import { Button } from "@/components/Button";
import { RefusalText } from "@/components/RefusalText";
import { ROW_FURNITURE_PADDING } from "@/components/rowFurniture";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const LANGUAGES = [
  "ja",
  "en",
  "zh",
  "ko",
  "fr",
  "de",
  "es",
  "pt",
  "it",
  "ru",
  "ar",
  "th",
  "vi",
] as const;

const OTHER_CODE = "__other__";
const LOFT_MIME = "application/vnd.litloft.loft+json";

type Busy =
  | { kind: "add" }
  | { kind: "replace"; name: string }
  | { kind: "delete"; name: string }
  | null;

interface SubtitlesSectionProps {
  file: FileItem;
  onSubtitlesChange: (subtitles: SubtitleInfo[]) => void;
}

function isLoft(file: FileItem): boolean {
  return (
    file.mime_type === LOFT_MIME ||
    file.filename.toLowerCase().endsWith(".loft")
  );
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export default function SubtitlesSection({
  file,
  onSubtitlesChange,
}: SubtitlesSectionProps) {
  const t = useTranslations("subtitles");
  const te = useTranslations("subtitles.errors");
  const tl = useTranslations("subtitles.languages");
  const tc = useTranslations("common");
  const toast = useToast();

  const subtitles = file.subtitles ?? [];
  const isVideo = file.file_type === "video" && !isLoft(file);

  const [addOpen, setAddOpen] = useState(false);
  const [picked, setPicked] = useState<File | null>(null);
  const [language, setLanguage] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<SubtitleErrorText | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubtitleInfo | null>(null);

  const addInputRef = useRef<HTMLInputElement>(null);
  const fileIdRef = useRef(file.id);
  fileIdRef.current = file.id;
  const sequenceRef = useRef(0);

  useEffect(() => {
    setAddOpen(false);
    setPicked(null);
    setLanguage("");
    setCustomCode("");
    setBusy(null);
    setError(null);
    setDeleteTarget(null);
  }, [file.id]);

  const languageLabel = useCallback(
    (code: string) => {
      if (!code) return t("defaultTrack");
      return (LANGUAGES as readonly string[]).includes(code)
        ? tl(code)
        : code.toUpperCase();
    },
    [t, tl],
  );

  const customCodeValid = /^[A-Za-z]{2,3}$/.test(customCode.trim());
  const otherCodeInvalid = language === OTHER_CODE && !customCodeValid;
  const effectiveLanguage =
    language === OTHER_CODE
      ? customCodeValid
        ? customCode.trim().toLowerCase()
        : ""
      : language;

  const resultingName =
    picked && !otherCodeInvalid
      ? (() => {
          const stem = file.filename.replace(/\.[^./]+$/, "");
          const ext = fileExtension(picked.name);
          const suffix = effectiveLanguage ? `.${effectiveLanguage}` : "";
          return `${stem}${suffix}${ext ? `.${ext}` : ""}`;
        })()
      : "";

  const reloadSubtitles = useCallback(
    async (startedFor: string) => {
      try {
        const api = (await import("@/lib/api")) as {
          getFile?: (id: string) => Promise<FileItem>;
        };
        if (typeof api.getFile !== "function") return;
        const refreshed = await api.getFile(startedFor);
        if (fileIdRef.current !== startedFor) return;
        onSubtitlesChange(refreshed.subtitles ?? []);
      } catch {
        // The stale message still tells the viewer what happened; a failed
        // reload leaves the list as it was.
      }
    },
    [onSubtitlesChange],
  );

  const describeFailure = useCallback(
    (cause: unknown, startedFor: string) => {
      if (!(cause instanceof ApiStatusError)) {
        setError({ message: t("failed"), names: [] });
        return;
      }
      if (cause.status === 404) {
        setError({ message: t("staleList"), names: [] });
        void reloadSubtitles(startedFor);
        return;
      }
      if (isSubtitleRefusal(cause.code)) {
        setError(subtitleErrorText(te, cause.code!, cause.names ?? []));
        return;
      }
      setError({ message: t("failed"), names: [] });
    },
    [reloadSubtitles, te, t],
  );

  const begin = useCallback((action: Exclude<Busy, null>) => {
    setError(null);
    setBusy(action);
    return ++sequenceRef.current;
  }, []);

  const finish = useCallback((sequence: number, startedFor: string) => {
    if (sequence === sequenceRef.current && fileIdRef.current === startedFor) {
      setBusy(null);
    }
  }, []);

  const handleAdd = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (busy || !picked) return;
      const startedFor = file.id;
      const sequence = begin({ kind: "add" });
      try {
        const result = await addSubtitle(file.id, picked, effectiveLanguage);
        if (fileIdRef.current !== startedFor || sequence !== sequenceRef.current) return;
        onSubtitlesChange(result.subtitles);
        setAddOpen(false);
        setPicked(null);
        setLanguage("");
        setCustomCode("");
      } catch (cause) {
        if (fileIdRef.current !== startedFor || sequence !== sequenceRef.current) return;
        describeFailure(cause, startedFor);
      } finally {
        finish(sequence, startedFor);
      }
    },
    [
      begin,
      busy,
      describeFailure,
      effectiveLanguage,
      file.id,
      finish,
      onSubtitlesChange,
      picked,
    ],
  );

  const handleReplace = useCallback(
    async (row: SubtitleInfo, fileToSend: File) => {
      const name = row.filename;
      if (busy || !name) return;
      const startedFor = file.id;
      const sequence = begin({ kind: "replace", name });
      try {
        const result = await replaceSubtitle(file.id, name, fileToSend);
        if (fileIdRef.current !== startedFor || sequence !== sequenceRef.current) return;
        onSubtitlesChange(result.subtitles);
        if (result.sidecar_errors.length > 0) {
          toast.error(
            t("sidecarErrors", { names: result.sidecar_errors.join("、") }),
          );
        }
      } catch (cause) {
        if (fileIdRef.current !== startedFor || sequence !== sequenceRef.current) return;
        describeFailure(cause, startedFor);
      } finally {
        finish(sequence, startedFor);
      }
    },
    [
      begin,
      busy,
      describeFailure,
      file.id,
      finish,
      onSubtitlesChange,
      t,
      toast,
    ],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || busy) return;
    const row = deleteTarget;
    const name = row.filename;
    if (!name) return;
    const startedFor = file.id;
    setDeleteTarget(null);
    const sequence = begin({ kind: "delete", name });
    try {
      const result = await deleteSubtitle(file.id, name);
      if (fileIdRef.current !== startedFor || sequence !== sequenceRef.current) return;
      onSubtitlesChange(result.subtitles);
    } catch (cause) {
      if (fileIdRef.current !== startedFor || sequence !== sequenceRef.current) return;
      describeFailure(cause, startedFor);
    } finally {
      finish(sequence, startedFor);
    }
  }, [
    begin,
    busy,
    deleteTarget,
    describeFailure,
    file.id,
    finish,
    onSubtitlesChange,
  ]);

  if (!isVideo) return null;

  const rowBusy = (row: SubtitleInfo) =>
    busy?.kind === "replace" && row.filename === busy.name
      ? "replace"
      : busy?.kind === "delete" && row.filename === busy.name
        ? "delete"
        : null;

  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-text-muted">
        {t("title")}
        {subtitles.length > 0 && (
          <span className="font-normal"> {subtitles.length}</span>
        )}
      </h3>

      {subtitles.length === 0 ? (
        <p className="text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col">
          {subtitles.map((row) => {
            const label = languageLabel(row.language);
            const inFlight = rowBusy(row);
            return (
              <li
                key={row.filename ?? String(row.index)}
                className={`group/row flex items-center gap-2 rounded-xl px-2.5 py-2 pointer-coarse:py-1 transition-colors hover:bg-bg-elevated ${ROW_FURNITURE_PADDING}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-text-primary">{label}</div>
                  <div className="truncate text-xs text-text-muted">
                    {row.filename ?? ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center opacity-0 transition-opacity pointer-coarse:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                  <input
                    type="file"
                    accept=".srt,.vtt"
                    className="hidden"
                    aria-label={t("replaceLabel", { language: label })}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      const chosen = event.target.files?.[0];
                      event.target.value = "";
                      if (chosen) void handleReplace(row, chosen);
                    }}
                  />
                  <button
                    type="button"
                    aria-label={t("replaceLabel", { language: label })}
                    disabled={busy !== null}
                    onClick={(event) =>
                      event.currentTarget.parentElement
                        ?.querySelector<HTMLInputElement>('input[type="file"]')
                        ?.click()
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-full text-text-primary transition-colors enabled:hover:bg-bg-elevated disabled:cursor-not-allowed disabled:text-warm-silver pointer-coarse:h-11 pointer-coarse:w-11"
                  >
                    {inFlight === "replace" ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={t("deleteLabel", { language: label })}
                    disabled={busy !== null}
                    onClick={() => setDeleteTarget(row)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-danger transition-colors enabled:hover:bg-bg-elevated disabled:cursor-not-allowed disabled:text-warm-silver pointer-coarse:h-11 pointer-coarse:w-11"
                  >
                    {inFlight === "delete" ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-danger/15 px-3 py-2.5 text-xs text-danger"
        >
          <AlertCircle size={16} className="mt-px shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">
            <RefusalText message={error.message} names={error.names} />
          </span>
        </div>
      )}

      {addOpen ? (
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-3 rounded-2xl border border-bg-border bg-bg-elevated p-3"
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-muted">
              {t("file")}
            </span>
            <div className="flex items-center gap-2">
              <input
                ref={addInputRef}
                type="file"
                accept=".srt,.vtt"
                className="hidden"
                aria-label={t("file")}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setPicked(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={busy !== null}
                onClick={() => addInputRef.current?.click()}
              >
                {t("choose")}
              </Button>
              <span className="min-w-0 truncate text-xs text-text-primary">
                {picked?.name ?? ""}
              </span>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-muted">
              {t("language")}
            </span>
            <select
              value={language}
              disabled={busy !== null}
              onChange={(event) => setLanguage(event.target.value)}
              className="rounded-xl border border-bg-border bg-bg-primary px-2.5 py-2 text-sm text-text-primary outline-none focus:border-focus-ring"
            >
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {`${tl(code)} (${code})`}
                </option>
              ))}
              <option value="">{t("none")}</option>
              <option value={OTHER_CODE}>{t("otherCode")}</option>
            </select>
          </label>

          {language === OTHER_CODE && (
            <input
              type="text"
              value={customCode}
              maxLength={3}
              disabled={busy !== null}
              onChange={(event) => setCustomCode(event.target.value)}
              className="rounded-xl border border-bg-border bg-bg-primary px-2.5 py-2 text-sm text-text-primary outline-none focus:border-focus-ring"
            />
          )}

          {resultingName && (
            <p className="truncate text-xs text-text-muted">{resultingName}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => {
                setAddOpen(false);
                setPicked(null);
                setLanguage("");
                setCustomCode("");
              }}
            >
              {tc("cancel")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={busy !== null || !picked || otherCodeInvalid}
            >
              {busy?.kind === "add" && (
                <Loader2 size={14} className="animate-spin" />
              )}
              {t("submit")}
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={() => {
              setError(null);
              setAddOpen(true);
            }}
          >
            <Plus size={14} />
            {t("add")}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("deleteTitle")}
        message=""
        body={
          deleteTarget && (
            <div className="flex flex-col gap-1.5">
              <p className="break-all text-sm font-semibold text-text-primary">
                {deleteTarget.filename ?? ""}
              </p>
              <p className="text-sm text-text-muted">{t("deleteBody")}</p>
              {(deleteTarget.shared_with ?? 0) > 0 && (
                <p className="text-sm text-text-muted">
                  {t("deleteShared", { count: deleteTarget.shared_with ?? 0 })}
                </p>
              )}
            </div>
          )
        }
        confirmTone="danger"
        confirmLabel={tc("delete")}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
