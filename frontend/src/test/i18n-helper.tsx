import { type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import jaMessages from "../messages/ja.json";

export function IntlWrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      {children}
    </NextIntlClientProvider>
  );
}
