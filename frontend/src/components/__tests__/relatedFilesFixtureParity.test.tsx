import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { FileRelationsResponse } from "@/lib/api";

vi.mock("../AddonSlot", () => ({ AddonSlot: () => null }));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { RelatedPanel } from "../FileDetail/related/RelatedPanel";

afterEach(cleanup);

interface Markup {
  tag: string;
  class: string;
  attrs?: Record<string, string>;
  children?: Markup[];
}

const FIXTURE = join(
  __dirname,
  "..",
  "..",
  "..",
  "e2e-layout",
  "fixtures",
  "related-files.html",
);

const FIXTURE_HTML = readFileSync(FIXTURE, "utf8");

const SHAPES: Record<string, Markup> = JSON.parse(
  FIXTURE_HTML.match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

const SHAPE_COUNT = 4;

const tokens = (className: string) => className.split(/\s+/).filter(Boolean);
const normalise = (className: string) => tokens(className).join(" ");
const classOf = (el: Element) => normalise(el.getAttribute("class") ?? "");

/**
 * A node written without a `children` key is declared partially on
 * purpose and stops the walk — used here for the lucide `<svg>`s, whose
 * `<path>` data is a drawing and moves no box.
 *
 * An attribute value of `"*"` asks for presence only.
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

type Relation = FileRelationsResponse["relations"][number];

const relation = (over: Partial<Relation["file"]>, id: number): Relation => ({
  relation_id: id,
  kind: "related",
  direction: "outgoing",
  origin: "internal",
  created_at: "2026-09-08T00:00:00Z",
  created_by: null,
  file: {
    id: `f${id}`.padEnd(12, "x"),
    drive: "test-drive",
    filename: "4822843331_db5bab77bb_o.jpg",
    title: "4822843331_db5bab77bb_o",
    folder_path: "test_images",
    file_type: "image",
    mime_type: "image/jpeg",
    thumbnail_url: "/api/files/x/thumbnail",
    has_thumbnail: true,
    file_size: 1234,
    duration: null,
    missing_since: null,
    created_at: "2026-09-08T00:00:00Z",
    updated_at: "2026-09-08T00:00:00Z",
    ...over,
  },
});

const STATES: Record<string, Relation> = {
  thumbnail: relation({}, 1),
  // For the media guard below: this codebase mounts a `<video>` behind
  // `file_type === "video"` plus a hover delay, so states that are all
  // images and documents never walk that branch.
  video: relation(
    { filename: "clip.mp4", file_type: "video", mime_type: "video/mp4", duration: 1935 },
    4,
  ),
  icon: relation(
    {
      filename: "notes.md",
      file_type: "document",
      mime_type: "text/markdown",
      has_thumbnail: false,
    },
    2,
  ),
  missing: relation(
    {
      filename: "gone.md",
      file_type: "document",
      mime_type: "text/markdown",
      has_thumbnail: false,
      missing_since: "2026-09-01T00:00:00Z",
    },
    3,
  ),
};

async function renderTile(state: Relation): Promise<HTMLElement> {
  const { container } = render(
    <RelatedPanel relations={[state]} addonSlotProps={{}} />,
  );
  await screen.findByRole("link");
  return container.querySelector<HTMLElement>(".related-files-grid > a")!;
}

/**
 * In the loop below, `it()` comes first and `push` second: recorded first,
 * anything between them keeps the record and loses the registration.
 *
 * The guard is the last case in the file. Vitest collects every `it` in a
 * file before it runs any of them, so by the time it executes the loop
 * has finished registering.
 */
const registered: string[] = [];

const tileCaseId = (name: string) => `matches the component's ${name} tile`;

describe("the related-files layout fixture's markup table", () => {
  it("declares exactly the shapes the states below render", () => {
    expect(Object.keys(SHAPES).sort()).toEqual(Object.keys(STATES).sort());
    expect(Object.keys(SHAPES)).toHaveLength(SHAPE_COUNT);
  });

  for (const [name, state] of Object.entries(STATES)) {
    it(tileCaseId(name), async () => {
      expectMarkup(await renderTile(state), SHAPES[name], name);
    });
    registered.push(tileCaseId(name));
  }

  it("names the host and grid classes the fixture builds", async () => {
    await renderTile(STATES.thumbnail);
    const host = document.querySelector(".related-files-host")!;
    const grid = host.firstElementChild!;
    expect(classOf(host)).toBe("related-files-host");
    expect(classOf(grid)).toBe("related-files-grid grid gap-x-2 gap-y-0.5");
    expect(FIXTURE_HTML).toContain('host.className = "related-files-host"');
    expect(FIXTURE_HTML).toContain(
      'grid.className = "related-files-grid grid gap-x-2 gap-y-0.5"',
    );
  });
});

describe("no media in the containment scope", () => {
  // On iOS Safari a containment context wrapped around a `<video>`,
  // `<audio>` or cross-origin iframe renders the whole subtree rotated and
  // continuously spinning, and no desktop browser shows it. `VideoPreview`
  // mounts its `<video>` only after hover, so first paint is not enough.
  const media = (root: Element) =>
    root.querySelectorAll("video, audio, iframe, object, embed");

  it("holds no media before or after the interaction that mounts one", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const swept: string[] = [];
    try {
      for (const [name, state] of Object.entries(STATES)) {
        cleanup();
        await renderTile(state);
        const host = document.querySelector(".related-files-host")!;
        expect(media(host), "on first paint").toHaveLength(0);

        // On every element in the scope: `mouseenter` does not bubble and
        // React derives `onMouseEnter` from it, so firing on an ancestor
        // reaches nothing.
        for (const el of [host, ...host.querySelectorAll("*")]) {
          fireEvent.mouseOver(el);
          fireEvent.mouseEnter(el);
          fireEvent.pointerEnter(el);
          fireEvent.focus(el);
          fireEvent.touchStart(el, { touches: [{ clientX: 0, clientY: 0 }] });
        }
        await act(async () => {
          vi.advanceTimersByTime(2000);
        });
        expect(media(host), "after hover").toHaveLength(0);
        swept.push(name);
      }
    } finally {
      vi.useRealTimers();
    }
    expect(swept).toEqual(Object.keys(STATES));
  });

  it("contains nothing but the grid, and nothing but tiles inside it", async () => {
    const { container } = render(
      <RelatedPanel
        relations={Object.values(STATES).map((r, i) => ({
          ...r,
          relation_id: i + 1,
        }))}
        addonSlotProps={{}}
      />,
    );
    await screen.findAllByRole("link");

    const host = container.querySelector(".related-files-host")!;
    expect(Array.from(host.children).map((c) => classOf(c))).toEqual([
      "related-files-grid grid gap-x-2 gap-y-0.5",
    ]);
    const grid = host.firstElementChild!;
    expect(
      Array.from(grid.children).map((c) => c.tagName.toLowerCase()),
    ).toEqual(Object.keys(STATES).map(() => "a"));
  });
});

it("registered a case for every state the fixture declares", () => {
  expect(registered).toEqual(Object.keys(STATES).map(tileCaseId));
});
