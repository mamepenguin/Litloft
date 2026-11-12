/**
 * The real All notes view, inside the page frame the Notes page draws it in,
 * for measuring the toolbar at whatever width the browser is given. The
 * folder, tag and listing requests are answered by the fixture's fetch stub.
 */

import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import AllNotes from "@/addons/knowledge/AllNotes";
import type { AllNotesScope } from "@/addons/knowledge/allNotesParams";
import knowledgeJa from "@/addons/knowledge/messages/ja.json";
import { PageFrame } from "@/components/PageFrame";
import { PageHeader } from "@/components/PageHeader";
import jaMessages from "@/messages-core/ja.json";

const NOW = new Date("2026-03-10T12:00:00");

const SCOPE: AllNotesScope = {
  folder: null,
  tag: null,
  sort: "updated",
  query: "",
};

export function NotesAllClipsToggleArrangement(): ReactElement {
  return (
    <NextIntlClientProvider locale="ja" messages={{ ...jaMessages, ...knowledgeJa }}>
      <PageFrame width="wide" header={<PageHeader title="すべてのノート" />}>
        <div id="notes-all" className="mt-6">
          <AllNotes drive="fixture" scope={SCOPE} now={NOW} />
        </div>
      </PageFrame>
    </NextIntlClientProvider>
  );
}
