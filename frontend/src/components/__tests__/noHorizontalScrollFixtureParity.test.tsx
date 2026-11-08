/**
 * The browser fixture hand-writes the components' markup, because the
 * layout spec measures a page with no Next.js server behind it. This keeps
 * a class list in the fixture from drifting away from the component while
 * the browser cases go on passing against the stale shape.
 *
 * The add-on policy table has its own fixture and parity test under
 * `src/app/admin/settings/__tests__/`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import type { ShelfItem } from "@/lib/api";
import { CollectionPanel } from "@/components/CollectionPanel";
import { PageTabs } from "@/components/PageTabs";
import { InspectorShell } from "@/components/FileDetail/inspector/InspectorShell";
import { buildInspectorTabs } from "@/components/FileDetail/inspector/tabs";
import { Breadcrumb } from "@/components/Breadcrumb";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onNavigate: _onNavigate,
    ...props
  }: Record<string, unknown>) => (
    <a href={String(href)} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  getCollection: vi.fn(),
  getDriveFiles: vi.fn(),
  removeCollectionItem: vi.fn().mockResolvedValue(undefined),
  reorderCollectionItems: vi.fn().mockResolvedValue({}),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
  getStreamUrl: (id: string) => `/api/files/${id}/stream`,
}));

import { getCollection } from "@/lib/api";

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const SPEC: Record<string, string> = JSON.parse(
  readFileSync(
    resolve(REPO_ROOT, "frontend/e2e-layout/fixtures/no-horizontal-scroll.html"),
    "utf-8",
  ).match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

const sorted = (className: string) =>
  className.split(/\s+/).filter(Boolean).sort();

const expectSameClasses = (rendered: string, declared: string) =>
  expect(sorted(rendered)).toEqual(sorted(declared));

const item = (id: string): ShelfItem =>
  ({
    id,
    filename: `${id}.mp4`,
    title: `Video ${id}`,
    drive: "main",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    has_thumbnail: false,
    file_size: 1000,
    duration: 120,
    tags: [],
  }) as unknown as ShelfItem;

function collectionFile(id: string) {
  return {
    ...item(id),
    title: `Track ${id}`,
    file_type: "video",
  } as unknown as never;
}

function renderCollection() {
  vi.mocked(getCollection).mockResolvedValue({
    id: "c1",
    name: "A collection of many tracks",
    description: null,
    drive: "main",
    items: [
      { id: 1, position: 0, file: collectionFile("f1") },
      { id: 2, position: 1, file: collectionFile("f2") },
    ],
    created_at: "",
    updated_at: "",
  } as never);

  const { container } = render(
    <CollectionPanel
      collectionId="c1"
      currentFileId="f1"
      currentFileType="video"
      drive="main"
      folderPath=""
      onNavigate={() => {}}
    />,
  );
  return { container };
}

function readCollection(container: HTMLElement) {
  const outer = container.firstElementChild as HTMLElement;
  const card = outer.firstElementChild as HTMLElement;
  const head = card.firstElementChild as HTMLElement;
  const text = head.firstElementChild as HTMLElement;
  const list = card.children[1] as HTMLElement;
  const track = list.firstElementChild as HTMLElement;
  const body = track.children[1] as HTMLElement;
  return {
    outer,
    card,
    head,
    title: text.children[0] as HTMLElement,
    count: text.children[1] as HTMLElement,
    list,
    track,
    thumb: track.children[0] as HTMLElement,
    body,
    trackTitle: body.children[0] as HTMLElement,
  };
}

describe("SPEC-CORE-064/065 — the no-horizontal-scroll fixture's collection panel", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("declares the card, the track strip and the track", async () => {
    const { container } = renderCollection();
    await waitFor(() =>
      expect(screen.getByText("Track f1")).toBeInTheDocument(),
    );
    const collection = readCollection(container);

    expectSameClasses(collection.outer.className, SPEC.collectionOuter!);
    expectSameClasses(collection.card.className, SPEC.collectionCard!);
    expectSameClasses(collection.head.className, SPEC.collectionHead!);
    expectSameClasses(collection.title.className, SPEC.collectionTitle!);
    expectSameClasses(collection.count.className, SPEC.collectionCount!);
    expectSameClasses(collection.list.className, SPEC.trackList!);
    expectSameClasses(collection.track.className, SPEC.track!);
    expectSameClasses(collection.thumb.className, SPEC.trackThumb!);
    expectSameClasses(collection.body.className, SPEC.trackBody!);
    expectSameClasses(collection.trackTitle.className, SPEC.trackTitle!);
  });
});

describe("SPEC-CORE-064/065 — the no-horizontal-scroll fixture's tab strips", () => {
  it("declares the page tab row PageTabs renders", () => {
    render(
      <PageTabs
        items={[
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ]}
        current="a"
        label="Tabs"
      />,
    );
    const strip = screen.getByRole("tablist");
    const [selected, idle] = screen.getAllByRole("tab");

    expectSameClasses(strip.className, SPEC.pageTabs!);
    expect(idle!.className).toContain(SPEC.pageTab!);
    expect(idle!.className).toContain(SPEC.pageTabIdle!);
    expect(selected!.className).toContain(SPEC.pageTab!);
    expect(selected!.className).toContain(SPEC.pageTabSelected!);
  });

  it("declares the inspector strip InspectorShell renders", () => {
    render(
      <InspectorShell
        scroll="panel"
        header={<div>header</div>}
        tabs={buildInspectorTabs({
          info: { label: "Info", content: <p>info</p> },
          coreTabs: [],
          addonTabs: [
            {
              entry: {
                id: "a",
                label: "manifest",
                priority: 10,
                addonName: "some-addon",
              },
              label: "Transcript",
              content: <p>transcript</p>,
            },
          ],
        })}
        resetKey="f1"
      />,
    );
    const strip = screen.getByTestId("inspector-tabs");
    const [selected, idle] = screen.getAllByRole("tab");

    expectSameClasses(strip.className, SPEC.inspectorStrip!);
    expect(idle!.className).toContain(SPEC.inspectorTab!);
    expect(idle!.className).toContain(SPEC.inspectorTabIdle!);
    expect(selected!.className).toContain(SPEC.inspectorTab!);
    expect(selected!.className).toContain(SPEC.inspectorTabSelected!);
  });
});

function renderBreadcrumb() {
  const { container } = render(
    <Breadcrumb driveName="Videos" folderPath="a/b/c" />,
  );
  const nav = container.querySelector("nav")!;
  const segments = nav.querySelectorAll(":scope > span");
  const ancestor = segments[0] as HTMLElement;
  const leaf = segments[segments.length - 1] as HTMLElement;
  return {
    nav,
    ancestor,
    leaf,
    link: ancestor.querySelector("a")!,
    label: leaf.querySelector("span")!,
  };
}

describe("SPEC-CORE-064/065 — the no-horizontal-scroll fixture's breadcrumb", () => {
  it("declares the row and the two segment shapes", () => {
    const crumb = renderBreadcrumb();

    expectSameClasses(crumb.nav.className, SPEC.breadcrumb!);
    expectSameClasses(
      crumb.ancestor.className,
      `${SPEC.breadcrumbSegment!} ${SPEC.breadcrumbAncestor!}`,
    );
    expectSameClasses(
      crumb.leaf.className,
      `${SPEC.breadcrumbSegment!} ${SPEC.breadcrumbLeaf!}`,
    );
    expectSameClasses(crumb.link.className, SPEC.breadcrumbLink!);
    expectSameClasses(crumb.label.className, SPEC.breadcrumbLabel!);
  });
});
