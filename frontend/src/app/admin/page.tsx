"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Database,
  File,
  HardDrive,
  Image,
  Loader2,
  Archive,
  Server,
  Settings,
  Trash2,
  Clock,
  ImageDown,
} from "lucide-react";

import { getDashboard } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { useWebSocket } from "@/hooks/useWebSocket";
import { DuplicatesSection } from "@/components/DuplicatesSection";
import { AddonSlot } from "@/components/AddonSlot";
import type {
  DashboardDriveInfo,
  DashboardResponse,
  DashboardSystemInfo,
} from "@/types";
import { PageHeader } from "@/components/PageHeader";

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
  if (minutes > 0 || parts.length === 0)
    parts.push(t("minutes", { count: minutes }));
  return parts.join(" ");
}

function usageColorClass(percent: number): string {
  if (percent >= 90) return "bg-danger";
  if (percent >= 70) return "bg-accent-amber";
  return "bg-accent-teal";
}

/**
 * The order the breakdown is read in, and the whole of it.
 *
 * Declared rather than derived, because the only reason these are in an
 * order at all is so two drive cards can be compared down the column —
 * and the response cannot supply that. `file_types` comes from a
 * `group_by` (`routers/admin.py`) whose order is not guaranteed, and it
 * omits whatever is zero, so the card used to draw a different number of
 * figures in a different sequence for every drive.
 */
const DRIVE_TYPE_ORDER = [
  "video",
  "audio",
  "document",
  "archive",
  "image",
  "other",
] as const;

function DriveCardSkeleton() {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5 animate-pulse">
      <div className="mb-4 h-5 w-32 rounded-lg bg-bg-elevated" />
      <div className="mb-3 h-3 w-full rounded-full bg-bg-elevated" />
      <div className="mb-4 h-4 w-48 rounded-lg bg-bg-elevated" />
      <div className="flex gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-4 w-16 rounded-lg bg-bg-elevated" />
        ))}
      </div>
    </div>
  );
}

function SystemCardSkeleton() {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5 animate-pulse">
      <div className="mb-4 h-5 w-24 rounded-lg bg-bg-elevated" />
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-10 rounded-lg bg-bg-elevated" />
        ))}
      </div>
    </div>
  );
}

function UsageBar({
  usedBytes,
  totalBytes,
}: {
  usedBytes: number;
  totalBytes: number;
}) {
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
        <span>
          {formatFileSize(usedBytes)} / {formatFileSize(totalBytes)}
        </span>
      </div>
    </div>
  );
}

/**
 * The counts, in `DRIVE_TYPE_ORDER`, always all six.
 *
 * A type the order does not name is folded into `other` rather than
 * dropped: `FileType` has seven members and this has six, and `subtitle`
 * is the one left out. Discarding it silently would leave the breakdown
 * adding up to less than the file count above it with nothing on screen
 * saying why.
 */
export function driveTypeCounts(
  fileTypes: Record<string, number>,
): Array<{ type: (typeof DRIVE_TYPE_ORDER)[number]; count: number }> {
  const known = new Set<string>(DRIVE_TYPE_ORDER);
  const counts = new Map<string, number>(DRIVE_TYPE_ORDER.map((t) => [t, 0]));
  for (const [type, count] of Object.entries(fileTypes)) {
    const bucket = known.has(type) ? type : "other";
    counts.set(bucket, (counts.get(bucket) ?? 0) + count);
  }
  return DRIVE_TYPE_ORDER.map((type) => ({ type, count: counts.get(type)! }));
}

function FileTypeBreakdown({
  fileTypes,
}: {
  fileTypes: Record<string, number>;
}) {
  const t = useTranslations("filter.type");
  const entries = useMemo(() => driveTypeCounts(fileTypes), [fileTypes]);

  // One wrapping line of text rather than a row of icon pills. The pills
  // carried a glyph and a number and no word, so reading one meant
  // knowing the legend; and being pills, they could only be dropped when
  // empty, which is what made the set vary per drive.
  return (
    <p className="text-xs text-text-muted">
      {entries.map(({ type, count }, i) => (
        <span key={type} className={count === 0 ? "text-text-muted/50" : ""}>
          {i > 0 && " · "}
          {t(type)} {count.toLocaleString()}
        </span>
      ))}
    </p>
  );
}

function DriveCard({ drive }: { drive: DashboardDriveInfo }) {
  const t = useTranslations("admin");

  return (
    <div className="rounded-xl border border-bg-border bg-bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <HardDrive size={18} className="text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">
          {drive.name}
        </h3>
        {drive.readonly && (
          <span className="rounded-lg bg-bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
            {t("readonly")}
          </span>
        )}
      </div>

      {/* No usage bar. It measured the filesystem the drive sits on,
          not the drive, so every drive on one disk drew the same bar and
          an empty one read as half full. The real figure is per
          filesystem, in the system section below. */}
      <div className="mt-3 text-xs text-text-muted">
        {t("files", { count: drive.file_count })}
      </div>

      <div className="mt-2">
        <FileTypeBreakdown fileTypes={drive.file_types} />
      </div>

      <div className="mt-3 text-xs text-text-muted">
        {drive.is_scanning ? (
          <span className="inline-flex items-center gap-1 text-accent">
            <Loader2 size={12} className="animate-spin" />
            {t("scanning")}
          </span>
        ) : drive.last_scanned_at ? (
          <span>
            {t("lastScanned")}:{" "}
            {new Date(drive.last_scanned_at).toLocaleString()}
          </span>
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
        <Server size={18} className="text-text-muted" />
        <h3 className="text-sm font-semibold text-text-primary">
          {t("system")}
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatItem
          icon={File}
          label={t("totalFiles")}
          value={system.total_files.toLocaleString()}
        />
        <StatItem
          icon={Trash2}
          label={t("trashCount")}
          value={system.trash_count.toLocaleString()}
        />
        <StatItem
          icon={Database}
          label={t("dbSize")}
          value={formatFileSize(system.db_size_bytes)}
        />
        <StatItem
          icon={Image}
          label={t("thumbnailCache")}
          value={formatFileSize(system.thumbnail_cache_bytes)}
        />
        <StatItem
          icon={HardDrive}
          label={t("convertedCache")}
          value={formatFileSize(system.converted_cache_bytes)}
        />
        <StatItem
          icon={Archive}
          label={t("uploadTemp")}
          value={formatFileSize(system.upload_temp_bytes)}
        />
        <StatItem
          icon={Clock}
          label={t("uptime")}
          value={formatUptime(system.uptime_seconds, t)}
        />
      </div>

      {/* One row per filesystem, naming the drives that share it —
          which is the fact the per-drive bars could not express. */}
      {system.filesystems.length > 0 && (
        <div className="mt-4 space-y-3 border-t border-bg-border pt-4">
          {system.filesystems.map((fs) => (
            <div key={fs.mount_label}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span
                  className="truncate text-text-primary"
                  title={fs.mount_label}
                >
                  {fs.drives.join(", ")}
                </span>
                <span className="flex-shrink-0 text-text-muted">
                  {t("diskUsage", {
                    used: formatFileSize(fs.used_bytes),
                    total: formatFileSize(fs.total_bytes),
                  })}
                </span>
              </div>
              <div className="mt-1">
                <UsageBar
                  usedBytes={fs.used_bytes}
                  totalBytes={fs.total_bytes}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  const t = useTranslations("admin");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Surfaces the 403 returned by /api/admin/* when the caller is not
  // an admin (i.e. doesn't hold every protected access_group). We
  // hide the dashboard widgets slot in that state too — the addon
  // status route is admin-gated server-side, but rendering an empty
  // panel just to have it 403 in the network tab is bad UX.
  const [forbidden, setForbidden] = useState(false);
  const scanEvent = useWebSocket("scan:complete");

  const fetchData = useCallback(async () => {
    try {
      const result = await getDashboard();
      setData(result);
      setError(null);
      setForbidden(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("loadError");
      setError(message);
      setForbidden(/\b403\b/.test(message));
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

  if (forbidden) {
    return (
      // The page's subject in this state is that it cannot be shown, so
      // the refusal takes the heading rather than sitting under the
      // dashboard's name as if the dashboard were merely empty.
      <div className="mx-auto max-w-2xl py-8">
        <PageHeader title={t("title")} scope={t("forbidden")} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl py-2">
      <PageHeader
        title={t("title")}
        actions={
          <>
            <Link
              href="/admin/markdown-images"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
            >
              <ImageDown size={16} />
              {t("markdownImages")}
            </Link>
            <Link
              href="/admin/settings"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
            >
              <Settings size={16} />
              {t("settings")}
            </Link>
          </>
        }
      />

      {/* `PageHeader` brings `px-4`; everything below it matches rather
          than nesting inside a second one. */}
      <div className="px-4 pb-4">
        {error && (
          <div className="mb-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Anything wrong, above everything that is fine.
          An addon reporting a problem — intelligence's failed indexing
          jobs are the first — had nowhere above the fold to say so, so
          it said it at the bottom of a widget three sections down. No
          wrapper and no heading: an alert supplies its own, and
          `empty:hidden` keeps the margin from being the only thing on
          screen when nothing is wrong. */}
        <div className="mb-8 space-y-3 empty:hidden">
          <AddonSlot id="dashboard-alerts" layout="stack" />
        </div>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-text-muted">
            {t("drives")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data
              ? data.drives.map((drive) => (
                  <DriveCard key={drive.name} drive={drive} />
                ))
              : [1, 2, 3].map((i) => <DriveCardSkeleton key={i} />)}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-text-muted">
            {t("system")}
          </h2>
          {data ? <SystemCard system={data.system} /> : <SystemCardSkeleton />}
        </section>

        <section className="mb-8">
          <AddonSlot id="dashboard-widgets" layout="stack" />
        </section>

        <DuplicatesSection />
      </div>
    </div>
  );
}
