/**
 * The helpers below evaluate the env on each call rather than caching at
 * module load, so tests can flip a flag with `vi.stubEnv`.
 */

function readBoolEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === "false" || raw === "0") return false;
  if (raw === "true" || raw === "1") return true;
  return defaultValue;
}

export function isInlineKnowledgeEditorEnabled(): boolean {
  return readBoolEnv("NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR", true);
}
