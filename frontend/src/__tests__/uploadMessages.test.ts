/**
 * SPEC-CORE-030 — the two pieces of text the change adds, in both locales.
 *
 * The catalogue is asserted rather than a rendered tree: `next-intl` is
 * mocked to English across the suite, so a rendered Japanese dialog would be
 * the mock talking.
 */

import { describe, it, expect } from "vitest";
import jaMessages from "../messages-core/ja.json";
import enMessages from "../messages-core/en.json";

type Tree = { [key: string]: string | Tree };

/** Every leaf string in a catalogue, with the path that holds it. */
function leaves(tree: Tree, prefix = ""): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object") out.push(...leaves(value, path));
    else out.push([path, value]);
  }
  return out;
}

interface Catalogue {
  locale: "en" | "ja";
  messages: Tree;
  destinationError: string;
  lock: { title: string; message: string; confirm: string; cancel: string };
}

const CATALOGUES: Catalogue[] = [
  {
    locale: "en",
    messages: enMessages as Tree,
    destinationError: "The destination folder was not found",
    lock: {
      title: "Uploads in progress",
      message: "Locking interrupts the uploads in progress.",
      confirm: "Lock",
      cancel: "Cancel",
    },
  },
  {
    locale: "ja",
    messages: jaMessages as Tree,
    destinationError: "送り先のフォルダが見つかりません",
    lock: {
      title: "アップロード中です",
      message: "ロックすると、実行中のアップロードは中断されます。",
      confirm: "ロックする",
      cancel: "キャンセル",
    },
  },
];

describe("SPEC-CORE-030 messages", () => {
  it.each(CATALOGUES)(
    "SPEC-CORE-030 carries the destination-folder error in the upload namespace ($locale)",
    ({ messages, destinationError }) => {
      const values = leaves(messages.upload as Tree).map(([, value]) => value);
      expect(values).toContain(destinationError);
    },
  );

  it.each(CATALOGUES)(
    "SPEC-CORE-030 carries the lock confirmation's text ($locale)",
    ({ messages, lock }) => {
      const values = leaves(messages).map(([, value]) => value);
      expect(values).toContain(lock.title);
      expect(values).toContain(lock.message);
      // Both labels are words the catalogue already had: the dialog reuses
      // them rather than inventing a second spelling.
      expect(values).toContain(lock.confirm);
      expect(values).toContain(lock.cancel);
    },
  );
});
