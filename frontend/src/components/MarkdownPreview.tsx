"use client";

import { useEffect, useMemo, useRef } from "react";
import { useHighlightPassage } from "@/hooks/useHighlightPassage";
import MarkdownIt from "markdown-it";
// @ts-expect-error -- no bundled type definitions
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js";
import DOMPurify from "isomorphic-dompurify";
import matter from "gray-matter";
import { type WikiResolveResult } from "@/lib/api";
import { PropertiesPanel } from "@/components/PropertiesPanel";

export type { WikiResolveResult };

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

/**
 * Render a single wiki-link to a safe HTML string.
 *
 * The display text is HTML-escaped through markdown-it's own escapeHtml
 * (which DOMPurify would also catch later, but escaping at emission
 * time keeps the sanitizer's job simple and avoids relying on it for
 * correctness). data-wiki-target carries the *raw* target so consumers
 * (the Knowledge unresolved-link click handler) can identify the link
 * regardless of how the user customised its display text.
 */
function renderWikiLinkHtml({
  md,
  target,
  displayText,
  resolution,
}: {
  md: MarkdownIt;
  target: string;
  displayText: string;
  resolution: WikiResolveResult | undefined;
}): string {
  const safeDisplay = md.utils.escapeHtml(displayText);
  const safeTarget = md.utils.escapeHtml(target);
  if (resolution && resolution.kind === "resolved") {
    const safeId = md.utils.escapeHtml(resolution.file_id);
    return (
      `<a class="wiki-link wiki-resolved" ` +
      `href="/files/${safeId}" ` +
      `data-wiki-target="${safeTarget}">` +
      `${safeDisplay}</a>`
    );
  }
  if (resolution && resolution.kind === "ambiguous") {
    const count = resolution.candidates?.length ?? 0;
    const safeTitle = md.utils.escapeHtml(
      `ambiguous link: ${count} matches`,
    );
    return (
      `<span class="wiki-link wiki-ambiguous" ` +
      `data-wiki-target="${safeTarget}" ` +
      `title="${safeTitle}">${safeDisplay}</span>`
    );
  }
  // Default: unresolved (also covers the "no map" / "key absent" cases).
  return (
    `<span class="wiki-link wiki-unresolved" ` +
    `data-wiki-target="${safeTarget}">${safeDisplay}</span>`
  );
}

function createMarkdownRenderer({ withMermaid }: { withMermaid: boolean }): MarkdownIt {
  const md = new MarkdownIt({
    html: false,       // Do not trust raw HTML embedded in markdown
    linkify: true,     // Auto-link plain URLs
    typographer: false,
    breaks: false,
  });

  md.use(taskLists, { enabled: true, label: true });

  // Wiki-link inline rule. Spec 2026-05-12 §3.8.
  //
  // Detects ``[[X]]`` / ``[[X|display]]`` / ``[[X#heading]]`` at the
  // current source position and emits either:
  //   - resolved   -> <a class="wiki-link wiki-resolved" ...>
  //   - unresolved -> <span class="wiki-link wiki-unresolved" ...>
  //   - ambiguous  -> <span class="wiki-link wiki-ambiguous" ...>
  //
  // The resolution map flows through ``env.wikiResolution``; when it is
  // missing (or the target is absent) we render the pessimistic
  // ``unresolved`` form so the UI never briefly flashes "resolved" while
  // the resolutions request is still in flight.
  //
  // Registered ``before("link", ...)`` so the bracketed pair is consumed
  // before linkify gets a chance to auto-link the inner text (a payload
  // like ``[[example.com]]`` would otherwise become a clickable external
  // link).
  md.inline.ruler.before("link", "wiki_link", (state, silent) => {
    const src = state.src;
    const start = state.pos;
    if (src.charCodeAt(start) !== 0x5b /* [ */) return false;
    if (src.charCodeAt(start + 1) !== 0x5b /* [ */) return false;

    // Find the closing ``]]``; bail if absent within this line.
    const max = state.posMax;
    let end = -1;
    for (let i = start + 2; i < max - 1; i++) {
      const ch = src.charCodeAt(i);
      // Stop at newlines — wiki-links don't span lines, matching
      // Obsidian / Foam behaviour.
      if (ch === 0x0a) return false;
      if (ch === 0x5d && src.charCodeAt(i + 1) === 0x5d) {
        end = i;
        break;
      }
    }
    if (end < 0) return false;

    const inner = src.slice(start + 2, end);
    // Empty ``[[]]`` is not a wiki-link.
    if (inner.length === 0) return false;
    // ``]`` or ``[`` inside the inner text means the parser ran off
    // the rails (nested brackets); bail so markdown-it's standard link
    // pass can deal with it.
    if (inner.indexOf("[") >= 0) return false;

    // Pull out optional display / heading suffix.
    // ``[[target|display]]`` -> target, displayOverride
    // ``[[target#heading]]`` -> target, "target#heading" (display)
    // ``[[target#heading|display]]`` -> target, displayOverride
    let target = inner;
    let display: string | null = null;
    const pipeIdx = inner.indexOf("|");
    if (pipeIdx >= 0) {
      target = inner.slice(0, pipeIdx);
      display = inner.slice(pipeIdx + 1);
    }
    const hashIdx = target.indexOf("#");
    let headingSuffix = "";
    if (hashIdx >= 0) {
      headingSuffix = target.slice(hashIdx);
      target = target.slice(0, hashIdx);
    }
    target = target.trim();
    if (target.length === 0) return false;

    if (!silent) {
      const env = state.env as
        | { wikiResolution?: Record<string, WikiResolveResult> }
        | undefined;
      const resolution: WikiResolveResult | undefined =
        env?.wikiResolution?.[target];

      // Display precedence:
      //   1. Explicit ``|display`` alias from the source.
      //   2. ``target`` + heading suffix when the user wrote ``[[X#h]]``.
      //   3. For id-form resolved targets (``[[20260512143028]]``), the
      //      resolved file's basename — keeps the rendered preview
      //      readable instead of showing an opaque timestamp.
      //   4. Fall back to the raw target.
      const isIdForm = /^\d{12,17}$/.test(target);
      const resolvedBasename =
        resolution && resolution.kind === "resolved"
          ? resolution.basename
          : undefined;
      const displayText =
        display !== null
          ? display
          : headingSuffix
            ? `${target}${headingSuffix}`
            : isIdForm && resolvedBasename
              ? resolvedBasename
              : target;

      const token = state.push("html_inline", "", 0);
      token.content = renderWikiLinkHtml({
        md,
        target,
        displayText,
        resolution,
      });
    }

    state.pos = end + 2;
    return true;
  });

  const defaultLinkRender: NonNullable<typeof md.renderer.rules.link_open> =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const href = token.attrGet("href") ?? "";
    const lower = href.trim().toLowerCase();

    // loft://file_id[?params] — resolve to the internal file detail URL.
    // file_ids are globally unique so no drive context is needed.
    // Validate file_id matches the backend 12-char pattern to prevent
    // path traversal (e.g. loft://../../admin becoming /files/../../admin).
    if (lower.startsWith("loft://")) {
      const rest = href.slice("loft://".length);
      const qIdx = rest.indexOf("?");
      const fileId = qIdx >= 0 ? rest.slice(0, qIdx) : rest;
      if (!/^[A-Za-z0-9_-]{12}$/.test(fileId)) {
        token.attrSet("href", "#");
        return defaultLinkRender(tokens, idx, options, env, self);
      }
      // Whitelist query string to t= and page= params only.
      const rawQs = qIdx >= 0 ? rest.slice(qIdx) : "";
      const safeQs = rawQs.replace(/[^?&=A-Za-z0-9_.\-]/g, "");
      const resolved = `/files/${fileId}${safeQs}`;
      token.attrSet("href", resolved);
      token.attrSet("target", "_self");
      token.attrSet("rel", "");
      return defaultLinkRender(tokens, idx, options, env, self);
    }

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

function renderMarkdownToSafeHtml(
  source: string,
  withMermaid: boolean,
  _drive?: string,
  wikiResolution?: Record<string, WikiResolveResult>,
): {
  frontmatter: Record<string, unknown>;
  html: string;
} {
  const parsed = matter(source);
  const md = withMermaid ? mdWithMermaid : mdPlain;
  // ``wikiResolution`` rides on the env object so the inline rule can
  // pick it up without a module-level singleton (which would race on
  // concurrent renders).
  const env: { wikiResolution?: Record<string, WikiResolveResult> } = {};
  if (wikiResolution) env.wikiResolution = wikiResolution;
  const rawHtml = md.render(parsed.content, env);
  const safeHtml = DOMPurify.sanitize(rawHtml, {
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["onload", "onerror", "onclick", "onmouseover"],
    // Allow target on <a> because our renderer forces rel="noopener noreferrer"
    // alongside it, so there is no tabnabbing risk.
    ADD_ATTR: ["target", "checked", "disabled", "data-wiki-target"],
  });
  return { frontmatter: parsed.data as Record<string, unknown>, html: safeHtml };
}

/**
 * Render markdown content as sanitized HTML with optional frontmatter
 * metadata. Used by FilePreview for `text/markdown` files and intended
 * for reuse by the knowledge addon's editor preview pane.
 *
 * - `chrome` (default true): wrap the body in a card (rounded-lg/bg) and render
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
  drive,
  editable,
  onTagsChange,
  onTagsSaved,
  onSourceChange,
  highlight,
  wikiResolution,
}: {
  source: string;
  showFrontmatter?: boolean;
  chrome?: boolean;
  mermaid?: boolean;
  className?: string;
  /**
   * Wiki-link resolution map from the caller. Each key is the raw
   * target text of a ``[[X]]`` (without ``|display`` / ``#heading``
   * suffix); each value tells the renderer whether the target resolved
   * to a single file, none, or multiple. When omitted (or a target is
   * absent), the renderer emits the pessimistic "unresolved" form so
   * the UI never flashes a brief "resolved -> unresolved" while the
   * server fetch is in flight. Spec 2026-05-12 §3.8.
   */
  wikiResolution?: Record<string, WikiResolveResult>;
  /**
   * Drive name used to resolve ``loft://file_id`` internal file links.
   * Required for Knowledge editor preview; optional elsewhere.
   */
  drive?: string;
  /**
   * When provided, the frontmatter's ``tags`` row renders as an
   * editable chip group (spec §D4). The caller must refetch
   * ``source`` after a successful save to see the new frontmatter;
   * the component itself does not mutate ``source`` unless
   * ``onSourceChange`` is also provided (content mode).
   */
  editable?: {
    id: string;
    mime_type: string;
    filename: string;
    drive: string;
  };
  onTagsChange?: (tags: string[]) => void;
  /**
   * Fires after the standalone-mode debounced save lands. Intended
   * for the file-detail page to refetch its own ``file.tags`` and
   * bump its source reload key so both chip rows on the page stay in
   * sync with the backend's projection.
   */
  onTagsSaved?: (tags: string[]) => void;
  /**
   * Content-mode opt-in: when provided together with ``editable``,
   * chip edits rewrite ``source`` in-place via ``withTags`` and flow
   * the new string back through this callback. The Properties Panel
   * becomes a write-through editor on the parent's content state
   * (used by Knowledge editor to avoid a second writer racing its
   * own textarea auto-save). Without this, chip edits use the
   * standalone debounced save path.
   */
  onSourceChange?: (nextSource: string) => void;
  /**
   * Optional passage to scroll-and-highlight after render, used by
   * intelligence Ask citation cards. The hook locates the quote in
   * the rendered DOM (whitespace-tolerant) and wraps the first match
   * in a `<mark class="ask-citation-highlight">`. No-op when the
   * quote is absent or cannot be located.
   */
  highlight?: string;
}) {
  const { frontmatter, html } = useMemo(
    () => renderMarkdownToSafeHtml(source, mermaid, drive, wikiResolution),
    [source, mermaid, drive, wikiResolution],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  // The hook is wired to the rendered body. It runs after the html
  // is set, and re-runs when source or highlight changes.
  useHighlightPassage(containerRef, highlight, html.length > 0);

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

  // chrome mode renders the file detail Markdown viewer, the Ask
  // answer panel, and the knowledge editor preview. We deliberately
  // *do not* clamp the body with `max-h-[80vh] overflow-auto` here —
  // having a nested scroll container inside the page broke citation
  // jump (the highlight target was inside an off-screen scroll
  // viewport that the page-level scroll could not reach). Letting the
  // page itself scroll keeps `scrollIntoView` deterministic and
  // matches how PDF / text previews now behave.
  const bodyClass = `markdown-body ${
    chrome
      ? `mx-auto max-w-[860px] px-6 py-6 text-base leading-relaxed text-text-primary${className ? ` ${className}` : ""}`
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
      {showFrontmatter && (
        <div className="bg-bg-card px-4 pt-4 pb-4">
          <PropertiesPanel
            frontmatter={frontmatter}
            editable={editable}
            onTagsChange={onTagsChange}
            onTagsSaved={onTagsSaved}
            source={onSourceChange ? source : undefined}
            onSourceChange={onSourceChange}
          />
        </div>
      )}
      {body}
    </div>
  );
}

// MarkdownFileViewer is re-exported from a sibling module so it isn't
// loaded as a transitive dependency of MarkdownPreview.tsx itself —
// keeps Vitest mocks of this module clean (see file header of
// MarkdownFileViewer.tsx for the full rationale).
export { MarkdownFileViewer } from "@/components/MarkdownFileViewer";
