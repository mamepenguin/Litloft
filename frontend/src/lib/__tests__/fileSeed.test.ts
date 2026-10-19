import { afterEach, describe, expect, it } from "vitest";

import {
  FILE_SEED_LIMIT,
  _resetFileSeedForTests,
  peekFileSeed,
  seedFiles,
} from "@/lib/fileSeed";
import type { FileItem } from "@/types";

function file(id: string, title = id): FileItem {
  return { id, title } as FileItem;
}

afterEach(() => {
  _resetFileSeedForTests();
});

describe("fileSeed", () => {
  it("returns null for a file no list has delivered", () => {
    expect(peekFileSeed("nope")).toBeNull();
  });

  it("returns the item a list delivered", () => {
    seedFiles([file("a"), file("b")]);
    expect(peekFileSeed("b")?.title).toBe("b");
  });

  it("keeps the most recent copy of a file", () => {
    seedFiles([file("a", "old")]);
    seedFiles([file("a", "new")]);
    expect(peekFileSeed("a")?.title).toBe("new");
  });

  it("drops the least recently delivered file past the limit", () => {
    seedFiles([file("first")]);
    seedFiles(
      Array.from({ length: FILE_SEED_LIMIT }, (_, i) => file(`f${i}`)),
    );
    expect(peekFileSeed("first")).toBeNull();
    expect(peekFileSeed("f0")).not.toBeNull();
    expect(peekFileSeed(`f${FILE_SEED_LIMIT - 1}`)).not.toBeNull();
  });

  it("a redelivered file is not the next one dropped", () => {
    seedFiles(
      Array.from({ length: FILE_SEED_LIMIT }, (_, i) => file(`f${i}`)),
    );
    seedFiles([file("f0")]);
    seedFiles([file("extra")]);
    expect(peekFileSeed("f0")).not.toBeNull();
    expect(peekFileSeed("f1")).toBeNull();
  });
});

describe("seedFiles on a malformed answer", () => {
  it("does nothing rather than failing the listing that called it", () => {
    expect(() => seedFiles(undefined)).not.toThrow();
  });
});
