"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Database,
  File,
  Film,
  HardDrive,
  Image,
  Loader2,
  Music,
  FileText,
  Archive,
  Server,
  Trash2,
  Clock,
} from "lucide-react";

import { getDashboard } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { useWebSocket } from "@/hooks/useWebSocket";
import { DuplicatesSection } from "@/components/DuplicatesSection";
import type { DashboardDriveInfo, DashboardResponse, DashboardSystemInfo } from "@/types";

function formatUptime(
  seconds: number,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(t("days", { count: days }));
  if (hours > 0) parts.push(t("hours", { count: hours }));
  if (minutes > 0 || parts.length === 0) parts.push(t("minutes", { count: minutes }));
  return parts.join(" ");
}

function usageColorClass(percent: number): string {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 70) return "bg-yellow-500";
  return "bg-emerald-500";
}

const FILE_TYPE_ICONS: Record<string, typeof Film> = {
  video: Film,
  image: Image,
  audio: Music,
  document: FileText,
  archive: Archive,
  other: File,
};

function DriveCardSkeleton() {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5 animate-pulse">
      <div className="mb-4 h-5 w-32 rounded bg-bg-elevated" />
      <div className="mb-3 h-3 w-full rounded-full bg-bg-elevated" />
      <div className="mb-4 h-4 w-48 rounded bg-bg-elevated" />
      <div className="flex gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-4 w-16 rounded bg-bg-elevated" />
        ))}
      </div>
    </div>
  );
}

function SystemCardSkeleton() {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5 animate-pulse">
      <div className="mb-4 h-5 w-24 rounded bg-bg-elevated" />
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-10 rounded bg-bg-elevated" />
        ))}
      </div>
    </div>
  );
}

function UsageBar({ usedBytes, totalBytes }: { usedBytes: number; totalBytes: number }) {
  const percent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

  return (
    <div className="w-full">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-bg-elevated">
        <div
          className={`h-full rounded-full transition-all ${usageColorClass(percent)}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-text-muted">
        <span>{percent.toFixed(1)}%</span>
        <span>{formatFileSize(usedBytes)} / {formatFileSize(totalBytes)}</span>
      </div>
    </div>
  );
}

function FileTypeBadges({ fileTypes }: { fileTypes: Record<string, number> }) {
  const entries = useMemo(
    () => Object.entries(fileTypes).filter(([, count]) => count > 0),
    [fileTypes],
  );

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([type, count]) => {
        const Icon = FILE_TYPE_ICONS[type] ?? File;
        return (
          <span
            key={type}
            className="inline-flex items-center gap-1 rounded-md bg-bg-elevated px-2 py-0.5 text-xs text-text-muted"
          >
            <Icon size={12} />
            {count}
          </span>
        );
      })}
    </div>
  );
}

function DriveCard({ drive }: { drive: DashboardDriveInfo }) {
  const t = useTranslations("admin");

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <HardDrive size={18} className="text-accent" />
        <h3 className="text-sm font-semibold text-text-primary">{drive.name}</h3>
        {drive.readonly && (
          <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
            {t("readonly")}
          </span>
        )}
      </div>

      <UsageBar usedBytes={drive.used_bytes} totalBytes={drive.total_bytes} />

      <div className="mt-3 text-xs text-text-muted">
        {t("files", { count: drive.file_count })}
      </div>

      <div className="mt-2">
        <FileTypeBadges fileTypes={drive.file_types} />
      </div>

      <div className="mt-3 text-xs text-text-muted">
        {drive.is_scanning ? (
          <span className="inline-flex items-center gap-1 text-accent">
            <Loader2 size={12} className="animate-spin" />
            {t("scanning")}
          </span>
        ) : drive.last_scanned_at ? (
          <span>{t("lastScanned")}: {new Date(drive.last_scanned_at).toLocaleString()}</span>
        ) : (
          <span>{t("neverScanned")}</span>
        )}
      </div>
    </div>
  );
}

function StatItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-bg-elevated px-3 py-2.5">
      <Icon size={16} className="shrink-0 text-accent" />
      <div className="min-w-0">
        <div className="text-xs text-text-muted">{label}</div>
        <div className="text-sm font-medium text-text-primary">{value}</div>
      </div>
    </div>
  );
}

function SystemCard({ system }: { system: DashboardSystemInfo }) {
  const t = useTranslations("admin");

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Server size={18} className="text-accent" />
        <h3 className="text-sm font-semibold text-text-primary">{t("system")}</h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatItem icon={File} label={t("totalFiles")} value={system.total_files.toLocaleString()} />
        <StatItem icon={Trash2} label={t("trashCount")} value={system.trash_count.toLocaleString()} />
        <StatItem icon={Database} label={t("dbSize")} value={formatFileSize(system.db_size_bytes)} />
        <StatItem icon={Image} label={t("thumbnailCache")} value={formatFileSize(system.thumbnail_cache_bytes)} />
        <StatItem icon={Film} label={t("previewCache")} value={formatFileSize(system.preview_cache_bytes)} />
        <StatItem icon={HardDrive} label={t("convertedCache")} value={formatFileSize(system.converted_cache_bytes)} />
        <StatItem icon={Archive} label={t("uploadTemp")} value={formatFileSize(system.upload_temp_bytes)} />
        <StatItem icon={Clock} label={t("uptime")} value={formatUptime(system.uptime_seconds, t)} />
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const t = useTranslations("admin");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scanEvent = useWebSocket("scan:complete");

  const fetchData = useCallback(async () => {
    try {
      const result = await getDashboard();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadError"));
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (scanEvent) {
      fetchData();
    }
  }, [scanEvent, fetchData]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-xl font-bold text-text-primary">{t("title")}</h1>

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
          {t("drives")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data
            ? data.drives.map((drive) => <DriveCard key={drive.name} drive={drive} />)
            : [1, 2, 3].map((i) => <DriveCardSkeleton key={i} />)}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-muted">
          {t("system")}
        </h2>
        {data ? <SystemCard system={data.system} /> : <SystemCardSkeleton />}
      </section>

      <DuplicatesSection />
    </div>
  );
}
