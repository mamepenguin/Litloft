/**
 * The real Clips page, for measuring its header action at whatever width the
 * browser is given. The count request is answered by the fixture's fetch
 * stub, so the page reaches its drawn state without a server.
 */

import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import ClipsPage from "@/addons/knowledge/pages/clips";
import knowledgeEn from "@/addons/knowledge/messages/en.json";
import { CurrentDriveProvider } from "@/components/CurrentDriveProvider";
import enMessages from "@/messages-core/en.json";

export function ClipsPageArrangement(): ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={{ ...enMessages, ...knowledgeEn }}>
      <CurrentDriveProvider>
        <div id="clips-page-host" className="flex min-h-screen flex-col bg-bg-primary">
          <ClipsPage />
        </div>
      </CurrentDriveProvider>
    </NextIntlClientProvider>
  );
}
