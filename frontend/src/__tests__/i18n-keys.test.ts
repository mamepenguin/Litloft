import { describe, it, expect } from "vitest";
import jaMessages from "../messages/ja.json";
import enMessages from "../messages/en.json";

type MessageObject = Record<string, string | Record<string, string>>;

function getAllKeys(obj: MessageObject, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) {
      keys.push(...getAllKeys(value as MessageObject, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

describe("i18n key consistency", () => {
  const jaKeys = getAllKeys(jaMessages as MessageObject);
  const enKeys = getAllKeys(enMessages as MessageObject);

  it("ja.json and en.json have the same number of keys", () => {
    expect(jaKeys.length).toBe(enKeys.length);
  });

  it("ja.json and en.json have identical key sets", () => {
    expect(jaKeys).toEqual(enKeys);
  });

  it("all keys in ja.json exist in en.json", () => {
    const enKeySet = new Set(enKeys);
    const missingInEn = jaKeys.filter((key) => !enKeySet.has(key));
    expect(missingInEn).toEqual([]);
  });

  it("all keys in en.json exist in ja.json", () => {
    const jaKeySet = new Set(jaKeys);
    const missingInJa = enKeys.filter((key) => !jaKeySet.has(key));
    expect(missingInJa).toEqual([]);
  });

  it("no empty string values in ja.json", () => {
    const emptyKeys = jaKeys.filter((key) => {
      const parts = key.split(".");
      let current: unknown = jaMessages;
      for (const part of parts) {
        current = (current as Record<string, unknown>)[part];
      }
      return current === "";
    });
    expect(emptyKeys).toEqual([]);
  });

  it("no empty string values in en.json", () => {
    const emptyKeys = enKeys.filter((key) => {
      const parts = key.split(".");
      let current: unknown = enMessages;
      for (const part of parts) {
        current = (current as Record<string, unknown>)[part];
      }
      return current === "";
    });
    expect(emptyKeys).toEqual([]);
  });
});
