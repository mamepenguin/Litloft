import { describe, expect, it } from "vitest";

import en from "@/messages-core/en.json";
import ja from "@/messages-core/ja.json";
import { subtitleErrorMessage } from "../subtitleErrors";

type Tree = { [key: string]: string | Tree };

/**
 * A `t` that resolves a key the way next-intl would at the call site, and
 * falls back to the key's leaf inside the whole tree: the caller owns the
 * namespace, so the test must not assume which one `subtitleErrorMessage`
 * is handed.
 */
function translate(tree: Tree) {
  const lookup = (path: string): unknown =>
    path.split(".").reduce<unknown>(
      (node, part) =>
        typeof node === "object" && node !== null
          ? (node as Record<string, unknown>)[part]
          : undefined,
      tree,
    );
  const leaf = (node: Tree, name: string): string | undefined => {
    for (const [key, value] of Object.entries(node)) {
      if (key === name && typeof value === "string") return value;
      if (typeof value === "object") {
        const found = leaf(value, name);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  return (key: string, values?: Record<string, unknown>) => {
    const direct = lookup(key);
    const text =
      typeof direct === "string"
        ? direct
        : (leaf(tree, key.split(".").pop() ?? key) ?? key);
    return Object.entries(values ?? {}).reduce(
      (message, [name, value]) => message.split(`{${name}}`).join(String(value)),
      text,
    );
  };
}

const jaT = translate(ja as Tree);
const enT = translate(en as Tree);

const NAMES = ["Night.ja.srt", "Night.en.vtt"];

/** code, the ja message the spec's 185.8 table gives, whether names follow. */
const CODES = [
  ["subtitle_name_taken", "行き先に同じ名前の字幕があります。", true],
  ["subtitle_owner_change", "別の動画の字幕の持ち主が変わるため、この操作はできません。", true],
  ["subtitle_conflict", "字幕の名前が重なるため変更できません。", true],
  ["subtitle_language_taken", "この言語の字幕はすでにあります。差し替えを使ってください。", false],
  ["subtitle_language", "言語コードは英字 2〜3 文字で入力してください。", false],
  ["subtitle_extension", ".srt か .vtt のファイルを選んでください。", false],
  ["subtitle_extension_reserved", ".srt と .vtt の名前は字幕のアップロードでだけ使えます。", false],
  ["subtitle_too_large", "字幕が 5 MB を超えています。", false],
  ["subtitle_not_utf8", "UTF-8 で保存された字幕ではありません。", false],
] as const;

describe("SPEC-CORE-185 185.8: every refusal code has a message", () => {
  it.each(CODES)("%s reads as the table's ja message", (code, message, names) => {
    const shown = subtitleErrorMessage(jaT, code, names ? NAMES : []);

    if (names) {
      expect(shown.startsWith(message)).toBe(true);
      for (const name of NAMES) expect(shown).toContain(name);
    } else {
      expect(shown).toBe(message);
    }
  });

  it.each(CODES)("%s is translated rather than left as the code (en)", (code, _ja, names) => {
    const shown = subtitleErrorMessage(enT, code, names ? NAMES : []);

    expect(shown).not.toBe("");
    expect(shown).not.toBe(code);
    expect(shown).not.toContain(code);
    if (names) {
      for (const name of NAMES) expect(shown).toContain(name);
    } else {
      expect(shown).not.toContain("subtitle_");
    }
  });

  it("ja and en are different strings, so one locale did not leak into the other", () => {
    for (const [code] of CODES) {
      expect(subtitleErrorMessage(jaT, code, [])).not.toBe(
        subtitleErrorMessage(enT, code, []),
      );
    }
  });
});

describe("SPEC-CORE-185 I11: the names reach the message", () => {
  it.each(CODES.filter(([, , names]) => names))(
    "%s appends every name the server answered with",
    (code, _message, _names) => {
      const shown = subtitleErrorMessage(jaT, code, ["one.srt", "two.vtt"]);

      expect(shown).toContain("one.srt");
      expect(shown).toContain("two.vtt");
    },
  );

  it("adds no separator or placeholder when there is no name", () => {
    expect(subtitleErrorMessage(jaT, "subtitle_too_large", [])).toBe(
      "字幕が 5 MB を超えています。",
    );
  });
});
