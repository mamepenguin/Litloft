import { afterEach, describe, expect, it, vi } from "vitest";

import { isInlineKnowledgeEditorEnabled } from "../featureFlags";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isInlineKnowledgeEditorEnabled", () => {
  it("defaults to true when the env var is unset (PR-7 ship default)", () => {
    vi.stubEnv("NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR", "");
    expect(isInlineKnowledgeEditorEnabled()).toBe(true);
  });

  it("returns true for the literal 'true' string", () => {
    vi.stubEnv("NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR", "true");
    expect(isInlineKnowledgeEditorEnabled()).toBe(true);
  });

  it("returns true for '1' as a convenience alias", () => {
    vi.stubEnv("NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR", "1");
    expect(isInlineKnowledgeEditorEnabled()).toBe(true);
  });

  it("returns false for the explicit opt-out 'false'", () => {
    vi.stubEnv("NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR", "false");
    expect(isInlineKnowledgeEditorEnabled()).toBe(false);
  });

  it("returns false for the explicit opt-out '0'", () => {
    vi.stubEnv("NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR", "0");
    expect(isInlineKnowledgeEditorEnabled()).toBe(false);
  });

  it("falls through to the default for ambiguous values (e.g. 'yes')", () => {
    vi.stubEnv("NEXT_PUBLIC_INLINE_KNOWLEDGE_EDITOR", "yes");
    expect(isInlineKnowledgeEditorEnabled()).toBe(true);
  });
});
