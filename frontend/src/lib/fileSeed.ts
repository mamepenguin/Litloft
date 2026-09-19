import type { FileItem } from "@/types";

/**
 * The last copy of each file a list handed us, so opening a file can draw
 * it before its own request answers. A seed is only ever a first frame:
 * the detail view replaces it with the fetched file and writes nothing
 * built from it.
 */

export const FILE_SEED_LIMIT = 500;

const seeds = new Map<string, FileItem>();

export function seedFiles(items: readonly FileItem[] | undefined): void {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    seeds.delete(item.id);
    seeds.set(item.id, item);
  }
  while (seeds.size > FILE_SEED_LIMIT) {
    const oldest = seeds.keys().next().value as string;
    seeds.delete(oldest);
  }
}

export function peekFileSeed(id: string): FileItem | null {
  return seeds.get(id) ?? null;
}

export function _resetFileSeedForTests(): void {
  seeds.clear();
}
