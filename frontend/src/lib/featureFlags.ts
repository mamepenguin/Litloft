/**
 * Build-time feature flags. ``process.env.NEXT_PUBLIC_*`` is replaced
 * during the Next.js build, so reading these in Client Components is
 * safe and tree-shakeable.
 *
 * Tests can flip a flag via ``vi.stubEnv("NEXT_PUBLIC_X", "true")``
 * before the module under test reads ``import.meta.env`` /
 * ``process.env`` on render — the helpers below evaluate the env on
 * each call rather than caching at module load.
 */

function readBoolEnv(name: string): boolean {
  const raw = process.env[name];
  return raw === "true" || raw === "1";
}

/**
 * Phase 2 of the right-pane full-detail merger spec
 * (docs/superpowers/specs/2026-05-09-right-pane-full-detail.md §5).
 * When true, the Knowledge ``KnowledgeEditSection`` slot mounts the
 * editor inline inside ``FileDetailContent`` and the legacy Knowledge
 * route ``/addons/knowledge?edit={id}`` redirects to the canonical
 * 2-pane URL. Default false until PR-7 flips it.
 */
export function isInlineKnowledgeEditorEnabled(): boolean {
  return readBoolEnv("NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR");
}
