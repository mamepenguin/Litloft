import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { addonPresent } from "@/__tests__/helpers/addonPresent";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/addons/intelligence/api", () => ({
  fetchSceneSegments: vi.fn(),
  getFrameUrl: (id: string, t: number) => `/frame/${id}/${t}`,
}));

import { fetchSceneSegments } from "@/addons/intelligence/api";

afterEach(cleanup);

interface Markup {
  tag: string;
  class: string;
  attrs?: Record<string, string>;
  children?: Markup[];
}

const FIXTURE_HTML = readFileSync(
  join(__dirname, "..", "..", "..", "e2e-layout", "fixtures", "scene-candidates.html"),
  "utf8",
);

const SPEC: Record<string, Markup> & { skeletonCount: number } = JSON.parse(
  FIXTURE_HTML.match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

const normalise = (className: string) => className.split(/\s+/).filter(Boolean).join(" ");
const classOf = (el: Element) => normalise(el.getAttribute("class") ?? "");

/**
 * A node written without a `children` key is declared by class and the
 * attributes it lists, and the walk stops there. An attribute value of `"*"`
 * asks for presence only.
 */
function expectMarkup(el: Element, spec: Markup, where: string) {
  expect(el.tagName.toLowerCase(), `${where}: element`).toBe(spec.tag);
  expect(classOf(el), `${where}: class`).toBe(normalise(spec.class));

  for (const [name, value] of Object.entries(spec.attrs ?? {})) {
    if (value === "*") {
      expect(el.hasAttribute(name), `${where}: missing [${name}]`).toBe(true);
    } else {
      expect(el.getAttribute(name), `${where}: [${name}]`).toBe(value);
    }
  }

  if (spec.children === undefined) return;

  expect(
    Array.from(el.attributes)
      .map((a) => a.name)
      .filter((name) => name !== "class")
      .sort(),
    `${where}: attributes`,
  ).toEqual(Object.keys(spec.attrs ?? {}).sort());

  const kids = Array.from(el.children);
  expect(kids, `${where}: children`).toHaveLength(spec.children.length);
  spec.children.forEach((child, i) => {
    expectMarkup(kids[i], child, `${where} > [${i}] ${child.tag}`);
  });
}

const present = addonPresent(resolve(__dirname, "..", "..", "..", ".."), "addons/intelligence");

async function renderSection() {
  const { default: Section } = await import("@/addons/intelligence/SceneCandidatesSection");
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(
      <Section
        query="cats"
        drive="main"
        includeSceneClip
        typeFilter={null}
        smartFolderId={null}
      />,
    );
  });
  return view;
}

const segment = {
  file_id: "f1",
  filename: "holiday.mp4",
  start: 83,
  end: 96,
  peak: 84,
  score: 0.4,
};

describe.skipIf(!present)("the scene-candidates layout fixture's markup table", () => {
  it("matches the component while loading", async () => {
    vi.mocked(fetchSceneSegments).mockReturnValue(new Promise(() => {}));
    const { container } = await renderSection();

    const section = container.firstElementChild!;
    expectMarkup(section, SPEC.section, "section");
    const [head, row] = Array.from(section.children);
    expectMarkup(head, SPEC.head, "head");
    expectMarkup(head.children[0], SPEC.title, "title");
    expectMarkup(head.children[1], SPEC.status, "status");
    expect(head.children).toHaveLength(2);
    expectMarkup(row, SPEC.row, "row");
    expect(row.getAttribute("aria-busy")).toBe("true");
    expect(row.children).toHaveLength(SPEC.skeletonCount);
    Array.from(row.children).forEach((skeleton, i) =>
      expectMarkup(skeleton, SPEC.skeleton, `skeleton ${i}`),
    );
  });

  it("matches the component with candidates", async () => {
    vi.mocked(fetchSceneSegments).mockResolvedValue({
      query: "cats",
      segments: [segment, { ...segment, file_id: "f2" }],
      partial: false,
    });
    const { container } = await renderSection();
    await screen.findAllByText("holiday.mp4");

    const section = container.firstElementChild!;
    const [head, row] = Array.from(section.children);
    expectMarkup(section, SPEC.section, "section");
    expectMarkup(head, SPEC.head, "head");
    expect(head.children).toHaveLength(1);
    expectMarkup(head.children[0], SPEC.title, "title");
    expectMarkup(row, SPEC.row, "row");
    expect(row.getAttribute("aria-busy")).toBe("false");
    expect(row.children).toHaveLength(2);
    Array.from(row.children).forEach((card, i) => expectMarkup(card, SPEC.card, `card ${i}`));
  });
});
