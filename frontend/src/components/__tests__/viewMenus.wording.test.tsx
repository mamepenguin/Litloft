/**
 * SPEC-CORE-146: the wording of the Video and Reading view menus in Japanese,
 * and the shared appView labels in both languages.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ja from "@/messages-core/ja.json";
import en from "@/messages-core/en.json";
import { writeAppPrefs } from "@/lib/appPrefs";
import { VideoApp } from "@/components/videoapp/VideoApp";
import { ReadingApp } from "@/components/readingapp/ReadingApp";

const DRIVE = "main";

vi.mock("next-intl", async () => {
  const messages = (await import("@/messages-core/ja.json")).default as Record<string, unknown>;
  const lookup = (path: string): unknown =>
    path.split(".").reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null ? (node as Record<string, unknown>)[part] : undefined,
      messages,
    );
  const useTranslations = (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
    const path = namespace === undefined ? key : `${namespace}.${key}`;
    const raw = lookup(path);
    let text = typeof raw === "string" ? raw : path;
    for (const [k, v] of Object.entries(values ?? {})) text = text.split(`{${k}}`).join(String(v));
    return text;
  };
  return {
    useTranslations,
    useLocale: () => "ja",
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/video",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({ nickname: "alice", setNickname: vi.fn(), clearNickname: vi.fn() }),
}));

vi.mock("@/components/AddonSlotsProvider", () => ({
  useAddonSlots: () => ({
    addons: {},
    catalogueDrive: "main",
    slots: {},
    loading: false,
    getSlotEntries: () => [],
    hasSlot: () => false,
  }),
  useAddonStatus: () => ({ features: {} }),
}));

const getShelves = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getDriveFiles: async () => ({ data: [], meta: { total: 0, page: 1, limit: 12 } }),
  getSmartFolders: async () => [],
  getCollections: async () => [],
  getDriveTags: async () => [],
}));

type Tree = { [key: string]: string | Tree };

function strings(tree: Tree, prefix = ""): Array<[string, string]> {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [[`${prefix}${k}`, v] as [string, string]] : strings(v, `${prefix}${k}.`),
  );
}

const RETIRED = ["まとめ方", "並べ替え", "分類の軸", "タグ別", "まとめない", "クリップした順", "最後に開いた順", "追加した月"];

beforeEach(() => {
  localStorage.clear();
  getShelves.mockReset().mockImplementation(async (_d: string, p: Record<string, unknown>) => ({
    by: p.by,
    base: "",
    total_shelves: 1,
    shelves: [{ key: "all", label: "Shelf", count: 1, items: [] }],
  }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function optionsOf(label: RegExp): Promise<string[]> {
  const button = await waitFor(() => screen.getByRole("button", { name: label }));
  fireEvent.click(button);
  const options = await screen.findAllByRole("menuitemradio");
  const texts = options.map((o) => o.textContent?.trim() ?? "");
  fireEvent.keyDown(button, { key: "Escape" });
  return texts;
}

describe("SPEC-CORE-146 the shared view menu labels", () => {
  it("SPEC-CORE-146 appView names the menus 分類 / Group By and 並び順 / Sort By", () => {
    expect((ja as unknown as { appView: Record<string, string> }).appView).toMatchObject({ groupBy: "分類", sortBy: "並び順" });
    expect((en as unknown as { appView: Record<string, string> }).appView).toMatchObject({
      groupBy: "Group By",
      sortBy: "Sort By",
    });
  });

  it.each(["videoApp", "readingApp", "appView"])("SPEC-CORE-146 I9 no %s message uses retired wording", (ns) => {
    const tree = (ja as unknown as Tree)[ns];
    expect(tree).toBeDefined();
    const offending = strings(tree as Tree).filter(([, v]) => RETIRED.some((w) => v.includes(w)));
    expect(offending).toEqual([]);
  });
});

describe("SPEC-CORE-146 I9 the Video Library in Japanese", () => {
  it("SPEC-CORE-146 the menus read 分類 and 並び順, with the new option names", async () => {
    writeAppPrefs(DRIVE, { face: "library" });
    render(<VideoApp drive={DRIVE} />);

    expect(await optionsOf(/分類/)).toEqual(["フォルダ", "タグ", "追加日", "長さ", "視聴状態", "なし"]);
    const sort = await optionsOf(/並び順/);
    expect(sort).toContain("追加日（新しい順）");
    expect(sort).toContain("追加日（古い順）");
    expect(screen.getByRole("button", { name: /分類/ })).toHaveTextContent("分類");
    expect(screen.getByRole("button", { name: /並び順/ })).toHaveTextContent("並び順");
    for (const word of RETIRED) expect(document.body.textContent).not.toContain(word);
  });
});

describe("SPEC-CORE-146 I9 the Reading Library in Japanese", () => {
  it("SPEC-CORE-146 the menus read 分類 and 並び順, with the new option names", async () => {
    writeAppPrefs(DRIVE, { face: "library" }, "reading");
    render(<ReadingApp drive={DRIVE} />);

    expect(await optionsOf(/分類/)).toEqual(["タグ", "フォルダ", "追加日", "なし"]);
    const sort = await optionsOf(/並び順/);
    expect(sort).toContain("追加日（新しい順）");
    expect(sort).toContain("追加日（古い順）");
    for (const word of RETIRED) expect(document.body.textContent).not.toContain(word);
  });
});
