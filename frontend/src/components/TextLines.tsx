"use client";

import { useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import hljs from "highlight.js";
import { useHighlightPassage } from "@/hooks/useHighlightPassage";
import { codeLanguageFor } from "@/lib/codeLanguage";
import { splitHighlightedLines, splitPlainLines } from "@/lib/codeLines";
import { useDocumentCapturePublisher } from "@/hooks/useDocumentCapturePublisher";
import type { DocumentCaptureController } from "@/lib/documentCapture";

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

interface Decorated {
  /** The file with CR and CRLF folded to LF. What every path draws. */
  text: string;
  /** One entry per line, without its break; `null` when too large. */
  lines: string[] | null;
  /** Whether the entries are markup from highlight.js or the file's own text. */
  coloured: boolean;
  /** Whether the file's last line ends in a break. */
  trailingBreak: boolean;
}

function decorate(content: string, filename: string | undefined): Decorated {
  // Once, here, so every path draws the same thing. The coloured path goes
  // through an HTML parse, which folds CR and CRLF to LF on its own; nothing
  // else does, so a file broken with bare CR would otherwise come out as one
  // line on one path and many on another.
  const text = content.replace(/\r\n?/g, "\n");
  const trailingBreak = text.endsWith("\n");
  const tooLarge = { text, lines: null, coloured: false, trailingBreak };

  if (text.length > MAX_DECORATED_CHARS) return tooLarge;

  const plain = splitPlainLines(text);
  if (plain.length > MAX_DECORATED_LINES) return tooLarge;
  if (plain.some((line) => line.length > MAX_DECORATED_LINE_CHARS)) return tooLarge;

  const language = filename === undefined ? null : codeLanguageFor(filename);
  if (language === null) return { text, lines: plain, coloured: false, trailingBreak };

  const html = hljs.highlight(text, { language, ignoreIllegals: true }).value;
  return {
    text,
    lines: splitHighlightedLines(html),
    coloured: true,
    trailingBreak,
  };
}

export function TextLines({
  text: content,
  filename,
  highlight,
  onDocumentCaptureController,
}: {
  text: string;
  filename?: string;
  highlight?: string;
  onDocumentCaptureController?: (
    controller: DocumentCaptureController | null,
  ) => void;
}) {
  const t = useTranslations("text");
  const preRef = useRef<HTMLPreElement>(null);
  useDocumentCapturePublisher(preRef, onDocumentCaptureController);
  useHighlightPassage(preRef, highlight, true);
  const decorated = useMemo(
    () => decorate(content, filename),
    [content, filename],
  );

  const preClass =
    "p-4 text-sm leading-relaxed text-text-primary font-mono whitespace-pre-wrap break-words";

  const { text, lines, coloured, trailingBreak } = decorated;

  if (lines === null) {
    return (
      <div className="w-full rounded-xl bg-bg-card">
        <p className="px-4 pt-4 text-sm text-text-muted">{t("tooLargeToDecorate")}</p>
        <pre ref={preRef} className={preClass}>
          {text}
        </pre>
      </div>
    );
  }

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
