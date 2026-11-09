import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
} from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Tag } from "lucide-react";

import { writeAppPrefs } from "@/lib/appPrefs";
import { BOOK_GRID, cardGridTemplate } from "@/lib/cardGrid";
import type { ShelfItem } from "@/lib/api";

const DRIVE = "main";

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

vi.mock("next/navigation", () => ({
  usePathname: () => "/drive/main/apps/reading",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ProfileProvider", () => ({
  useProfile: () => ({
    nickname: "alice",
    setNickname: vi.fn(),
    clearNickname: vi.fn(),
  }),
}));

const getShelves = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getShelves: (...args: unknown[]) => getShelves(...args),
  getDriveFiles: vi.fn(async () => ({
    data: [],
    meta: { total: 0, page: 1, limit: 1 },
  })),
  getSmartFolders: vi.fn(async () => []),
  getDriveTags: vi.fn(async () => []),
  getThumbnailUrl: (id: string) => `/api/files/${id}/thumbnail`,
}));

vi.mock("@/lib/cardGrid", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cardGrid")>()),
  useCardColumns: () => ({ ref: () => {}, columns: 2 }),
}));

import { ShelfBlock } from "../appshell/ShelfBlock";
import { ToolbarMenu } from "../ToolbarMenu";
import { AppTabs } from "../appshell/AppTabs";
import { DiscoverFace as ReadingDiscoverFace } from "../readingapp/DiscoverFace";
import { DiscoverFace as VideoDiscoverFace } from "../videoapp/DiscoverFace";
import { ReadingApp } from "../readingapp/ReadingApp";
import { VideoApp } from "../videoapp/VideoApp";

type Markup = {
  tag: string;
  class: string;
  attrs?: Record<string, string>;
  children?: Markup[];
  ref?: string;
  source?: string;
};

const FIXTURE = join(
  __dirname,
  "..",
  "..",
  "..",
  "e2e-layout",
  "fixtures",
  "reading-video-faces.html",
);

const SHAPES: Record<string, Markup> = JSON.parse(
  readFileSync(FIXTURE, "utf8").match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

const SHAPE_COUNT = 15;

const SOURCES = [
  "AppTabs",
  "ReadingDiscoverFace",
  "ReadingLibraryFace",
  "ShelfBlock",
  "ToolbarMenu",
  "VideoDiscoverFace",
  "VideoLibraryFace",
];

const tokens = (className: string) => className.split(/\s+/).filter(Boolean);
const normalise = (className: string) => tokens(className).join(" ");
const classOf = (el: Element) => normalise(el.getAttribute("class") ?? "");

const expand = (spec: Markup): Markup => {
  if (spec.ref) return expand(SHAPES[spec.ref]);
  return {
    ...spec,
    children: spec.children?.map(expand),
  };
};

function expectMarkup(el: Element, declared: Markup, where: string) {
  const spec = expand(declared);
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
  expect(
    kids.map((k) => `${k.tagName.toLowerCase()}.${classOf(k)}`),
    `${where}: children`,
  ).toHaveLength(spec.children.length);
  spec.children.forEach((child, i) => {
    expectMarkup(kids[i], child, `${where} > [${i}] ${child.tag}`);
  });
}

function shelfItem(id: string): ShelfItem {
  return {
    id,
    filename: `${id}.pdf`,
    title: `Book ${id}`,
    description: "",
    drive: DRIVE,
    folder_path: "Books",
    file_type: "document",
    mime_type: "application/pdf",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 1024,
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
  };
}

const ITEMS = Array.from({ length: 12 }, (_, i) => shelfItem(`c${i}`));

const loaded = { state: { status: "loaded" as const, data: ITEMS }, retry: () => {} };

function shelfSource() {
  return { status: "loaded" as const, items: ITEMS };
}

async function renderShape(name: string): Promise<Element> {
  const spec = SHAPES[name];

  switch (spec.source) {
    case "ShelfBlock": {
      const reading = name === "readingShelf";
      const { container } = render(
        <ShelfBlock
          title="Shelf"
          count="12"
          seeAllHref="/drive/main/apps/reading/shelf?by=all&key=all"
          view={shelfSource()}
          onRetry={() => {}}
          book={reading}
          renderItem={() => (
            <div
              className={
                reading
                  ? "aspect-[2/3] rounded-xl bg-bg-elevated"
                  : "aspect-video rounded-2xl bg-bg-elevated"
              }
            />
          )}
        />,
      );
      const root = container.querySelector("section");
      expect(root).not.toBeNull();
      const grid = root!.querySelector("ul") as HTMLElement;
      expect(grid.style.gridTemplateColumns).toBe(
        cardGridTemplate(2, reading ? BOOK_GRID : undefined),
      );
      return root!;
    }

    case "ReadingDiscoverFace": {
      const { container } = render(
        <ReadingDiscoverFace
          drive={DRIVE}
          empty={false}
          hasProfile
          continueShelf={loaded}
          notRead={loaded}
          fresh={loaded}
        />,
      );
      return container.firstElementChild as Element;
    }

    case "VideoDiscoverFace": {
      const { container } = render(
        <VideoDiscoverFace
          drive={DRIVE}
          empty={false}
          hasProfile
          continueShelf={loaded}
          recommended={loaded}
          addonShelves={[{ id: "addon", title: "Addon shelf", ...loaded }]}
          fresh={loaded}
        />,
      );
      return container.firstElementChild as Element;
    }

    case "ReadingLibraryFace": {
      const { container } = render(<ReadingApp drive={DRIVE} />);
      const chips = await screen.findByTestId("reading-chips");
      await screen.findByRole("button", { name: "Novels" });

      if (name === "readingChips") return chips;
      if (name === "readingChipSelected") return chips.children[0];
      if (name === "readingChipIdle") return chips.children[1];
      if (name === "readingControls") {
        const tag = screen.getByRole("button", { name: /^Tag/ });
        return tag.parentElement!.parentElement!;
      }
      return container;
    }

    case "VideoLibraryFace": {
      render(<VideoApp drive={DRIVE} />);
      const classification = await screen.findByRole("button", {
        name: /^Classification/,
      });
      return classification.parentElement!.parentElement!;
    }

    case "AppTabs": {
      const { container } = render(
        <AppTabs
          label="Reading views"
          current="discover"
          onSelect={() => {}}
          discoverLabel="Discover"
          libraryLabel="Library"
          panelId="panel"
          idPrefix="reading-app"
        />,
      );
      const nav = container.querySelector("nav")!;
      if (name === "tabs") return nav;
      const buttons = nav.querySelectorAll("button");
      return name === "tabSelected" ? buttons[0] : buttons[1];
    }

    case "ToolbarMenu": {
      const filled = name.startsWith("menuButtonFilled");
      const { container } = render(
        <ToolbarMenu
          label="Tag"
          value="Tag"
          icon={Tag}
          showLabel
          filled={filled}
          className={name === "menuButtonFilledEnd" ? "min-w-0 ml-auto" : "min-w-0"}
        >
          {() => null}
        </ToolbarMenu>,
      );
      return container.firstElementChild as Element;
    }

    default:
      throw new Error(`no renderer for ${spec.source}`);
  }
}

beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe(el: Element) {
        this.cb(
          [{ isIntersecting: true, target: el } as unknown as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = "";
      thresholds = [];
    },
  );
});

afterAll(() => vi.unstubAllGlobals());

beforeEach(() => {
  writeAppPrefs(DRIVE, { face: "library" }, "reading");
  writeAppPrefs(DRIVE, { face: "library" }, "video");
  getShelves.mockReset().mockImplementation(async (_drive, params: Record<string, unknown>) => {
    if (params.by === "folder") {
      return {
        by: "folder",
        base: "Books",
        total_shelves: 2,
        shelves: [
          { key: "Books/", label: "Books", count: 2, items: ITEMS.slice(0, 2) },
          { key: "Books/Novels", label: "Novels", count: 2, items: ITEMS.slice(0, 2) },
        ],
      };
    }
    if (params.per_shelf === 1) {
      return {
        by: params.by,
        total_shelves: 1,
        shelves: [{ key: "all", label: "", count: 2, items: [] }],
      };
    }
    return {
      by: params.by,
      total_shelves: 1,
      shelves: [{ key: "all", label: "", count: 2, items: ITEMS.slice(0, 2) }],
    };
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const registered: string[] = [];

const shapeCaseId = (shape: string) =>
  `renders ${shape} exactly as the table declares it`;

describe("the faces' layout fixture", () => {
  it("has one row per declared shape, and no other", () => {
    expect(Object.keys(SHAPES)).toHaveLength(SHAPE_COUNT);
    expect(
      [...new Set(Object.values(SHAPES).map((shape) => shape.source))].sort(),
    ).toEqual(SOURCES);
  });

  for (const shape of Object.keys(SHAPES)) {
    it(shapeCaseId(shape), async () => {
      expectMarkup(await renderShape(shape), SHAPES[shape], shape);
    });
    registered.push(shapeCaseId(shape));
  }
});

it("registered a case for every shape the table declares", () => {
  expect(registered).toEqual(Object.keys(SHAPES).map(shapeCaseId));
});
