"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Brain,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  SearchX,
} from "lucide-react";

import {
  getSearchStatus,
  searchQueuePause,
  searchQueueReindex,
  searchQueueResume,
} from "@/lib/api";
import type { SearchServiceStatus } from "@/lib/api";
import { ConfirmDialog } from "./ConfirmDialog";

const POLL_INTERVAL = 10_000;

function ProgressBar({
  done,
  total,
  label,
}: {
  done: number;
  total: number;
  label: string;
}) {
  const percent = total > 0 ? (done / total) * 100 : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted">{label}</span>
        <span className="text-text-primary">{Math.round(percent)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-elevated">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

function StatusContent({ status }: { status: SearchServiceStatus }) {
  const t = useTranslations("semanticSearch");
  const [confirmReindex, setConfirmReindex] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handlePauseResume = useCallback(async () => {
    const isPaused = status.queue?.paused;
    setActionLoading(isPaused ? "resume" : "pause");
    try {
      if (isPaused) {
        await searchQueueResume();
      } else {
        await searchQueuePause();
      }
    } catch {
      // Silently fail - next poll will show actual state
    }
    setActionLoading(null);
  }, [status.queue?.paused]);

  const handleReindex = useCallback(async () => {
    setConfirmReindex(false);
    setActionLoading("reindex");
    try {
      await searchQueueReindex();
    } catch {
      // Silently fail
    }
    setActionLoading(null);
  }, []);

  const indexed = status.indexed;
  const pending = status.pending;
  const queue = status.queue;
  const totalFiles = indexed
    ? indexed.total + (pending?.total ?? 0)
    : 0;
  const whisperTotal = indexed
    ? indexed.whisper + (pending?.whisper ?? 0)
    : 0;
  const clipTotal = indexed
    ? indexed.clip + (pending?.clip ?? 0)
    : 0;

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {t("statusRunning")}
        </span>
        {queue?.paused && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-400">
            <Pause size={10} />
            {t("paused")}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {indexed && (
          <ProgressBar
            done={indexed.total}
            total={totalFiles}
            label={t("indexedFiles", {
              indexed: indexed.total.toLocaleString(),
              total: totalFiles.toLocaleString(),
            })}
          />
        )}

        {indexed && (
          <ProgressBar
            done={indexed.whisper}
            total={whisperTotal}
            label={t("whisperFiles", {
              done: indexed.whisper.toLocaleString(),
              total: whisperTotal.toLocaleString(),
            })}
          />
        )}

        {indexed && (
          <ProgressBar
            done={indexed.clip}
            total={clipTotal}
            label={t("clipFiles", {
              done: indexed.clip.toLocaleString(),
              total: clipTotal.toLocaleString(),
            })}
          />
        )}

        {queue && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-muted">{t("queueLabel")}</span>
            <span className="text-text-primary">
              {t("queueStatus", {
                processing: queue.processing,
                waiting: queue.waiting,
              })}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setConfirmReindex(true)}
          disabled={actionLoading === "reindex"}
          className="inline-flex items-center gap-1.5 rounded-lg bg-bg-elevated px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-border disabled:opacity-50"
        >
          {actionLoading === "reindex" ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          {t("reindex")}
        </button>
        <button
          onClick={handlePauseResume}
          disabled={actionLoading === "pause" || actionLoading === "resume"}
          className="inline-flex items-center gap-1.5 rounded-lg bg-bg-elevated px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-border disabled:opacity-50"
        >
          {actionLoading === "pause" || actionLoading === "resume" ? (
            <Loader2 size={12} className="animate-spin" />
          ) : queue?.paused ? (
            <Play size={12} />
          ) : (
            <Pause size={12} />
          )}
          {queue?.paused ? t("resume") : t("pause")}
        </button>
      </div>

      <ConfirmDialog
        open={confirmReindex}
        title={t("reindex")}
        message={t("confirmReindex")}
        onConfirm={handleReindex}
        onCancel={() => setConfirmReindex(false)}
      />
    </>
  );
}

export function SearchIndexStatus() {
  const t = useTranslations("semanticSearch");
  const [status, setStatus] = useState<SearchServiceStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    const result = await getSearchStatus();
    setStatus(result);
  }, []);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchStatus]);

  if (status === null) {
    return (
      <div className="rounded-xl border border-bg-border bg-bg-card p-5 animate-pulse">
        <div className="mb-4 h-5 w-40 rounded bg-bg-elevated" />
        <div className="space-y-3">
          <div className="h-3 w-full rounded bg-bg-elevated" />
          <div className="h-3 w-3/4 rounded bg-bg-elevated" />
          <div className="h-3 w-1/2 rounded bg-bg-elevated" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Brain size={18} className="text-accent" />
        <h3 className="text-sm font-semibold text-text-primary">
          {t("title")}
        </h3>
      </div>

      {status.available ? (
        <StatusContent status={status} />
      ) : (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <SearchX size={16} />
          {t("unavailable")}
        </div>
      )}
    </div>
  );
}
