/**
 * The real `SelectionBar` at 375 px with its first trash request held open:
 * a chunk that never answers is what keeps the running dialog on screen.
 */

import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ClipboardProvider } from "@/components/ClipboardProvider";
import { SelectionBar } from "@/components/SelectionBar";
import enMessages from "@/messages-core/en.json";

const IDS = Array.from({ length: 300 }, (_, i) => `f${String(i).padStart(4, "0")}`);

const fallThrough = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/files/batch/delete")) {
    return new Promise<Response>(() => {});
  }
  return fallThrough(input, init);
};

function Frame({ children }: { children: ReactElement }): ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ClipboardProvider>
        <div id="batch-progress-host" className="min-h-screen bg-bg-primary">
          {children}
        </div>
      </ClipboardProvider>
    </NextIntlClientProvider>
  );
}

function BatchProgressArrangement(): ReactElement {
  return (
    <Frame>
      <SelectionBar
        count={IDS.length}
        selectedIds={new Set(IDS)}
        totalCount={500}
        drive="main"
        currentPath=""
        onSelectAll={() => {}}
        onClear={() => {}}
        onComplete={() => {}}
      />
    </Frame>
  );
}

export const BATCH_PROGRESS_ARRANGEMENTS: Record<string, () => ReactElement> = {
  "batch-progress": BatchProgressArrangement,
};
