import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SELF = fileURLToPath(import.meta.url);

const ADDONS_DIR = resolve(REPO_ROOT, "addons");
const SOURCE_ROOTS = [
  "frontend/src",
  ...(existsSync(ADDONS_DIR)
    ? readdirSync(ADDONS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `addons/${e.name}/frontend`)
    : []),
];
const ADDON_LINK_DIR = resolve(REPO_ROOT, "frontend/src/addons");

const HEADING_CLASSES = "flex items-center gap-2 text-lg font-bold text-text-primary";

/**
 * Matched only when the glyph immediately precedes the `<h3>`, so a card whose
 * glyph sits behind a wrapper (cloud-sync's `SyncDriveCard`) is not seen: its
 * `0` below is a limit of this scan, not a fact about that addon.
 */
const CARD_HEADING_CLASSES = "text-sm font-semibold text-text-primary";
const CARD_ICON_SIZE = 18;

const SECTION_COMPONENTS = ["CarouselSection", "ContinueWatchingSection"];

const DRIVE_HOME_GLYPHS = existsSync(
  resolve(REPO_ROOT, "addons/intelligence/frontend"),
)
  ? 6
  : 5;

const REQUIRED_COLOUR = "text-text-muted";
const REQUIRED_SIZE = 20;

function sourceFiles(root: string): string[] {
  const abs = resolve(REPO_ROOT, root);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    if (dir === ADDON_LINK_DIR) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx$/.test(entry.name) && full !== SELF) out.push(full);
    }
  };
  walk(abs);
  return out;
}

interface HeadingIcon {
  glyph: string;
  size: number | null;
  colour: string | null;
  where: string;
  level: "section" | "card";
}

function iconsIn(body: string): { glyph: string; size: number | null; colour: string | null; at: number }[] {
  const found: { glyph: string; size: number | null; colour: string | null; at: number }[] = [];
  for (const m of body.matchAll(/<([A-Z][A-Za-z0-9]*)\s([^<>]*?)\/>/g)) {
    const attrs = m[2];
    const size = /\bsize=\{(\d+)\}/.exec(attrs);
    if (!size) continue;
    const colour = /\bclassName="([^"]*)"/.exec(attrs);
    found.push({
      glyph: m[1],
      size: Number(size[1]),
      colour: colour ? colour[1] : null,
      at: m.index!,
    });
  }
  return found;
}

function headingIcons(): HeadingIcon[] {
  const out: HeadingIcon[] = [];
  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, "utf-8");
      const rel = relative(REPO_ROOT, file);
      const lineOf = (at: number) => text.slice(0, at).split("\n").length;

      for (const m of text.matchAll(new RegExp(`<h2[^>]*${HEADING_CLASSES}[^>]*>`, "g"))) {
        const start = m.index! + m[0].length;
        const end = text.indexOf("</h2>", start);
        if (end === -1) continue;
        for (const icon of iconsIn(text.slice(start, end))) {
          out.push({
            ...icon,
            where: `${rel}:${lineOf(start + icon.at)}`,
            level: "section",
          });
        }
      }

      for (const m of text.matchAll(
        new RegExp(
          `<([A-Z][A-Za-z0-9]*)\\s([^<>]*?)/>\\s*<h3[^>]*${CARD_HEADING_CLASSES}`,
          "gs",
        ),
      )) {
        for (const icon of iconsIn(`<${m[1]} ${m[2]}/>`)) {
          // Not filtered on size here: a wrong-sized glyph must still reach
          // the colour and size checks below.
          out.push({ ...icon, where: `${rel}:${lineOf(m.index!)}`, level: "card" });
        }
      }

      for (const m of text.matchAll(/\bicon=\{/g)) {
        // `size={20}` puts braces inside the value, so the end of the
        // prop is found by balancing rather than by a lazy match.
        const open = m.index! + m[0].length - 1;
        let depth = 0;
        let i = open;
        for (; i < text.length; i++) {
          if (text[i] === "{") depth++;
          else if (text[i] === "}" && --depth === 0) break;
        }
        if (i >= text.length) continue;
        const before = text.slice(0, m.index!);
        const owner = [...before.matchAll(/<([A-Z][A-Za-z0-9]*)[\s>]/g)].pop();
        if (!owner || !SECTION_COMPONENTS.includes(owner[1])) continue;
        for (const icon of iconsIn(text.slice(open + 1, i))) {
          out.push({
            ...icon,
            where: `${rel}:${lineOf(m.index!)}`,
            level: "section",
          });
        }
      }
    }
  }
  return out;
}

describe("section heading icons", () => {
  const icons = headingIcons();

  it("finds exactly the heading icons the app has", () => {
    const perRoot = new Map<string, number>();
    for (const icon of icons) {
      const root = icon.where.startsWith("addons/")
        ? icon.where.split("/").slice(0, 2).join("/")
        : "frontend/src";
      perRoot.set(root, (perRoot.get(root) ?? 0) + 1);
    }
    expect(perRoot.get("frontend/src")).toBe(7);

    const EXPECTED_ADDON_ICONS: Record<string, number> = {
      "addons/intelligence": 2,
      "addons/knowledge": 0,
      "addons/media_import": 0,
      "addons/cloud-sync": 0,
    };
    for (const [root, expected] of Object.entries(EXPECTED_ADDON_ICONS)) {
      // The scanned path, not the submodule directory: an uninitialised
      // submodule leaves an empty directory behind.
      if (!existsSync(resolve(REPO_ROOT, root, "frontend"))) continue;
      expect(perRoot.get(root) ?? 0).toBe(expected);
    }

    expect(
      [...perRoot.keys()].filter(
        (root) => root !== "frontend/src" && !(root in EXPECTED_ADDON_ICONS),
      ),
    ).toEqual([]);
  });

  it("paints them all the same, because the difference carried no meaning", () => {
    const wrong = icons.filter((i) => i.colour !== REQUIRED_COLOUR);
    expect(
      wrong.map((i) => `${i.where} <${i.glyph}> is ${i.colour ?? "uncoloured"}`),
    ).toEqual([]);
  });

  it("sizes the ones that head a section alike", () => {
    const wrong = icons.filter(
      (i) => i.size !== (i.level === "card" ? CARD_ICON_SIZE : REQUIRED_SIZE),
    );
    expect(
      wrong.map((i) => `${i.where} <${i.glyph}> is size ${i.size}`),
    ).toEqual([]);
    expect(icons.some((i) => i.level === "card")).toBe(true);
    expect(icons.some((i) => i.level === "section")).toBe(true);
  });

  it("leaves each section of one column its own glyph", () => {
    // Judged per column, not across the sweep: unrelated pages may
    // legitimately reach for the same lucide icon.
    const DRIVE_HOME = new Set([
      "frontend/src/components/DriveHome.tsx",
      "frontend/src/components/ContinueWatchingSection.tsx",
      "addons/intelligence/frontend/PickupWidget.tsx",
    ]);
    const column = icons.filter((i) => DRIVE_HOME.has(i.where.split(":")[0]));
    const glyphs = column.map((i) => i.glyph);
    expect(glyphs.length).toBe(DRIVE_HOME_GLYPHS);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});
