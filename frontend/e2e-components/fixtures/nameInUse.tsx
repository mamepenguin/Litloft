/**
 * The real `CollectionPicker` and collection page, on a drive whose create and
 * rename requests answer `409`, so a case can type a name and measure the
 * name-in-use line.
 */

import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { CollectionPicker } from "@/components/CollectionPicker";
import { CollectionDetail } from "@/components/CollectionDetail";
import { CurrentDriveProvider } from "@/components/CurrentDriveProvider";
import enMessages from "@/messages-core/en.json";

const DRIVE = "nameinuse";
export const NAME_IN_USE_COLLECTION =
  "Lecture recordings and papers from one long running research project";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fallThrough = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = url.split("?")[0];
  if (!path.includes(`/api/drives/${DRIVE}/`)) return fallThrough(input, init);
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "POST" || method === "PUT" || method === "PATCH") {
    return Promise.resolve(json({ detail: "Name already in use" }, 409));
  }
  if (/\/collections\/[^/]+$/.test(path)) {
    return Promise.resolve(
      json({
        id: "niucollect01",
        name: NAME_IN_USE_COLLECTION,
        description: null,
        drive: DRIVE,
        items: [],
        on_home: false,
        created_at: "",
        updated_at: "",
      }),
    );
  }
  return Promise.resolve(json([]));
};

function Frame({ children }: { children: ReactElement }): ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <div id="name-in-use-host" className="min-h-screen bg-bg-primary">
        {children}
      </div>
    </NextIntlClientProvider>
  );
}

function PickerArrangement(): ReactElement {
  return (
    <Frame>
      <CollectionPicker open drive={DRIVE} fileIds={["f1"]} onClose={() => {}} />
    </Frame>
  );
}

function TitleArrangement(): ReactElement {
  return (
    <Frame>
      <CurrentDriveProvider>
        <CollectionDetail drive={DRIVE} collectionId="niucollect01" />
      </CurrentDriveProvider>
    </Frame>
  );
}

export const NAME_IN_USE_ARRANGEMENTS: Record<string, () => ReactElement> = {
  "name-in-use-picker": PickerArrangement,
  "name-in-use-title": TitleArrangement,
};
