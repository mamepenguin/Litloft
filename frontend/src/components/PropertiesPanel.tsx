"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExternalLink, FileText, Film, Image as ImageIcon, Music } from "lucide-react";
import { formatRelativeDate } from "@/lib/format";
import { getFile } from "@/lib/api";
import type { FileItem } from "@/types";
import { EditableTagChips } from "@/components/EditableTagChips";

// Recommended keys — rendered with typed renderers in a fixed order.
// Unknown keys (including legacy ``approved_at`` / ``clipped_at`` left
// over from pre-2026-04-24 writes) fall through to a plain-text
// renderer. The backend note_scanner still reads those legacy keys for
// DB consistency, but the UI intentionally does not promote them to
// the "作成" slot — only new writes (``created``) get that treatment.
// Spec 2026-04-24-knowledge-frontmatter-schema-and-display.
const RESERVED_KEYS = [
  "origin",
  "url",
  "tags",
  "aliases",
  "description",
  "sources",
  "created",
] as const;

interface NormalisedEntry {
  key: string;
  label: string;
  kind:
    | "origin"
    | "url"
    | "tags"
    | "aliases"
    | "description"
    | "sources"
    | "created"
    | "unknown";
  value: unknown;
}

function normalise(
  frontmatter: Record<string, unknown>,
  labels: (key: string) => string,
): NormalisedEntry[] {
  const entries: NormalisedEntry[] = [];
  const consumed = new Set<string>();

  for (const key of RESERVED_KEYS) {
    // ``source_file_ids`` is written by distill but we present it under
    // the friendlier label "sources".
    const actualKey = key === "sources" ? "source_file_ids" : key;
    if (frontmatter[actualKey] === undefined || frontmatter[actualKey] === null) {
      continue;
    }
    consumed.add(actualKey);
    entries.push({
      key,
      label: labels(key),
      kind: key as NormalisedEntry["kind"],
      value: frontmatter[actualKey],
    });
  }

  for (const [key, value] of Object.entries(frontmatter)) {
    if (consumed.has(key)) continue;
    if (value === undefined || value === null) continue;
    entries.push({
      key,
      label: key,
      kind: "unknown",
      value,
    });
  }

  return entries;
}

function TagPill({ text, tone }: { text: string; tone: "tag" | "alias" }) {
  const toneClass =
    tone === "tag"
      ? "bg-accent-teal/15 text-accent-teal"
      : "bg-bg-elevated text-text-muted";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${toneClass}`}
    >
      {text}
    </span>
  );
}

function TagsRenderer({ value, tone }: { value: unknown; tone: "tag" | "alias" }) {
  const items = toStringArray(value);
  if (items.length === 0) return <span className="text-text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <TagPill key={`${t}-${i}`} text={t} tone={tone} />
      ))}
    </div>
  );
}

function DescriptionRenderer({ value }: { value: unknown }) {
  const text = String(value ?? "");
  return (
    <p className="line-clamp-3 text-sm leading-relaxed text-text-primary hover:line-clamp-none">
      {text}
    </p>
  );
}

function DateRenderer({ value }: { value: unknown }) {
  const raw = typeof value === "string" ? value : String(value ?? "");
  if (!raw) return <span className="text-text-muted">—</span>;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return <span className="text-text-primary">{raw}</span>;
  }
  return (
    <time
      dateTime={raw}
      title={date.toLocaleString()}
      className="text-sm text-text-primary"
    >
      {formatRelativeDate(raw)}
    </time>
  );
}

function UrlRenderer({ value }: { value: unknown }) {
  const href = typeof value === "string" ? value : String(value ?? "");
  if (!href) return <span className="text-text-muted">—</span>;
  let host = href;
  try {
    host = new URL(href).host;
  } catch {
    // pass through raw
  }
  const safe = href.startsWith("http://") || href.startsWith("https://");
  if (!safe) {
    return <span className="text-text-primary break-anywhere">{href}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1.5 text-sm text-accent hover:underline"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=16`}
        alt=""
        width={14}
        height={14}
        className="shrink-0 rounded-sm"
        loading="lazy"
      />
      <span className="truncate">{host}</span>
      <ExternalLink size={12} className="shrink-0 opacity-70" />
    </a>
  );
}

function OriginRenderer({ value }: { value: unknown }) {
  const t = useTranslations("propertiesPanel.origin");
  const raw = typeof value === "string" ? value : String(value ?? "");
  if (!raw) return <span className="text-text-muted">—</span>;
  const tone =
    raw === "webclip"
      ? "bg-accent/15 text-accent"
      : raw === "detailed_summary"
        ? "bg-accent-teal/15 text-accent-teal"
        : "bg-bg-elevated text-text-muted";
  // next-intl throws on missing keys; fall back to the raw value for
  // custom origins the user invents.
  let label = raw;
  try {
    label = t(raw);
  } catch {
    label = raw;
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  );
}

function FileTypeIcon({ fileType }: { fileType: string }) {
  const size = 12;
  const cls = "shrink-0 text-text-muted";
  if (fileType === "video") return <Film size={size} className={cls} />;
  if (fileType === "image") return <ImageIcon size={size} className={cls} />;
  if (fileType === "audio") return <Music size={size} className={cls} />;
  return <FileText size={size} className={cls} />;
}

function SourceFileCard({ fileId }: { fileId: string }) {
  const t = useTranslations("propertiesPanel");
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ok"; file: FileItem } | { kind: "missing" }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    getFile(fileId)
      .then((file) => {
        if (!cancelled) setState({ kind: "ok", file });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "missing" });
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (state.kind === "loading") {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-lg border border-bg-border bg-bg-card px-2 py-1 text-xs text-text-muted">
        <span className="inline-block h-3 w-3 animate-pulse rounded-sm bg-bg-elevated" />
        <span className="inline-block h-3 w-20 animate-pulse rounded bg-bg-elevated" />
      </div>
    );
  }

  if (state.kind === "missing") {
    return (
      <span
        title={t("sourceMissing")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-bg-border bg-bg-card px-2 py-1 text-xs text-text-muted opacity-70"
      >
        <FileText size={12} className="shrink-0" />
        <span className="truncate max-w-[14ch]">{fileId}</span>
      </span>
    );
  }

  const { file } = state;
  return (
    <Link
      href={`/files/${file.id}`}
      className="group inline-flex max-w-full items-center gap-1.5 rounded-lg border border-bg-border bg-bg-card px-2 py-1 text-xs text-text-primary transition hover:border-warm-silver/60 hover:bg-bg-elevated"
      title={file.filename}
    >
      {file.has_thumbnail ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={file.thumbnail_url}
          alt=""
          width={16}
          height={16}
          className="h-4 w-4 shrink-0 rounded-sm object-cover"
          loading="lazy"
        />
      ) : (
        <FileTypeIcon fileType={file.file_type} />
      )}
      <span className="truncate max-w-[24ch]">{file.filename}</span>
    </Link>
  );
}

function SourcesRenderer({ value }: { value: unknown }) {
  const t = useTranslations("propertiesPanel");
  const ids = toStringArray(value);
  const [expanded, setExpanded] = useState(false);
  if (ids.length === 0) return <span className="text-text-muted">—</span>;
  const visibleLimit = expanded ? ids.length : 5;
  const visible = ids.slice(0, visibleLimit);
  const hidden = ids.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((id) => (
        <SourceFileCard key={id} fileId={id} />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-lg px-2 py-1 text-xs text-text-muted hover:bg-bg-card hover:text-text-primary"
        >
          {t("sourcesMore", { n: hidden })}
        </button>
      )}
    </div>
  );
}

function UnknownRenderer({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <span className="text-sm text-text-primary break-anywhere">
        {value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ")}
      </span>
    );
  }
  if (typeof value === "object" && value !== null) {
    return (
      <code className="text-xs text-text-muted break-anywhere">
        {JSON.stringify(value)}
      </code>
    );
  }
  return (
    <span className="text-sm text-text-primary break-anywhere">
      {String(value)}
    </span>
  );
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" || typeof v === "number" ? String(v) : null))
      .filter((v): v is string => v !== null && v.length > 0);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value];
  }
  return [];
}

type EditableRef = Pick<FileItem, "id" | "mime_type" | "filename" | "drive">;

function renderValue(
  entry: NormalisedEntry,
  editable: EditableRef | null,
  onTagsChange: ((tags: string[]) => void) | undefined,
  onSaveSuccess: ((tags: string[]) => void) | undefined,
  contentMode: { source: string; onChange: (next: string) => void } | null,
) {
  switch (entry.kind) {
    case "tags":
      if (editable) {
        if (contentMode) {
          // Content mode delegates saving to the parent's writer
          // (Knowledge editor textarea auto-save); onSaveSuccess has
          // no save to hook onto, so we don't forward it.
          return (
            <EditableTagChips
              file={editable}
              content={contentMode.source}
              onContentChange={contentMode.onChange}
              onTagsChange={onTagsChange}
            />
          );
        }
        return (
          <EditableTagChips
            file={editable}
            initialTags={toStringArray(entry.value)}
            onTagsChange={onTagsChange}
            onSaveSuccess={onSaveSuccess}
          />
        );
      }
      return <TagsRenderer value={entry.value} tone="tag" />;
    case "aliases":
      return <TagsRenderer value={entry.value} tone="alias" />;
    case "description":
      return <DescriptionRenderer value={entry.value} />;
    case "created":
      return <DateRenderer value={entry.value} />;
    case "url":
      return <UrlRenderer value={entry.value} />;
    case "origin":
      return <OriginRenderer value={entry.value} />;
    case "sources":
      return <SourcesRenderer value={entry.value} />;
    default:
      return <UnknownRenderer value={entry.value} />;
  }
}

/**
 * Obsidian-style Properties Panel for Markdown frontmatter.
 *
 * - Recognised keys (`tags`, `aliases`, `description`, `created`,
 *   `url`, `origin`, `source_file_ids`) get typed renderers; unknown
 *   keys fall through to plain-text (graceful fallback).
 * - Legacy date keys (`approved_at`, `clipped_at`) are read as
 *   aliases of `created` so older `.md` files render naturally.
 * - Renders `null` when the frontmatter is empty so `.md` files without
 *   frontmatter do not get a stray panel — unless ``editable`` is
 *   passed, in which case an empty-tags chip row is shown so the user
 *   has a surface to add tags on.
 * - When ``editable`` is passed, the `tags` row becomes an in-place
 *   editor backed by ``saveFileTags`` (spec §D3/D4). Other rows stay
 *   read-only in v1.
 *
 * Spec: 2026-04-24-knowledge-frontmatter-schema-and-display.md and
 * 2026-04-24-knowledge-tag-unification.md.
 */
export function PropertiesPanel({
  frontmatter,
  editable,
  onTagsChange,
  onTagsSaved,
  source,
  onSourceChange,
}: {
  frontmatter: Record<string, unknown>;
  /**
   * When provided, the ``tags`` row becomes an editable chip group
   * backed by ``saveFileTags`` for the file.
   */
  editable?: EditableRef;
  /**
   * Optional callback fired with the desired tag list as soon as the
   * user edits a chip — lets the parent update its own optimistic
   * state (e.g. a file list's chip column) without waiting for the
   * backend round-trip.
   */
  onTagsChange?: (tags: string[]) => void;
  /**
   * Fires once per debounced save after the backend confirms.
   * Intended for cross-surface sync: the file detail page uses this
   * to refetch ``file`` (so the outer ``File.tags`` chip row matches
   * the freshly-projected state) and bump the Markdown source reload
   * key (so this same panel's frontmatter display is authoritative).
   * Only forwarded in standalone mode — content mode has no save to
   * hook onto.
   */
  onTagsSaved?: (tags: string[]) => void;
  /**
   * Content-mode opt-in (see ``MarkdownPreview.onSourceChange``). When
   * ``source`` + ``onSourceChange`` are both supplied, chip edits
   * rewrite the full ``.md`` source and flow back out — the panel
   * never writes on its own. Intended for surfaces like the Knowledge
   * editor where a sibling textarea already owns the save path.
   */
  source?: string;
  onSourceChange?: (next: string) => void;
}) {
  const t = useTranslations("propertiesPanel.labels");
  const labels = (key: string) => {
    try {
      return t(key);
    } catch {
      return key;
    }
  };
  let entries = normalise(frontmatter, labels);

  // Edit affordance: ensure there's always a ``tags`` row to click
  // when the caller wants editing. Without this, a ``.md`` that has
  // never been tagged would show no panel at all and the user would
  // have no surface to start from.
  if (editable && !entries.some((e) => e.key === "tags")) {
    entries = [
      { key: "tags", label: labels("tags"), kind: "tags", value: [] },
      ...entries,
    ];
  }
  if (entries.length === 0) return null;

  return (
    <dl className="overflow-hidden rounded-xl border border-bg-border bg-bg-elevated text-sm">
      {entries.map((entry) => (
        <div
          key={entry.key}
          className="grid grid-cols-[minmax(80px,auto)_1fr] gap-x-4 px-4 py-2.5"
        >
          <dt className="self-start pt-0.5 text-xs uppercase tracking-wide text-text-muted">
            {entry.label}
          </dt>
          <dd className="min-w-0 break-anywhere text-text-primary">
            {renderValue(
              entry,
              editable ?? null,
              onTagsChange,
              onTagsSaved,
              source !== undefined && onSourceChange
                ? { source, onChange: onSourceChange }
                : null,
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
