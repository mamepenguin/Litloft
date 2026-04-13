"use client";

import { useEffect, useMemo, useState } from "react";
import MarkdownIt from "markdown-it";
import DOMPurify from "isomorphic-dompurify";
import matter from "gray-matter";
import { useTranslations } from "next-intl";
import { getStreamUrl } from "@/lib/api";

const md = new MarkdownIt({
  html: false,       // Do not trust raw HTML embedded in markdown
  linkify: true,     // Auto-link plain URLs
  typographer: false,
  breaks: false,
});

// Force safe link attributes. Markdown-it fires a "link_open" renderer hook,
// which we extend to enforce target=_blank + rel=noopener noreferrer and
// reject javascript: / data: URIs at render time (defense in depth; DOMPurify
// also filters these).
const defaultLinkRender =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const href = token.attrGet("href") ?? "";
  const lower = href.trim().toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:")) {
    token.attrSet("href", "#");
  }
  token.attrSet("target", "_blank");
  token.attrSet("rel", "noopener noreferrer");
  return defaultLinkRender(tokens, idx, options, env, self);
};

function renderMarkdownToSafeHtml(source: string): {
  frontmatter: Record<string, unknown>;
  html: string;
} {
  const parsed = matter(source);
  const rawHtml = md.render(parsed.content);
  const safeHtml = DOMPurify.sanitize(rawHtml, {
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["onload", "onerror", "onclick", "onmouseover"],
    // Allow target on <a> because our renderer forces rel="noopener noreferrer"
    // alongside it, so there is no tabnabbing risk.
    ADD_ATTR: ["target"],
  });
  return { frontmatter: parsed.data as Record<string, unknown>, html: safeHtml };
}

/**
 * Render markdown content as sanitized HTML with optional frontmatter
 * metadata. Used by FilePreview for `text/markdown` files and intended
 * for reuse by the knowledge addon's editor preview pane.
 */
export function MarkdownPreview({
  source,
  showFrontmatter = true,
}: {
  source: string;
  showFrontmatter?: boolean;
}) {
  const { frontmatter, html } = useMemo(
    () => renderMarkdownToSafeHtml(source),
    [source],
  );

  const frontmatterEntries = Object.entries(frontmatter);

  return (
    <div className="w-full overflow-hidden rounded-xl bg-bg-card">
      {showFrontmatter && frontmatterEntries.length > 0 && (
        <div className="border-b border-bg-border bg-bg-elevated px-4 py-3 text-xs">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {frontmatterEntries.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-text-muted">{key}</dt>
                <dd className="text-text-primary break-anywhere">
                  {typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <div
        className="markdown-body max-h-[80vh] overflow-auto px-6 py-4 text-sm leading-relaxed text-text-primary"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

/**
 * Fetch-and-render wrapper for use in FilePreview. Loads the file content
 * then pipes it through MarkdownPreview.
 */
export function MarkdownFileViewer({ fileId }: { fileId: string }) {
  const t = useTranslations("text");
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(getStreamUrl(fileId), { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setSource(text);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (error) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-bg-card py-16">
        <p className="text-sm text-red-400">{t("loadFailed", { error })}</p>
      </div>
    );
  }

  if (source === null) {
    return (
      <div className="flex w-full items-center justify-center rounded-xl bg-bg-card py-16">
        <p className="text-sm text-text-muted">{t("loading")}</p>
      </div>
    );
  }

  return <MarkdownPreview source={source} />;
}
