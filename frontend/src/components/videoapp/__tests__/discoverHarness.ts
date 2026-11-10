import { act } from "@testing-library/react";
import { vi } from "vitest";

export type Entry = {
  id: string;
  label: string;
  priority: number;
  addonName: string;
  href?: string;
  i18n_key?: string;
};
export type Restrict = (ids: string[]) => Promise<string[]>;
export type ProviderArgs = { drive: string; limit: number; restrict: Restrict };
export type Provider = (args: ProviderArgs) => Promise<string[]>;
export type Params = Record<string, unknown>;

export const PICKUP: Entry = { id: "pickup", label: "Pickup", priority: 10, addonName: "intelligence" };
export const SHELF_A: Entry = { id: "shelf-a", label: "Shelf Alpha", priority: 10, addonName: "media_import" };
export const SHELF_B: Entry = { id: "shelf-b", label: "Shelf Beta", priority: 20, addonName: "media_import" };

export const SKELETON = "SKELETON";
const SHELF_TITLES = new Set(["Continue", "Recommended", "New", "Shelf Alpha", "Shelf Beta"]);

export const title = (id: string) => `Vid ${id}`;

let drives = 0;
/** A drive no earlier case used, so the tab-lifetime store cannot carry an entry between cases. */
export function freshDrive(): string {
  drives += 1;
  return `drive-${drives}`;
}

export function item(id: string, name: string, drive = "d") {
  return {
    id,
    filename: `${name}.mp4`,
    title: name,
    description: "",
    drive,
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: true,
    file_size: 1,
    duration: 120,
    image_width: null,
    image_height: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

/** Answers in the reverse of the order it was asked, so only a client that re-orders keeps the stored order. */
export function restrictAnswer(p: Params, unmatched: Set<string>) {
  const ids = (p.ids as string[]).filter((id) => !unmatched.has(id));
  const items = ids.map((id) => item(id, title(id))).reverse();
  return { by: "all", total_shelves: 1, base: "", shelves: [{ key: "all", label: "", count: items.length, items }] };
}

export const continueAnswer = (items: unknown[]) => ({
  by: "watch",
  total_shelves: 1,
  base: "",
  shelves: [{ key: "continue", label: "", count: items.length, items }],
});

export const filesAnswer = (items: unknown[]) => ({
  data: items,
  meta: { total: items.length, page: 1, limit: 12 },
});

export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export const never = <T>() => new Promise<T>(() => {});

export function restricting(ids: string[]) {
  return vi.fn<Provider>(async ({ restrict }) => restrict(ids));
}

/** A provider that never answers and never restricts, so every restrict request seen is a rebuild. */
export function silent() {
  return vi.fn<Provider>(() => never<string[]>());
}

/**
 * Lets promises, module loads and the scheduler run without moving the fake clock.
 * `setImmediate` is left real, so a dynamic import or a mocked request can finish.
 */
export async function flush(rounds = 20) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((r) => setImmediate(r));
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

export async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await flush();
}

export function useFakeClock() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
}

/**
 * The Discover shelves in document order: a shelf by its title, with " (loading)" while its own
 * skeleton grid shows, and an untitled skeleton shelf as SKELETON.
 */
export function layout(root: ParentNode = document): string[] {
  return [...root.querySelectorAll("section")]
    .filter((section) => section.querySelector("section") === null)
    .flatMap((section) => {
      const heading = section.querySelector("h1, h2, h3, h4, h5, h6");
      const name = heading?.textContent?.trim() ?? "";
      const pulsing = section.querySelector(".animate-pulse") !== null;
      if (!name) return pulsing ? [SKELETON] : [];
      if (!SHELF_TITLES.has(name)) return [];
      return [pulsing ? `${name} (loading)` : name];
    });
}

/** Video titles inside the shelf with the given heading. */
export function shelfCards(heading: string): string[] {
  const section = [...document.querySelectorAll("section")].find(
    (s) => s.querySelector("h1, h2, h3, h4, h5, h6")?.textContent?.trim() === heading,
  );
  if (!section) return [];
  return [...section.querySelectorAll("li")]
    .map((li) => li.textContent ?? "")
    .map((text) => text.match(/Vid [\w-]+|Resume me|Newest one/)?.[0] ?? "")
    .filter(Boolean);
}
