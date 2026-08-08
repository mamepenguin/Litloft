"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  ImageDown,
  Loader2,
  Search,
  Square,
} from "lucide-react";

import { FolderPicker } from "@/components/FolderPicker";
import type { Drive } from "@/types";
import type {
  MarkdownImageAnalysis,
  MarkdownImageImportJob,
} from "@/lib/markdownImageImport";

const COUNT_KEYS = [
  "total_markdown",
  "local_loft_image",
  "external_https_candidate",
  "no_image",
  "unsupported_first_image",
  "invalid_loft_reference",
  "read_error",
] as const;

const ACTIVE_STATES = new Set(["queued", "running", "cancelling"]);

interface Props {
  drives: Drive[];
  drive: string;
  folderPath: string;
  recursive: boolean;
  analysis: MarkdownImageAnalysis | null;
  selectedHosts: Set<string>;
  job: MarkdownImageImportJob | null;
  loading: boolean;
  error: string | null;
  onDriveChange: (drive: string) => void;
  onFolderPathChange: (path: string) => void;
  onRecursiveChange: (value: boolean) => void;
  onAnalyze: () => void;
  onHostToggle: (host: string) => void;
  onImport: () => void;
  onCancel: () => void;
}

function JobStatus({ job, onCancel }: { job: MarkdownImageImportJob; onCancel: () => void }) {
  const t = useTranslations("markdownImages");
  const active = ACTIVE_STATES.has(job.state);
  const percent = job.total > 0 ? Math.min(100, (job.processed / job.total) * 100) : 0;

  return (
    <section className="border-t border-bg-border py-6" aria-live="polite">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {active ? (
            <Loader2 size={18} className="animate-spin text-accent" />
          ) : job.state === "completed" ? (
            <CheckCircle2 size={18} className="text-accent-teal" />
          ) : (
            <AlertCircle size={18} className="text-accent-amber" />
          )}
          <h2 className="text-base font-semibold text-text-primary">
            {t(`states.${job.state}`)}
          </h2>
        </div>
        {active && job.state !== "cancelling" && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10"
          >
            <Square size={14} />
            {t("cancel")}
          </button>
        )}
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-bg-elevated">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-text-muted">
        <span>{t("progress", { processed: job.processed, total: job.total })}</span>
        <span>{percent.toFixed(0)}%</span>
      </div>
      {job.current_file && (
        <p className="mt-3 truncate text-sm text-text-muted">{job.current_file}</p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
        {(["succeeded", "reused", "skipped", "conflicts", "failed"] as const).map((key) => (
          <div key={key}>
            <div className="text-xs text-text-muted">{t(`jobCounts.${key}`)}</div>
            <div className="text-lg font-semibold text-text-primary">{job[key]}</div>
          </div>
        ))}
      </div>

      {job.recent_errors.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-xl border border-danger/30">
          <div className="border-b border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            {t("recentErrors")}
          </div>
          <div className="max-h-56 divide-y divide-bg-border overflow-y-auto">
            {job.recent_errors.map((item, index) => (
              <div key={`${item.file_path}-${item.code}-${index}`} className="px-3 py-2 text-xs">
                <div className="truncate font-medium text-text-primary">{item.file_path || item.code}</div>
                <div className="mt-0.5 text-text-muted">{item.code}: {item.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function MarkdownImagesPresenter(props: Props) {
  const t = useTranslations("markdownImages");
  const selectedCount = props.analysis
    ? Object.entries(props.analysis.host_counts)
        .filter(([host]) => props.selectedHosts.has(host))
        .reduce((sum, [, count]) => sum + count, 0)
    : 0;
  const jobActive = props.job ? ACTIVE_STATES.has(props.job.state) : false;

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/admin"
          aria-label={t("back")}
          className="rounded-2xl p-2 text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
        >
          <ArrowLeft size={18} />
        </Link>
        <ImageDown size={22} className="text-accent" />
        <h1 className="text-xl font-bold text-text-primary">{t("title")}</h1>
      </div>

      {props.error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {props.error}
        </div>
      )}

      <section className="pb-6">
        <h2 className="mb-4 text-sm font-semibold text-text-primary">{t("scope")}</h2>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="block min-w-0 text-sm text-text-muted">
            <span className="mb-1.5 block">{t("drive")}</span>
            <select
              value={props.drive}
              onChange={(event) => props.onDriveChange(event.target.value)}
              className="h-11 w-full min-w-0 max-w-full rounded-2xl border border-bg-border bg-bg-primary px-3 text-text-primary transition-colors hover:bg-bg-elevated focus:outline-none focus:ring-2 focus:ring-focus-ring"
            >
              {props.drives.map((drive) => (
                <option key={drive.name} value={drive.name}>{drive.name}</option>
              ))}
            </select>
          </label>
          <div className="min-w-0">
            <span className="mb-1.5 block text-sm text-text-muted">{t("folder")}</span>
            {props.drive ? (
              <FolderPicker
                drive={props.drive}
                value={props.folderPath}
                onChange={props.onFolderPathChange}
              />
            ) : (
              <div className="h-11 rounded-2xl border border-bg-border bg-bg-elevated" />
            )}
          </div>
        </div>
        <label className="mt-4 inline-flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={props.recursive}
            onChange={(event) => props.onRecursiveChange(event.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          {t("recursive")}
        </label>
        <div className="mt-5">
          <button
            type="button"
            onClick={props.onAnalyze}
            disabled={!props.drive || props.loading || jobActive}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent"
          >
            {props.loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {t("analyze")}
          </button>
        </div>
      </section>

      {props.analysis && (
        <section className="border-t border-bg-border py-6">
          <h2 className="mb-4 text-sm font-semibold text-text-primary">{t("analysis")}</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {COUNT_KEYS.map((key) => (
              <div key={key}>
                <div className="text-xs text-text-muted">{t(`counts.${key}`)}</div>
                <div className="text-lg font-semibold text-text-primary">
                  {(props.analysis?.counts[key] ?? 0).toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          <h3 className="mb-2 mt-6 text-sm font-medium text-text-primary">{t("hosts")}</h3>
          {Object.keys(props.analysis.host_counts).length === 0 ? (
            <p className="text-sm text-text-muted">{t("noCandidates")}</p>
          ) : (
            <div className="divide-y divide-bg-border overflow-hidden rounded-xl border border-bg-border">
              {Object.entries(props.analysis.host_counts).map(([host, count]) => (
                <label
                  key={host}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-bg-elevated"
                >
                  <input
                    type="checkbox"
                    aria-label={host}
                    checked={props.selectedHosts.has(host)}
                    onChange={() => props.onHostToggle(host)}
                    className="h-4 w-4 accent-accent"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{host}</span>
                  <span className="text-sm tabular-nums text-text-muted">{count.toLocaleString()}</span>
                </label>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={props.onImport}
              disabled={selectedCount === 0 || props.loading || jobActive}
              className="inline-flex h-10 items-center gap-2 rounded-2xl bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent"
            >
              <Download size={16} />
              {t("import", { count: selectedCount })}
            </button>
            <span className="text-xs text-text-muted">{t("selected", { count: selectedCount })}</span>
          </div>

          {props.analysis.samples.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-xl border border-bg-border">
              <div className="border-b border-bg-border bg-bg-elevated px-3 py-2 text-sm font-medium text-text-primary">
                {t("samples")}
              </div>
              <div className="max-h-64 divide-y divide-bg-border overflow-y-auto">
                {props.analysis.samples.map((sample, index) => (
                  <div key={`${sample.file_path}-${index}`} className="flex gap-3 px-3 py-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-text-primary">{sample.file_path}</span>
                    <span className="shrink-0 text-text-muted">{sample.hostname ?? t(`counts.${sample.category}`)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {props.job && <JobStatus job={props.job} onCancel={props.onCancel} />}
    </div>
  );
}
