"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { getStreamUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { useHighlightPassage } from "@/hooks/useHighlightPassage";
import { useDocumentCapturePublisher } from "@/hooks/useDocumentCapturePublisher";
import type { DocumentCaptureController } from "@/lib/documentCapture";

const MAX_AUTO_LOAD_SIZE = 1024 * 1024; // 1MB

const TEXT_MIME_PREFIXES = ["text/"] as const;
const TEXT_MIME_EXACT = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-yaml",
  "application/yaml",
  "application/x-sh",
  "application/x-python",
  "application/x-ruby",
  "application/x-perl",
  "application/sql",
  "application/toml",
]);

/**
 * Extensions this viewer can read that no mime says so for.
 *
 * The mime an archive entry carries comes from `classify(decoded_name)`
 * (`backend/app/services/filetype.py`), which is the same table core's search,
 * type labels and drive filters read. Teaching *it* about `.dart` would move
 * every `.dart` file in every drive into the "document" bucket of a listing —
 * a different question from whether this component can render one. So the
 * allowlist lives here, beside the renderer whose capability it describes.
 *
 * An allowlist, not a denylist: `.bin`, `.raw` and `a.out` have to stay
 * unreadable, and a rule shaped as "anything but these" admits every format
 * nobody has thought of yet.
 */
const TEXT_SUFFIXES = new Set([
  "dart", "rs", "go", "kt", "kts", "swift", "rb", "php", "lua", "r",
  "c", "h", "cc", "cpp", "hpp", "cs", "java", "scala", "ex", "exs",
  "vue", "svelte", "ts", "tsx", "jsx", "mjs", "cjs", "mts", "cts",
  "toml", "ini", "cfg", "conf", "env", "properties", "yml", "yaml",
  "gradle", "cmake", "mk", "dockerfile", "gitignore", "editorconfig",
  "gitattributes", "gitmodules", "gitconfig", "dockerignore",
  "npmrc", "nvmrc", "prettierrc", "eslintrc", "babelrc", "browserslistrc",
  "sql", "graphql", "gql", "proto", "patch", "diff", "lock",
  "md", "markdown", "rst", "adoc", "tex", "csv", "tsv", "log",
  "py", "sh", "bash", "zsh", "tf", "tfvars",
]);

/**
 * Files whose whole name is the type. No extension to read.
 */
const TEXT_FILENAMES = new Set([
  "makefile", "dockerfile", "license", "licence", "readme", "changelog",
  "authors", "contributing", "notice", "copying", "codeowners", "procfile",
  "gemfile", "rakefile", "brewfile", "vagrantfile", "justfile",
]);

/**
 * Can this viewer render the entry?
 *
 * `filename` is optional because the callers that pass a real file have a
 * mime worth trusting — it was set by the same `classify` on the way in. The
 * archive is the caller that does not: a ZIP entry's mime is guessed from a
 * name, and the guess is `application/octet-stream` for anything the drive
 * listing has no bucket for.
 */
export function isTextPreviewable(mimeType: string, filename?: string): boolean {
  if (TEXT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    return true;
  }
  if (TEXT_MIME_EXACT.has(mimeType)) return true;
  if (filename === undefined) return false;

  const base = filename.slice(filename.lastIndexOf("/") + 1).toLowerCase();
  if (TEXT_FILENAMES.has(base)) return true;

  if (base.startsWith(".")) {
    // A dotfile's *leading* segment names its type, not its trailing one:
    // `.gitignore`, and `.env.local` as much as `.env`. Reading the last
    // segment instead would ask whether `local` is a language.
    const lead = base.slice(1).split(".")[0];
    return TEXT_SUFFIXES.has(lead) || TEXT_FILENAMES.has(lead);
  }

  const dot = base.lastIndexOf(".");
  // No extension at all, and the whole-filename list above already said no.
  // Matching such a name against the *extension* list is how `bin/go`,
  // `usr/bin/env` and `bin/patch` — ELF binaries named after the languages
  // and tools on that list — would be opened and rendered as text, which is
  // the outcome an allowlist exists to prevent.
  if (dot < 0) return false;
  return TEXT_SUFFIXES.has(base.slice(dot + 1));
}

export function TextPreview({
  fileId,
  fileSize,
  highlight,
  onDocumentCaptureController,
}: {
  fileId: string;
  fileSize: number;
  highlight?: string;
  onDocumentCaptureController?: (
    controller: DocumentCaptureController | null,
  ) => void;
}) {
  const t = useTranslations("text");
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(fileSize <= MAX_AUTO_LOAD_SIZE);
  const preRef = useRef<HTMLPreElement>(null);
  useDocumentCapturePublisher(preRef, onDocumentCaptureController);
  useHighlightPassage(preRef, highlight, content !== null);

  useEffect(() => {
    if (!confirmed) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(getStreamUrl(fileId), { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fileId, confirmed]);

  if (!confirmed) {
    return (
      <div className="flex w-full flex-col items-center justify-center rounded-xl bg-bg-card py-16">
        <p className="text-sm text-text-muted">
          {t("fileSizeLarge", { size: formatFileSize(fileSize) })}
        </p>
        <button
          type="button"
          onClick={() => setConfirmed(true)}
          className="mt-4 rounded-2xl bg-accent px-4 py-2 text-sm text-white transition-colors hover:bg-accent-hover"
        >
          {t("loadContent")}
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-bg-card py-16">
        <p className="text-sm text-text-muted">{t("loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-bg-card py-16">
        <p className="text-sm text-danger">{t("loadFailed", { error: error ?? "" })}</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl bg-bg-card">
      <pre
        ref={preRef}
        className="p-4 text-sm leading-relaxed text-text-primary font-mono whitespace-pre-wrap break-words"
      >
        {content}
      </pre>
    </div>
  );
}
