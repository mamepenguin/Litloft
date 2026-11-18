/**
 * The real Clips card drawn in the grid the Library uses, with titles that
 * need the two-line clamp, for measuring its box before and after the cover
 * answer arrives. The covers request is answered by `clipsRowResponse`,
 * called from the fixture's fetch stub, and held until
 * `window.__releaseClipCovers()` when the URL has `hold=1`.
 */

import { useMemo, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import knowledgeEn from "@/addons/knowledge/messages/en.json";
import { ClipMeta, ClipMetaContext } from "@/addons/knowledge/clipsapp/clipMeta";
import { CoverGrid } from "@/addons/knowledge/clipsapp/CoverShelf";
import { PageFrame } from "@/components/PageFrame";
import enMessages from "@/messages-core/en.json";
import type { FileItem } from "@/types";

import { armCoverGate, clipCoversResponse, clipFiles } from "./clipsData";

const NOW = new Date("2026-03-10T12:00:00");
const FILES = clipFiles(6) as unknown as FileItem[];

/** `null` when the request is none of the card's. */
export function clipsRowResponse(url: string, init?: RequestInit): Promise<Response> | null {
  if (!window.location.hash.includes("clips-row")) return null;
  if (url.endsWith("/api/addons/knowledge/clip-covers")) return clipCoversResponse(init?.body);
  return null;
}

export function ClipsRowArrangement(): ReactElement {
  armCoverGate(new URLSearchParams(window.location.search).get("hold") === "1");
  const meta = useMemo(() => new ClipMeta("fixture", () => {}), []);
  const context = useMemo(() => ({ meta, refresh: 0, dotsKey: null }), [meta]);
  return (
    <NextIntlClientProvider locale="en" messages={{ ...enMessages, ...knowledgeEn }}>
      <ClipMetaContext value={context}>
        <PageFrame width="wide" header={null}>
          <div id="clips-cards" className="px-4 pb-10 pt-6">
            <CoverGrid items={FILES} now={NOW} showAge />
          </div>
        </PageFrame>
      </ClipMetaContext>
    </NextIntlClientProvider>
  );
}
