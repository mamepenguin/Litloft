/**
 * The real file page — `FileDetailContent` with its player, inspector and
 * bottom sheet — with a fake API, on its own and inside the real
 * `TwoPaneLayout`. jsdom lays nothing out, so the responsive forms can only be
 * measured against the components the page actually mounts.
 */

import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { pdfjs } from "react-pdf";
import pdfWorkerSource from "pdfjs-dist/build/pdf.worker.min.mjs?raw";

import { AddonSlotsProvider } from "@/components/AddonSlotsProvider";
import { ClipboardProvider } from "@/components/ClipboardProvider";
import { CurrentDriveProvider } from "@/components/CurrentDriveProvider";
import { FileDetailContent } from "@/components/FileDetailContent";
import { ShortcutsProvider } from "@/components/ShortcutsProvider";
import { SidebarProvider } from "@/components/SidebarProvider";
import { TreeToggle } from "@/components/TreeToggle";
import { TwoPaneLayout } from "@/components/folder/TwoPaneLayout";
import { seedFiles } from "@/lib/fileSeed";
import type { FileItem } from "@/types";
import enMessages from "@/messages-core/en.json";

import intelligenceEn from "../../src/addons/intelligence/messages/en.json";
import { scenesFrames, scenesVisualIndex } from "./scenesSectionData";

const DRIVE = "fixture";
const VIDEO_ID = "video0000001";
const PDF_ID = "pdf000000001";

/**
 * A 3-second 16×16 VP8 clip: a `<video>` reports no metadata for anything
 * less, and the whole page waits on `loadedmetadata`.
 */
const WEBM_BASE64 =
  "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAMpEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggMT7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjIuMy4xMDBXQYxMYXZmNjIuMy4xMDBEiYhAp3AAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WI0/9AnUBHDlacgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QL68IA4JCwgRC6gRCagQJVsIRVuYEBElTDZ/tzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYyLjMuMTAwc3PWY8CLY8WI0/9AnUBHDlZnyKFFo4dFTkNPREVSRIeUTGF2YzYyLjExLjEwMCBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAzLjAwMDAwMDAwMAAfQ7Z1QWrngQCjo4EAAIAQAgCdASoQABAAAEcIhYWIhYSIAgIADA1gAP7/q1CAo5WBAMgAsQEAARAQABgAGFgv9AAIAACjlYEBkACxAQABEBAAGAAYWC/0AAgAAKOVgQJYALEBAAEQEAAYABhYL/QACAAAo5WBAyAAsQEAARAQABgAGFgv9AAIAACjlYED6ACxAQABEBAAGAAYWC/0AAgAAKOVgQSwALEBAAEQEAAYABhYL/QACAAAo5WBBXgAsQEAARAQFGAAYWC/0AAgAACjlYEGQACxAQABEBAAGAAYWC/0AAgAAKOVgQcIALEBAAEQEAAYABhYL/QACAAAo5WBB9AAsQEAARAQABgAGFgv9AAIAACjlYEImACxAQABEBAAGAAYWC/0AAgAAKOVgQlgALEBAAEQEAAYABhYL/QACAAAo5WBCigAsQEAARAQABgAGFgv9AAIAACjlYEK8ACxAQABEBAAGAAYWC/0AAgAABxTu2uRu4+zgQC3iveBAfGCAaPwgQM=";

function fileJson(overrides: Partial<FileItem> & { id: string }): FileItem {
  return {
    filename: `${overrides.id}.bin`,
    title: overrides.id,
    description: "",
    drive: DRIVE,
    folder_path: "",
    file_type: "video",
    mime_type: "video/webm",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 4096,
    duration: null,
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
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as FileItem;
}

const FIXTURE_QUERY = new URLSearchParams(location.search);

/**
 * `scenes=1` puts the real Scenes section in the player's panels and tabs.
 * `frames` is how many frames it has, `ratio=4:3` the shape of their
 * pictures, `vi` the Visual Index answer (`card`, `stale` or `none`) and
 * `vi-delay` how long that answer takes.
 */
const SCENES = FIXTURE_QUERY.get("scenes") === "1";
const SCENES_FRAMES = scenesFrames(Number(FIXTURE_QUERY.get("frames") ?? 300));
const SCENES_RATIO = FIXTURE_QUERY.get("ratio") === "4:3" ? 4 / 3 : 16 / 9;
const SCENES_VI = FIXTURE_QUERY.get("vi") ?? "card";
const SCENES_VI_DELAY_MS = Number(FIXTURE_QUERY.get("vi-delay") ?? 0);

const VIDEO = fileJson({
  id: VIDEO_ID,
  filename: "clip.webm",
  title: "Fixture clip",
  description: FIXTURE_QUERY.get("description") ?? "Recorded on location.",
  duration: 3,
  has_chapters: true,
  tags: ["design"],
});

const PDF = fileJson({
  id: PDF_ID,
  filename: "report.pdf",
  title: "Fixture report",
  description: "A short report.",
  file_type: "document",
  mime_type: "application/pdf",
  tags: ["design"],
});

const FILES: Record<string, FileItem> = {
  [VIDEO_ID]: VIDEO,
  [PDF_ID]: PDF,
};

const PDF_BYTES = buildPdf(["Quarterly report", "Second page", "Third page"]);

/**
 * The catalogue only has to answer two questions here: whether in-file find
 * exists (it is gated on the intelligence addon) and whether the player has a
 * companion to give the inspector a second tab. Neither needs the addon's
 * code; `SlotEntryRenderer` renders nothing when its module will not load.
 */
const ADDONS_STATUS = {
  addons: { intelligence: { label: "Intelligence", icon: "sparkles" } },
  slots: {
    "player-side": [
      {
        id: "transcript",
        label: "Transcript",
        priority: 10,
        addonName: "intelligence",
      },
      ...(SCENES
        ? [
            {
              id: "scenes",
              label: "Scenes",
              priority: 20,
              addonName: "intelligence",
            },
          ]
        : []),
      // A second panel only where a case needs two side by side.
      ...(FIXTURE_QUERY.get("panels") === "two"
        ? [
            {
              id: "outline",
              label: "Outline",
              priority: 20,
              addonName: "intelligence",
            },
          ]
        : []),
    ],
  },
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchInstalled = false;

function installFetch(): void {
  if (fetchInstalled) return;
  fetchInstalled = true;
  // The real route draws the file from its list's copy on the first frame
  // and replaces it with the detail answer. Without a seed the page would
  // paint its skeleton first, which has no player and so no form to measure.
  seedFiles(Object.values(FILES));
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const path = url.split("?")[0];

    if (path.endsWith("/api/addons/status")) {
      return Promise.resolve(json(ADDONS_STATUS));
    }
    if (SCENES) {
      const scenes = scenesResponse(path);
      if (scenes) return scenes;
    }
    const fileMatch = path.match(/\/api\/files\/([^/]+)(\/.*)?$/);
    if (fileMatch) {
      const file = FILES[decodeURIComponent(fileMatch[1])];
      const rest = fileMatch[2] ?? "";
      if (rest === "" && file) return Promise.resolve(json(file));
      if (rest === "/stream" && file?.id === PDF_ID) {
        return Promise.resolve(
          new Response(PDF_BYTES.buffer as ArrayBuffer, {
            status: 200,
            headers: { "Content-Type": "application/pdf" },
          }),
        );
      }
      if (rest === "/progress") {
        return Promise.resolve(
          json({ position: 0, duration: file?.duration ?? 0 }),
        );
      }
      if (rest === "/relations") return Promise.resolve(json({ relations: [] }));
      if (rest === "/comments") {
        return Promise.resolve(json({ comments: [], total: 0 }));
      }
      if (rest === "/chapters")
        return Promise.resolve(
          json({
            chapters: [
              { ordering: 1, title: "Opening", start_time: 0, end_time: null },
            ],
          }),
        );
      if (rest === "/neighbors") {
        return Promise.resolve(json({ prev_id: null, next_id: null }));
      }
      // Anything else about a known file is a write: accepted, never stored.
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (path.includes("/addon-policies")) {
      return Promise.resolve(json({ addons: {} }));
    }
    if (path.includes("/file_active_summary/")) {
      return Promise.resolve(json({ has_active_summary: false }));
    }
    return nativeFetch(input, init);
  };
}

function scenesResponse(path: string): Promise<Response> | null {
  if (path.includes("/addon-policies")) {
    return Promise.resolve(
      json({
        addons: {
          intelligence: {
            default: true,
            features: { video_visual_index: true },
          },
        },
      }),
    );
  }
  if (path.endsWith(`/files/${VIDEO_ID}/clip-timestamps`)) {
    return Promise.resolve(
      json({ file_id: VIDEO_ID, drive: DRIVE, timestamps: SCENES_FRAMES }),
    );
  }
  if (path.endsWith(`/files/${VIDEO_ID}/visual-index`)) {
    const answer =
      SCENES_VI === "none"
        ? new Response("", { status: 404 })
        : json(scenesVisualIndex(VIDEO_ID, SCENES_VI === "stale"));
    if (SCENES_VI_DELAY_MS <= 0) return Promise.resolve(answer);
    return new Promise((resolve) =>
      setTimeout(() => resolve(answer), SCENES_VI_DELAY_MS),
    );
  }
  return null;
}

let scenePicturesInstalled = false;

/**
 * The frame pictures are `<img>` URLs under `/api/`, which `file://` cannot
 * load. Each is answered with a plain picture of the frame set's ratio.
 */
function installScenePictures(): void {
  if (!SCENES || scenePicturesInstalled) return;
  scenePicturesInstalled = true;
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = Math.round(320 / SCENES_RATIO);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#5a7d9a";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const picture = canvas.toDataURL("image/png");

  const isPicture = (value: unknown) =>
    typeof value === "string" &&
    value.includes("/api/") &&
    !value.includes("/stream");

  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "src",
  );
  if (descriptor?.set) {
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      ...descriptor,
      set(value: string) {
        descriptor.set!.call(this, isPicture(value) ? picture : value);
      },
    });
  }
  const nativeSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    const mapped =
      this instanceof HTMLImageElement && name === "src" && isPicture(value)
        ? picture
        : value;
    return nativeSetAttribute.call(this, name, mapped);
  };
}

let mediaInstalled = false;

/** A three-page PDF whose pages each carry one line of real text. */
function buildPdf(pages: readonly string[]): Uint8Array {
  const escape = (text: string) =>
    text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const objects: string[] = [""];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const kids: string[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const pageObject = 4 + index * 2;
    const contentObject = pageObject + 1;
    kids.push(`${pageObject} 0 R`);
    const content = `BT /F1 20 Tf 72 720 Td (${escape(pages[index])}) Tj ET`;
    objects[pageObject] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] =
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  }
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;

  let output = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let object = 1; object < objects.length; object += 1) {
    offsets[object] = output.length;
    output += `${object} 0 obj\n${objects[object]}\nendobj\n`;
  }
  const xref = output.length;
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let object = 1; object < objects.length; object += 1) {
    output += `${String(offsets[object]).padStart(10, "0")} 00000 n \n`;
  }
  output +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(output);
}

/**
 * The page is opened over `file://`, where the API's `/api/files/{id}/stream`
 * is not a URL the browser can load. The same bytes in a blob URL are, and
 * pdf.js reads a document through `XMLHttpRequest`, which the same origin rule
 * blocks just as firmly.
 */
function installMedia(): void {
  if (mediaInstalled) return;
  mediaInstalled = true;
  const bytes = Uint8Array.from(atob(WEBM_BASE64), (c) => c.charCodeAt(0));
  const mediaUrl = URL.createObjectURL(new Blob([bytes], { type: "video/webm" }));
  const streamPath = `/api/files/${VIDEO_ID}/stream`;

  const isStream = (value: unknown) =>
    typeof value === "string" && value.includes(streamPath);

  const nativeSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    return nativeSetAttribute.call(this, name, isStream(value) ? mediaUrl : value);
  };

  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLMediaElement.prototype,
    "src",
  );
  if (descriptor?.set) {
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      ...descriptor,
      set(value: string) {
        descriptor.set!.call(this, isStream(value) ? mediaUrl : value);
      },
    });
  }

  const pdfUrl = URL.createObjectURL(
    new Blob([PDF_BYTES.buffer as ArrayBuffer], {
      type: "application/pdf",
    }),
  );
  const nativeOpen = XMLHttpRequest.prototype.open as unknown as (
    this: XMLHttpRequest,
    ...args: unknown[]
  ) => void;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string,
    ...rest: unknown[]
  ) {
    const target = String(url).includes(`/api/files/${PDF_ID}/stream`)
      ? pdfUrl
      : url;
    return nativeOpen.call(this, method, target, ...rest);
  } as typeof XMLHttpRequest.prototype.open;

  // `PdfPreview` names the worker as a module beside the bundle, which
  // Chrome refuses to load from `file://`. The same code in a blob URL is
  // same-origin; the setter is ignored so the module's own assignment does
  // not put the refused URL back.
  const workerUrl = URL.createObjectURL(
    new Blob([pdfWorkerSource], { type: "text/javascript" }),
  );
  Object.defineProperty(pdfjs.GlobalWorkerOptions, "workerSrc", {
    configurable: true,
    get: () => workerUrl,
    set: () => {},
  });
}

type Messages = { [key: string]: string | Messages };

function deepMerge(base: Messages, extra: Messages): Messages {
  const merged: Messages = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const current = merged[key];
    merged[key] =
      typeof value === "object" && typeof current === "object"
        ? deepMerge(current, value)
        : value;
  }
  return merged;
}

function withIntelligence(core: typeof enMessages): typeof enMessages {
  return deepMerge(
    core as unknown as Messages,
    intelligenceEn as unknown as Messages,
  ) as unknown as typeof enMessages;
}

function Providers({ children }: { children: ReactElement }): ReactElement {
  return (
    <NextIntlClientProvider
      locale="en"
      messages={SCENES ? withIntelligence(enMessages) : enMessages}
    >
      <CurrentDriveProvider>
        <SidebarProvider>
          <ShortcutsProvider>
            <AddonSlotsProvider>
              <ClipboardProvider>{children}</ClipboardProvider>
            </AddonSlotsProvider>
          </ShortcutsProvider>
        </SidebarProvider>
      </CurrentDriveProvider>
    </NextIntlClientProvider>
  );
}

function FilePage({ fileId }: { fileId: string }): ReactElement {
  return (
    <div className="h-[100dvh]">
      <FileDetailContent fileId={fileId} drive={DRIVE} />
    </div>
  );
}

export function InspectorVideoArrangement(): ReactElement {
  installFetch();
  installMedia();
  installScenePictures();
  return (
    <Providers>
      <FilePage fileId={VIDEO_ID} />
    </Providers>
  );
}

export function InspectorPdfArrangement(): ReactElement {
  installFetch();
  installMedia();
  return (
    <Providers>
      <FilePage fileId={PDF_ID} />
    </Providers>
  );
}

const TWO_PANE_ARRANGEMENT = "inspector-video-two-pane";

// `TwoPaneLayout` and the tree button find the open file through the router.
// The stub's `useSearchParams` hands back this map instead, and only this
// arrangement fills it in.
const params = new URLSearchParams(location.search);
if (
  (params.get("arrangement") ?? location.hash.slice(1)) ===
  TWO_PANE_ARRANGEMENT
) {
  window.__fixtureSearchParams = new URLSearchParams(`file=${VIDEO_ID}`);
}

export function InspectorVideoTwoPaneArrangement(): ReactElement {
  installFetch();
  installMedia();
  return (
    <Providers>
      <div className="h-[100dvh]">
        <div className="flex h-12 items-center px-3">
          <TreeToggle drive={DRIVE} />
        </div>
        <div className="h-[calc(100dvh-3rem)]">
          <TwoPaneLayout
            drive={DRIVE}
            folderPath=""
            leftPane={<div className="p-2 text-sm">Tree</div>}
          >
            <div className="p-4 text-sm">Listing</div>
          </TwoPaneLayout>
        </div>
      </div>
    </Providers>
  );
}

/**
 * The collection playback surface, which scrolls the document rather than a
 * box of its own.
 */
export function InspectorVideoCollectionArrangement(): ReactElement {
  installFetch();
  installMedia();
  installScenePictures();
  return (
    <Providers>
      <FileDetailContent fileId={VIDEO_ID} drive={DRIVE} surface="collection" />
    </Providers>
  );
}
