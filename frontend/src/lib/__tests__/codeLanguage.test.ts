import { describe, it, expect } from "vitest";
import hljs from "highlight.js";

import {
  codeLanguageFor,
  LANGUAGE_BY_NAME,
  LANGUAGE_BY_TOKEN,
} from "../codeLanguage";
import { isTextPreviewable } from "@/components/TextPreview";

const OPAQUE = "application/octet-stream";

describe("codeLanguageFor", () => {
  it.each([
    ["main.rs", "rust"],
    ["main.go", "go"],
    ["App.kt", "kotlin"],
    ["view.swift", "swift"],
    ["main.dart", "dart"],
    ["server.py", "python"],
    ["index.ts", "typescript"],
    ["Component.tsx", "typescript"],
    ["build.gradle", "groovy"],
    ["schema.sql", "sql"],
    ["config.yml", "yaml"],
    ["deploy.sh", "bash"],
  ])("reads %s as %s", (filename, language) => {
    expect(codeLanguageFor(filename)).toBe(language);
  });

  it.each([
    ["Makefile", "makefile"],
    ["Dockerfile", "dockerfile"],
    ["Gemfile", "ruby"],
    ["Rakefile", "ruby"],
  ])("reads the whole name %s as %s", (filename, language) => {
    expect(codeLanguageFor(filename)).toBe(language);
  });

  it("reads a dotfile by its leading segment", () => {
    expect(codeLanguageFor(".babelrc")).toBe("json");
    expect(codeLanguageFor(".eslintrc")).toBe("json");
    expect(codeLanguageFor(".gitconfig")).toBe("ini");
  });

  it("reads the extension, not the path around it", () => {
    expect(codeLanguageFor("deep/dir.rs/thing.py")).toBe("python");
    expect(codeLanguageFor("MAIN.RS")).toBe("rust");
  });

  it.each([
    ["notes.txt"],
    ["data.csv"],
    ["server.log"],
    ["LICENSE"],
    ["README"],
    ["pnpm-lock.yaml.lock"],
    ["Component.vue"],
    ["Component.svelte"],
    ["main.tf"],
    ["noextension"],
    [""],
  ])("returns null for %s rather than guessing", (filename) => {
    expect(codeLanguageFor(filename)).toBeNull();
  });

  it("maps every entry to a language the bundle carries", () => {
    // The tables themselves, not a list of names written here: a typo in an
    // entry nobody thought to spell out is exactly what this has to catch.
    const entries = [
      ...LANGUAGE_BY_NAME.entries(),
      ...LANGUAGE_BY_TOKEN.entries(),
    ];
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, language] of entries) {
      expect(hljs.getLanguage(language), `${key} -> ${language}`).toBeTruthy();
    }
  });

  it("maps only names the viewer agrees to render", () => {
    // Colour without content is the one combination that cannot happen. Both
    // tables are checked, because a key added to either one is a key this
    // function will answer for.
    for (const key of LANGUAGE_BY_NAME.keys()) {
      expect(isTextPreviewable(OPAQUE, key), key).toBe(true);
    }
    for (const key of LANGUAGE_BY_TOKEN.keys()) {
      expect(isTextPreviewable(OPAQUE, `sample.${key}`), key).toBe(true);
    }
  });

  it("never names a language for a file the viewer will not open", () => {
    for (const name of ["app.bin", "photo.raw", "a.out", ".DS_Store"]) {
      expect(isTextPreviewable(OPAQUE, name)).toBe(false);
      expect(codeLanguageFor(name)).toBeNull();
    }
  });
});
