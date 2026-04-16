"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MarkdownIt from "markdown-it";
// @ts-expect-error -- no bundled type definitions
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js";
import DOMPurify from "isomorphic-dompurify";
import matter from "gray-matter";
import { useTranslations } from "next-intl";
import { getStreamUrl } from "@/lib/api";

// Mermaid is loaded lazily (≈4 MB).  Initialize only once so that calling
// mermaid.initialize() on subsequent re-renders doesn't reset internal state.
let mermaidRenderCount = 0;
const getMermaid = (() => {
  let promise: Promise<typeof import("mermaid")["default"]> | null = null;
  return () => {
    if (!promise) {
      promise = import("mermaid").then(({ default: m }) => {
        m.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });
        return m;
      });
    }
    return promise;
  };
})();

function createMarkdownRenderer({ withMermaid }: { withMermaid: boolean }): MarkdownIt {
  const md = new MarkdownIt({
    html: false,       // Do not trust raw HTML embedded in markdown
    linkify: true,     // Auto-link plain URLs
    typographer: false,
    breaks: false,
  });

  md.use(taskLists, { enabled: true, label: true });

  const defaultLinkRender: NonNullable<typeof md.renderer.rules.link_open> =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
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

  // Mermaid blocks are only emitted as hydratable placeholders when the caller
  // opts in. Untrusted sources (e.g. LLM answers) run with withMermaid=false so
  // mermaid's securityLevel:"loose" click directives can't bypass DOMPurify via
  // post-sanitize SVG injection.
  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const lang = token.info.trim().split(/\s+/)[0] ?? "";

    if (withMermaid && lang === "mermaid") {
      const escaped = md.utils.escapeHtml(token.content);
      return `<pre class="mermaid-source">${escaped}</pre>\n`;
    }

    if (lang && hljs.getLanguage(lang)) {
      const highlighted = hljs.highlight(token.content, {
        language: lang,
        ignoreIllegals: true,
      }).value;
      return `<pre class="code-block"><code class="hljs language-${lang}">${highlighted}</code></pre>\n`;
    }

    const escaped = md.utils.escapeHtml(token.content);
    return `<pre class="code-block"><code class="hljs">${escaped}</code></pre>\n`;
  };

  return md;
}

const mdWithMermaid = createMarkdownRenderer({ withMermaid: true });
const mdPlain = createMarkdownRenderer({ withMermaid: false });

function renderMarkdownToSafeHtml(source: string, withMermaid: boolean): {
  frontmatter: Record<string, unknown>;
  html: string;
} {
  const parsed = matter(source);
  const md = withMermaid ? mdWithMermaid : mdPlain;
  const rawHtml = md.render(parsed.content);
  const safeHtml = DOMPurify.sanitize(rawHtml, {
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["onload", "onerror", "onclick", "onmouseover"],
    // Allow target on <a> because our renderer forces rel="noopener noreferrer"
    // alongside it, so there is no tabnabbing risk.
    ADD_ATTR: ["target", "checked", "disabled"],
  });
  return { frontmatter: parsed.data as Record<string, unknown>, html: safeHtml };
}

/**
 * Render markdown content as sanitized HTML with optional frontmatter
 * metadata. Used by FilePreview for `text/markdown` files and intended
 * for reuse by the knowledge addon's editor preview pane.
 *
 * - `chrome` (default true): wrap the body in a card (rounded/bg) and render
 *   the frontmatter panel. Set false when the parent already provides chrome
 *   (e.g. the Ask answer panel).
 * - `mermaid` (default true): process ```mermaid fences into rendered SVG
 *   diagrams. Disable for untrusted content — mermaid's securityLevel:"loose"
 *   click directives can bypass DOMPurify since mermaid injects SVG via
 *   innerHTML after the sanitizer runs.
 */
export function MarkdownPreview({
  source,
  showFrontmatter = true,
  chrome = true,
  mermaid = true,
  className,
}: {
  source: string;
  showFrontmatter?: boolean;
  chrome?: boolean;
  mermaid?: boolean;
  className?: string;
}) {
  const { frontmatter, html } = useMemo(
    () => renderMarkdownToSafeHtml(source, mermaid),
    [source, mermaid],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  // After every render, scan for any unprocessed mermaid placeholders and
  // replace them with rendered SVG.  We deliberately do NOT depend on [html]
  // because React may re-apply dangerouslySetInnerHTML when the parent
  // re-renders (e.g. a sibling toggle), wiping out previously-rendered SVG and
  // restoring the original <pre class="mermaid-source"> placeholders.  Running
  // on every render with an early-return when nothing is pending keeps the
  // preview correct without churning when nothing changed.  Mermaid itself is
  // loaded lazily (≈4 MB) and only initialized once via getMermaid().
  useEffect(() => {
    if (!mermaid) return;
    const container = containerRef.current;
    if (!container) return;

    const pendingEls = Array.from(
      container.querySelectorAll<HTMLPreElement>("pre.mermaid-source"),
    );
    if (pendingEls.length === 0) return;

    let active = true;

    getMermaid().then(async (mermaid) => {
      for (const el of pendingEls) {
        if (!active || !el.isConnected) continue;

        const src = el.textContent ?? "";
        const id = `mermaid-${++mermaidRenderCount}`;
        const wrapper = document.createElement("div");
        wrapper.className = "mermaid-diagram";
        try {
          const { svg } = await mermaid.render(id, src);
          if (!active || !el.isConnected) continue;
          wrapper.innerHTML = svg;
          el.replaceWith(wrapper);
        } catch (err) {
          if (!active || !el.isConnected) continue;
          const errEl = document.createElement("div");
          errEl.className = "mermaid-error";
          errEl.textContent = `Diagram error: ${err instanceof Error ? err.message : String(err)}`;
          el.replaceWith(errEl);
        }
      }
    });

    return () => {
      active = false;
    };
  });

  const frontmatterEntries = Object.entries(frontmatter);
  const bodyClass = `markdown-body ${
    chrome
      ? `overflow-auto px-6 py-4 text-sm leading-relaxed text-text-primary${className ? ` ${className}` : " max-h-[80vh]"}`
      : className ?? ""
  }`.trim();

  const body = (
    <div
      ref={containerRef}
      className={bodyClass}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );

  if (!chrome) {
    return body;
  }

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
      {body}
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
