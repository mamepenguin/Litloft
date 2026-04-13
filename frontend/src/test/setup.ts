import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import jaMessages from "../messages/ja.json";

// Messages may be arbitrarily nested (e.g. "knowledge.editor.toolbar.h1").
// Walk dot-separated namespace + key paths against the full tree instead
// of indexing a single level.
type MessageTree = { [key: string]: string | MessageTree };

function lookup(tree: MessageTree, path: string): unknown {
  let current: unknown = tree;
  for (const part of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// Global mock for next-intl
// Returns actual Japanese translations so existing tests continue to work
vi.mock("next-intl", () => {
  const messages = jaMessages as unknown as MessageTree;

  const useTranslations = (namespace: string) => {
    const t = (key: string, values?: Record<string, unknown>) => {
      const raw = lookup(messages, `${namespace}.${key}`);
      let text = typeof raw === "string" ? raw : `${namespace}.${key}`;
      if (values) {
        text = Object.entries(values).reduce(
          (str, [k, v]) => str.replace(`{${k}}`, String(v)),
          text,
        );
      }
      return text;
    };
    return t;
  };

  const useLocale = () => "ja";

  return {
    useTranslations,
    useLocale,
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});
