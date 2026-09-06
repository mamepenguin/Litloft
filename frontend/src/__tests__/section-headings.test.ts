import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";

/**
 * Section headings on a drive's home page are one row of one list, read
 * top to bottom. Their icons had drifted into three colours across two
 * repositories — teal on "Recently added", "Liked" and "Continue
 * watching", `accent-cta` on "Pickup", plain `accent` on "Files", muted
 * on the rest — and none of it meant anything: `DESIGN.md` §2.2 gives
 * `--accent-teal` to success and accepted state and `--accent-cta` to
 * CTA buttons, and a heading is neither. The difference in glyph is
 * what tells the sections apart; the difference in colour only made the
 * column look like it was ranking them.
 *
 * Enumerating the sites is the whole difficulty — the spec counted
 * seven and there are eight, in four colours. So this reads the source
 * for the two shapes a section heading icon can take rather than
 * keeping a list:
 *
 *   1. an icon inside an `<h2>` carrying the section-heading classes,
 *      which covers every heading written inline and the default in
 *      `ContinueWatchingSection`;
 *   2. an `icon={<… />}` prop handed to a section component, which
 *      covers the five headings `DriveHome` and `PickupWidget` pass in.
 *
 * Anything else — a menu row's 14px glyph, a button's affordance — is
 * not a section heading and is not this test's business.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SELF = fileURLToPath(import.meta.url);

/** Core plus every addon beside it; see `design-tokens.test.ts` for why. */
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

/** The class list every section heading in the app is written with. */
const HEADING_CLASSES = "flex items-center gap-2 text-lg font-bold text-text-primary";

/**
 * The admin dashboard's cards name themselves the same way, one level
 * down: an 18px glyph and an `<h3>`, side by side at the top of the card.
 *
 * They are here rather than in a file of their own because they are the
 * same claim — a heading's glyph tells you which heading it is, and its
 * colour is not allowed to say anything else. The dashboard had three of
 * them and two colours, which read as one card mattering more than the
 * others.
 *
 * The shape is the glyph *immediately* followed by the `<h3>`, because the
 * class list alone matches ten places in the tree that are not card
 * headings — a dialog title, a wizard step, a picker.
 *
 * **What adjacency costs, named rather than implied.** A card heading whose
 * glyph sits behind a wrapper `<div>` is not seen.
 * `addons/cloud-sync/frontend/SyncDriveCard.tsx` is one, and its glyph is
 * `text-accent-cta` — the very treatment this rule removes. It is left
 * uncovered on purpose: cloud-sync is outside this phase entirely
 * (DESIGN.md §6 records why, and `button-adoption.test.ts` keeps its two
 * hand-written sites for the same reason), so widening the shape to reach
 * it would mean sweeping in an addon nobody is reviewing. **`"addons/
 * cloud-sync": 0` below is therefore a limit of this scan, not a fact
 * about that addon** — when cloud-sync comes into scope, widen the shape
 * to a bounded window before the heading and expect the number to move.
 *
 * Loosening adjacency without that is not free: a window of a few hundred
 * characters also picks up `knowledge/VersionHistoryPanel.tsx`'s 15px
 * disclosure chevron, which is a row control and not a heading at all.
 */
const CARD_HEADING_CLASSES = "text-sm font-semibold text-text-primary";
const CARD_ICON_SIZE = 18;

/** Components whose `icon` prop is rendered as a section heading icon. */
const SECTION_COMPONENTS = ["CarouselSection", "ContinueWatchingSection"];

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
  /** Which rung of the outline it names. Sizes differ; colour does not. */
  level: "section" | "card";
}

/** `<Glyph size={20} className="…" />`, wherever it appears in `body`. */
function iconsIn(body: string): { glyph: string; size: number | null; colour: string | null; at: number }[] {
  const found: { glyph: string; size: number | null; colour: string | null; at: number }[] = [];
  for (const m of body.matchAll(/<([A-Z][A-Za-z0-9]*)\s([^<>]*?)\/>/g)) {
    const attrs = m[2];
    const size = /\bsize=\{(\d+)\}/.exec(attrs);
    // Only icons are measured in a bare numeric `size`; a section
    // component would not be self-closing inside a heading anyway.
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

      // Shape 1: inside an <h2> wearing the section-heading classes.
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

      // Shape 3: an 18px glyph immediately followed by a card `<h3>`.
      for (const m of text.matchAll(
        new RegExp(
          `<([A-Z][A-Za-z0-9]*)\\s([^<>]*?)/>\\s*<h3[^>]*${CARD_HEADING_CLASSES}`,
          "gs",
        ),
      )) {
        for (const icon of iconsIn(`<${m[1]} ${m[2]}/>`)) {
          // Collected whatever its size is, and judged below. Filtering on
          // the size here made the size assertion's card branch dead code
          // *and* dropped a wrong-sized glyph out of the colour check with
          // it: `size={20} className="text-accent"` on a card heading left
          // all four tests green as long as the count still added up.
          out.push({ ...icon, where: `${rel}:${lineOf(m.index!)}`, level: "card" });
        }
      }

      // Shape 2: an `icon={…}` prop on a section component. The prop is
      // matched first and its owner found by walking back to the
      // nearest JSX open tag, because the two are usually lines apart.
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
    // Guards the scan itself: a regex that silently stopped matching
    // would make every assertion below pass over an empty list. Exact
    // rather than a lower bound, because the failure this is really
    // aimed at is a *new* heading the scan cannot see — under `>=` that
    // stays green, which is how the original count came out at seven
    // when there were eight. Adding a section means updating a number
    // here, which is the point: it forces someone to look at the list.
    //
    // Per root, not as one total, for the reason `page-headings.test.ts`
    // gives: a single number over core plus whichever submodules happen to
    // be checked out fails a `git clone` without `--recurse-submodules`
    // with "expected 7 to be 8" and nothing naming the cause. This file
    // did exactly that until the clone was measured. Core's seven are the
    // drive home column's sections; the eighth was always the intelligence
    // addon's "Pickup", asserted here only where that addon is present.
    const perRoot = new Map<string, number>();
    for (const icon of icons) {
      const root = icon.where.startsWith("addons/")
        ? icon.where.split("/").slice(0, 2).join("/")
        : "frontend/src";
      perRoot.set(root, (perRoot.get(root) ?? 0) + 1);
    }
    // Seven drive-home sections plus the admin dashboard's two cards.
    expect(perRoot.get("frontend/src")).toBe(9);

    const EXPECTED_ADDON_ICONS: Record<string, number> = {
      // "Pickup" on the drive home, and the index-status card on /admin.
      "addons/intelligence": 2,
      "addons/knowledge": 0,
      "addons/media_import": 0,
      // Not "cloud-sync has none" — see the note on adjacency above.
      "addons/cloud-sync": 0,
    };
    for (const [root, expected] of Object.entries(EXPECTED_ADDON_ICONS)) {
      // The scanned path, not the submodule directory: an uninitialised
      // submodule leaves an empty directory behind.
      if (!existsSync(resolve(REPO_ROOT, root, "frontend"))) continue;
      expect(perRoot.get(root) ?? 0).toBe(expected);
    }

    // A fifth addon's heading would be counted by nobody: the map above is
    // a fixed set of keys, and a root missing from it is simply never
    // asked about. The single total this replaced did catch that, so the
    // guard comes with it — an unlisted root is a heading nothing checks
    // the colour or the size of a count for.
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
    // A page title is not a section heading: the "Pickup" feed page's
    // own <h1> keeps its larger glyph and neither shape matches it.
    //
    // Per level, because the two rungs are two sizes: a section heading
    // is 20px and a card heading 18px, which is the same relation their
    // type carries. One number over both would have to be a range, and a
    // range is what let four colours in.
    const wrong = icons.filter(
      (i) => i.size !== (i.level === "card" ? CARD_ICON_SIZE : REQUIRED_SIZE),
    );
    expect(
      wrong.map((i) => `${i.where} <${i.glyph}> is size ${i.size}`),
    ).toEqual([]);
    // Neither level is empty, so neither branch of that filter is prose.
    expect(icons.some((i) => i.level === "card")).toBe(true);
    expect(icons.some((i) => i.level === "section")).toBe(true);
  });

  it("leaves each section of one column its own glyph", () => {
    // Colour was the redundant channel; shape is the one that works, so
    // two sections of the same column sharing a glyph would be the
    // opposite mistake. Judged per column and not across the sweep: two
    // unrelated pages in two addons may legitimately reach for the same
    // lucide icon, and failing on that would be a red with no defect
    // behind it. "Column" is approximated by the file, plus the addon
    // widgets that render into the drive home beside core's own.
    const DRIVE_HOME = new Set([
      "frontend/src/components/DriveHome.tsx",
      "frontend/src/components/RootFileListing.tsx",
      "frontend/src/components/ContinueWatchingSection.tsx",
      "addons/intelligence/frontend/PickupWidget.tsx",
    ]);
    const column = icons.filter((i) => DRIVE_HOME.has(i.where.split(":")[0]));
    const glyphs = column.map((i) => i.glyph);
    expect(glyphs.length).toBeGreaterThan(1);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});
