/**
 * The real TextPreview and MarkdownFileViewer in the two scroll hosts the app
 * gives them: the full-page `<main>` and the two-pane right pane. Which case
 * runs is read from the query string, because a restore must see an empty
 * `location.hash` and the routing of this fixture otherwise lives there.
 */

import { useEffect, type ReactElement, type ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages-core/en.json";
import { TextPreview } from "@/components/TextPreview";
import { MarkdownFileViewer } from "@/components/MarkdownFileViewer";
import { ProfileProvider, useProfile } from "@/components/ProfileProvider";

const FILE = "textresume01";

const LONG_TEXT = Array.from({ length: 260 }, (_, i) => `line number ${i + 1}`).join("\n");
const SHORT_TEXT = Array.from({ length: 45 }, (_, i) => `line number ${i + 1}`).join("\n");

const MARKDOWN_BODY = [
  "# A long note",
  "",
  "The first phrase a highlight target may choose.",
  "",
  ...Array.from(
    { length: 80 },
    (_, i) => `Paragraph ${i + 1} of a note long enough to scroll several times.`,
  ),
].join("\n\n");

interface Writes {
  __progressWrites?: Array<{
    fileId: string;
    position: number;
    duration: number;
  }>;
  __resolveProgress?: (position: number, duration: number) => void;
}

function json(value: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/**
 * The fetch the fixture installed before any arrangement ran. Each
 * arrangement replaces `window.fetch` while it renders, so the fallback is
 * captured once or the wrappers would chain.
 */
const nativeFetch = window.fetch.bind(window);

function useFixtureProfile(name: string | null): boolean {
  const { nickname, setNickname } = useProfile();
  useEffect(() => {
    if (name !== null && nickname !== name) setNickname(name);
  }, [name, nickname, setNickname]);
  // Production renders the viewer after the profile cookie has been read.
  return name === null || nickname === name;
}

function ProfileGate({
  name,
  children,
}: {
  name: string | null;
  children: ReactNode;
}): ReactElement {
  const ready = useFixtureProfile(name);
  return <>{ready ? children : null}</>;
}

function Viewer({
  doc,
  body,
  highlight,
}: {
  doc: string;
  body: string;
  highlight: string | undefined;
}): ReactElement {
  return doc === "markdown" ? (
    <MarkdownFileViewer fileId={FILE} highlight={highlight} />
  ) : (
    <TextPreview
      fileId={FILE}
      fileSize={body.length}
      filename="notes.txt"
      highlight={highlight}
    />
  );
}

export function TextResumeArrangement(): ReactElement {
  const params = new URLSearchParams(location.search);
  const layout = params.get("layout") === "pane" ? "pane" : "full";
  const doc = params.get("doc") === "markdown" ? "markdown" : "text";
  const stored = params.get("stored") ?? "empty";
  const highlightParam = params.get("highlight") === "1";
  const body = params.get("short") === "1" ? SHORT_TEXT : LONG_TEXT;
  const markdown = params.get("short") === "1" ? "# Short\n\nOne paragraph." : MARKDOWN_BODY;
  const source = doc === "markdown" ? markdown : body;
  const highlight = highlightParam
    ? doc === "markdown"
      ? "The first phrase"
      : "line number 1"
    : undefined;

  const fixture = window as unknown as Writes;
  if (!fixture.__progressWrites) fixture.__progressWrites = [];
  const fallbackFetch = nativeFetch;

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    if (url.includes(`/files/${FILE}/progress`)) {
      if ((init?.method ?? "GET").toUpperCase() === "POST") {
        const sent = JSON.parse(String(init?.body ?? "{}")) as {
          position: number;
          duration: number;
        };
        fixture.__progressWrites!.push({
          fileId: FILE,
          position: sent.position,
          duration: sent.duration,
        });
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (stored === "pending") {
        return new Promise<Response>((resolve) => {
          fixture.__resolveProgress = (position, duration) =>
            resolve(
              new Response(JSON.stringify({ position, duration }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }),
            );
        });
      }
      if (stored === "fail") return json({ detail: "down" }, 500);
      const positions: Record<string, number> = {
        "49": 49,
        "50": 50,
        "500": 500,
        "899": 899,
        "900": 900,
      };
      const position = positions[stored] ?? 0;
      return json({ position, duration: position === 0 ? 0 : 1000 });
    }

    if (url.includes(`/files/${FILE}/wiki-resolutions`)) return json({});
    if (url.includes(`/files/${FILE}/stream`)) {
      return Promise.resolve(new Response(source, { status: 200 }));
    }
    return fallbackFetch(input, init);
  };

  const viewer = <Viewer doc={doc} body={source} highlight={highlight} />;

  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ProfileProvider>
        <ProfileGate name="kaori">
          {layout === "pane" ? (
            <div style={{ display: "flex", height: "100vh" }}>
              <div style={{ width: 320, borderRight: "1px solid #ddd" }}>
                files
              </div>
              <div
                data-scroll-host
                style={{ flex: 1, height: "100vh", overflow: "auto", padding: 24 }}
              >
                {viewer}
              </div>
            </div>
          ) : (
            <main
              data-scroll-host
              style={{ height: "100vh", overflow: "auto", padding: 24 }}
            >
              {viewer}
            </main>
          )}
        </ProfileGate>
      </ProfileProvider>
    </NextIntlClientProvider>
  );
}
