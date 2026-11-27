/**
 * The browser fixture hand-writes the components' markup, because the
 * layout spec measures a page with no Next.js server behind it. This keeps
 * a class list in the fixture from drifting away from the component while
 * the browser cases go on passing against the stale shape.
 *
 * The add-on policy table has its own fixture and parity test under
 * `src/app/admin/settings/__tests__/`.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

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
