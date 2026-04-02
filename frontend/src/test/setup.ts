import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import jaMessages from "../messages/ja.json";

type Messages = Record<string, Record<string, string>>;

// Global mock for next-intl
// Returns actual Japanese translations so existing tests continue to work
vi.mock("next-intl", () => {
  const messages = jaMessages as Messages;

  const useTranslations = (namespace: string) => {
    const ns = messages[namespace] ?? {};
    const t = (key: string, values?: Record<string, unknown>) => {
      let text = ns[key] ?? `${namespace}.${key}`;
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
