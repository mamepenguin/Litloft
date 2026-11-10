/**
 * The real video Discover face, driven through the props `useDiscover` hands it while a
 * visit loads. `window.__discoverPrefix.step(n)` commits step n under `flushSync`.
 */

import { useEffect, useState, type ComponentProps, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages-core/en.json";
import { DiscoverFace } from "@/components/videoapp/DiscoverFace";

const DRIVE = "fixture";

function video(id: string) {
  return {
    id,
    filename: `${id}.mp4`,
    title: `Video ${id}`,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1024,
    duration: 60,
    image_width: null,
    image_height: null,
    liked_at: null,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    trust_tier: "verified",
    trust_reviewed_at: null,
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-01-01T00:00:00",
  };
}

const shelf = (id: string, title: string, count: number) => ({
  id,
  title,
  state: { status: "loaded" as const, items: Array.from({ length: count }, (_, i) => video(`${id}-${i}`)) },
  retry: () => {},
});

const CONTINUE = shelf("continue", "Continue", 3);
const RECOMMENDED = shelf("recommended", "Recommended", 7);
const NEW = shelf("new", "New", 12);

const STEPS = [
  { shelves: [CONTINUE], pending: true },
  { shelves: [CONTINUE, RECOMMENDED], pending: true },
  { shelves: [CONTINUE, RECOMMENDED, NEW], pending: false },
];

export interface DiscoverPrefixApi {
  step(n: number): void;
}

declare global {
  interface Window {
    __discoverPrefix: DiscoverPrefixApi;
  }
}

type FaceProps = ComponentProps<typeof DiscoverFace>;

export function DiscoverPrefixArrangement(): ReactElement {
  const [step, setStep] = useState(0);

  useEffect(() => {
    window.__discoverPrefix = { step: (n) => flushSync(() => setStep(n)) };
    document.body.dataset.harness = "ready";
  }, []);

  const props = { drive: DRIVE, empty: false, hasProfile: true, ...STEPS[step] } as unknown as FaceProps;
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <div id="discover-prefix-host" className="bg-bg-primary">
        <DiscoverFace {...props} />
      </div>
    </NextIntlClientProvider>
  );
}
