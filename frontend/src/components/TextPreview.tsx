"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import hljs from "highlight.js";
import { getStreamUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/format";
import { useHighlightPassage } from "@/hooks/useHighlightPassage";
import { fileNameParts } from "@/lib/fileNameParts";
import { codeLanguageFor } from "@/lib/codeLanguage";
import { splitHighlightedLines, splitPlainLines } from "@/lib/codeLines";
import { useDocumentCapturePublisher } from "@/hooks/useDocumentCapturePublisher";
import type { DocumentCaptureController } from "@/lib/documentCapture";

const MAX_AUTO_LOAD_SIZE = 1024 * 1024;

/**
 * Highlighting and line splitting both run on the main thread, and both cost
 * per line as well as per character: a 512 KB minified bundle is one cheap
 * line, a 512 KB log is twenty thousand elements. Neither limit stands in for
 * the other.
 */
const MAX_DECORATED_CHARS = 512 * 1024;
export const MAX_DECORATED_LINES = 5000;

/**
 * A size limit is not a time limit. Several highlight.js grammars — `ini`,
 * which every `.toml`, `.conf`, `.env` and `.gitconfig` is read with, and
 * `javascript` and `rust` among others — are quadratic in the length of an
 * unbroken alphanumeric run. Measured with bare base64 under `ini`: 8 KiB
 * 351ms, 16 KiB 1.3s, 32 KiB 5.1s, 64 KiB 19s, 400 KiB twelve minutes. One
 * separator anywhere in the line makes it linear again, so every ordinary
 * file is cheap and only a run this long is not.
 */
const MAX_DECORATED_LINE_CHARS = 5000;

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
 * Teaching the backend's `classify` about `.dart` would move every `.dart`
 * file in every drive into the "document" bucket of a listing — a different
 * question from whether this component can render one.
 *
 * An allowlist, not a denylist: `.bin`, `.raw` and `a.out` have to stay
 * unreadable.
 */
const TEXT_SUFFIXES = new Set([
  "dart", "rs", "go", "kt", "kts", "swift", "rb", "php", "lua", "r",
  "c", "h", "cc", "cpp", "hpp", "cs", "java", "scala", "ex", "exs",
  "vue", "svelte", "ts", "tsx", "jsx", "mjs", "cjs", "mts", "cts",
  "js", "json", "css", "html", "xml",
  "toml", "ini", "cfg", "conf", "env", "properties", "yml", "yaml",
  "gradle", "cmake", "mk", "dockerfile", "gitignore", "editorconfig",
  "gitattributes", "gitmodules", "gitconfig", "dockerignore",
  "npmrc", "nvmrc", "prettierrc", "eslintrc", "babelrc", "browserslistrc",
  "sql", "graphql", "gql", "proto", "patch", "diff", "lock",
  "md", "markdown", "rst", "adoc", "tex", "csv", "tsv", "log",
  "py", "sh", "bash", "zsh", "tf", "tfvars",
]);

const TEXT_FILENAMES = new Set([
  "makefile", "dockerfile", "license", "licence", "readme", "changelog",
  "authors", "contributing", "notice", "copying", "codeowners", "procfile",
  "gemfile", "rakefile", "brewfile", "vagrantfile", "justfile",
]);

/**
 * `filename` is optional because the callers that pass a real file have a
 * mime worth trusting. A ZIP entry's mime is guessed from a name, and the
 * guess is `application/octet-stream` for anything the drive listing has no
 * bucket for.
 */
export function isTextPreviewable(mimeType: string, filename?: string): boolean {
  if (TEXT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    return true;
  }
  if (TEXT_MIME_EXACT.has(mimeType)) return true;
  if (filename === undefined) return false;

  const { base, token, fromDot } = fileNameParts(filename);
  if (TEXT_FILENAMES.has(base)) return true;
  if (token === null) return false;
  if (fromDot) return TEXT_SUFFIXES.has(token) || TEXT_FILENAMES.has(token);
  return TEXT_SUFFIXES.has(token);
}

interface Decorated {
  /** One entry per line, without its break. */
  lines: string[];
  /** Whether the entries are markup from highlight.js or the file's own text. */
  coloured: boolean;
  /** Whether the file's last line ends in a break. */
  trailingBreak: boolean;
}

function decorate(content: string, filename: string | undefined): Decorated | null {
  if (content.length > MAX_DECORATED_CHARS) return null;

  // Once, here, so both paths see the same breaks. The coloured path goes
  // through an HTML parse, which folds CR and CRLF to LF on its own; the
  // uncoloured one does not, so a file broken with bare CR would otherwise
  // come out as one line on one path and many on the other.
  const text = content.replace(/\r\n?/g, "\n");

  const plain = splitPlainLines(text);
  if (plain.length > MAX_DECORATED_LINES) return null;
  if (plain.some((line) => line.length > MAX_DECORATED_LINE_CHARS)) return null;

  const trailingBreak = text.endsWith("\n");
  const language = filename === undefined ? null : codeLanguageFor(filename);
  if (language === null) return { lines: plain, coloured: false, trailingBreak };

  const html = hljs.highlight(text, { language, ignoreIllegals: true }).value;
  return { lines: splitHighlightedLines(html), coloured: true, trailingBreak };
}

export function TextPreview({
  fileId,
  fileSize,
  filename,
  highlight,
  onDocumentCaptureController,
}: {
  fileId: string;
  fileSize: number;
  filename?: string;
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
  // `null` means the file is too large to decorate, and only that: an empty
  // string decorates to no lines, which is what an empty file should draw.
  const decorated = useMemo(
    () => decorate(content ?? "", filename),
    [content, filename],
  );

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

  const body = content ?? "";
  const preClass =
    "p-4 text-sm leading-relaxed text-text-primary font-mono whitespace-pre-wrap break-words";

  if (decorated === null) {
    return (
      <div className="w-full rounded-xl bg-bg-card">
        <p className="px-4 pt-4 text-sm text-text-muted">{t("tooLargeToDecorate")}</p>
        <pre ref={preRef} className={preClass}>
          {body}
        </pre>
      </div>
    );
  }

  const { lines, coloured, trailingBreak } = decorated;
  const withBreak = (i: number) => i < lines.length - 1 || trailingBreak;

  return (
    <div className="w-full rounded-xl bg-bg-card">
      <pre ref={preRef} className={`code-view ${preClass}`}>
        {lines.map((line, i) =>
          coloured ? (
            <span
              key={i}
              className="code-line"
              // highlight.js escapes the source before wrapping it. The
              // uncoloured branch below must not share this sink: there the
              // entry is the file's own bytes.
              dangerouslySetInnerHTML={{
                __html: withBreak(i) ? `${line}\n` : line,
              }}
            />
          ) : (
            <span key={i} className="code-line">
              {line}
              {withBreak(i) ? "\n" : ""}
            </span>
          ),
        )}
      </pre>
    </div>
  );
}
