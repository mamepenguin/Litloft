import { afterEach, describe, expect, it, vi } from "vitest";

import { isInlineKnowledgeEditorEnabled } from "../featureFlags";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isInlineKnowledgeEditorEnabled", () => {
  it("returns false when the env var is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR", "");
    expect(isInlineKnowledgeEditorEnabled()).toBe(false);
  });

  it("returns true for the literal 'true' string", () => {
    vi.stubEnv("NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR", "true");
    expect(isInlineKnowledgeEditorEnabled()).toBe(true);
  });

  it("returns true for '1' as a convenience alias", () => {
    vi.stubEnv("NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR", "1");
    expect(isInlineKnowledgeEditorEnabled()).toBe(true);
  });

  it("returns false for any other value (e.g. 'false', 'yes')", () => {
    vi.stubEnv("NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR", "false");
    expect(isInlineKnowledgeEditorEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR", "yes");
    expect(isInlineKnowledgeEditorEnabled()).toBe(false);
  });
});
