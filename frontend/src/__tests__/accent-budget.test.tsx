import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";

import { FolderToolbar } from "@/components/folder/FolderToolbar";
import { RootFileListing } from "@/components/RootFileListing";
import type { FileItem } from "@/types";

/**
 * Stubbed, and it costs this file a blind spot worth naming: an addon
 * contributing a control to a core screen spends from the same budget,
 * and the folder toolbar still draws `folder-actions` beside the Add
 * menu. `FolderAIActionsButton` is bordered, so nothing is over budget
 * today — but that is the addon's choice, not this file's guarantee.
 *
 * The stub is not a shortcut. `frontend/src/addons/*` is a set of
 * gitignored symlinks into the `addons/*` submodules, materialised by
 * `setup-addons.sh` (`.github/workflows/ci.yml`), so a core assertion
 * about an addon's pixels would pass or fail on what a checkout happens
 * to hold — the failure `button-adoption.test.ts` was already fixed for
 * once. Addon-owned screens are counted in the addon's own repository
 * instead.
 */
vi.mock("@/components/AddonSlot", () => ({ AddonSlot: () => null }));

// Everything below is scaffolding for the drive root: it needs a router, a
// data source and a grid before it will draw its toolbar at all. `Button`
// and `AddButton` are deliberately real — they are what is being measured.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/link", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
vi.mock("@/components/UploadZone", () => ({
  UploadZone: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/SortButton", () => ({ SortButton: () => <button>sort</button> }));
vi.mock("@/components/TreeToggle", () => ({ TreeToggle: () => <button>tree</button> }));
vi.mock("@/components/SelectionBar", () => ({ SelectionBar: () => null }));
vi.mock("@/components/EmptyState", () => ({ EmptyState: () => <div /> }));
vi.mock("@/components/FileGrid", () => ({ FileGrid: () => <div data-testid="grid" /> }));
vi.mock("@/components/FileList", () => ({ FileList: () => <div data-testid="list" /> }));

const mockGetDriveFiles = vi.fn();
vi.mock("@/lib/api", () => {
  class ApiStatusError extends Error {
    constructor(readonly status: number, message: string) {
      super(message);
      this.name = "ApiStatusError";
    }
  }
  return {
    ApiStatusError,
    getDriveFiles: (...args: unknown[]) => mockGetDriveFiles(...args),
    scanDrive: vi.fn(),
    createFolder: vi.fn(),
  };
});

function playableFile(): FileItem {
  return {
    id: "f1", filename: "a.mp4", title: "a", description: "", drive: "main",
    folder_path: "", file_type: "video", mime_type: "video/mp4",
    thumbnail_url: "", has_thumbnail: false, file_size: 1, duration: 10,
    liked_at: null, is_favorite: false, tags: [], subtitles: [],
    deleted_at: null, missing_since: null, trust_tier: "verified",
    trust_reviewed_at: null, created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

/**
 * One accent fill per screen (DESIGN.md §2.2, 00-basis 原則 2).
 *
 * The folder toolbar carried three at once — upload, play-all and the
 * selected half of the view toggle — which is the state §2.2 describes as
 * "the screen has not decided what it is for". This holds the budget
 * mechanically, because a fourth is one `className` away and nothing else
 * in the tree would notice.
 *
 * **A fill at rest, not the token.** `bg-accent/10` is a tint behind a
 * hovered row and `bg-accent-teal` is a different colour, so neither is
 * this utility at all. Of the utility itself, the only thing excluded is
 * a fill that needs an ongoing interaction to be visible at all.
 *
 * **The exclusion is a closed set of five pointer/keyboard states, not a
 * list of variants to skip**, and that shape is the point. A skip-list
 * fails towards a *missed* second fill, and this detector's cheap error
 * is the other one — a false positive costs a review comment, a false
 * negative ships the thing the rule exists to prevent. Two drafts of it
 * were wrong in the expensive direction: the first excluded every
 * prefixed token ("they only paint under a pointer" — true of `hover:`,
 * false of `sm:` and `dark:`), and the second still skipped `enabled:`,
 * `visited:`, `target:`, and the whole `aria-` and `data-` families.
 * Those last two are not pseudo-classes but open prefixes whose common
 * members are resting states — `aria-selected`, `data-[state=open]` —
 * so a selected-state fill written that way passed silently, which is
 * the exact case the paragraph above it in `DESIGN.md` §2.2 is about.
 * `data-[theme=dark]:` also contradicted that draft's own sentence about
 * theme variants, since `data-theme` is how this app switches theme
 * (`globals.css`).
 *
 * `disabled:` counts too, deliberately: a disabled control is sitting
 * there filled, which `DESIGN.md` §6 names as its own defect.
 *
 * **Two known limits, both on the cheap side.** A colon inside an
 * arbitrary variant is split on like any other — `[&:hover]:bg-accent`
 * and `has-[:hover]:bg-accent` are counted though they paint only under
 * a pointer — and `starting:` (`@starting-style`) is counted though it
 * paints for one frame. Both cost a review comment on a control nobody
 * writes that way today; a bracket-aware splitter would be more surface
 * to get wrong than the thing it protects, which is how the two earlier
 * drafts of this rule went wrong.
 */
const ACCENT_FILLS = new Set(["bg-accent", "bg-accent-cta"]);

/** The five states a fill can need an ongoing interaction to be seen in. */
const INTERACTION_STATES = new Set([
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "active",
]);

/**
 * Prefixes that relay one of those from another element, unchanged.
 *
 * Repeated, because they compose: `group-has-hover:` is one hover
 * relayed twice. Stripping once left it unrecognised.
 */
const RELAY = /^((group|peer|has|in)-)+/;

/**
 * There is no step here that strips arbitrary values, and there was one.
 *
 * It claimed to stop `data-[state=active]` being read as `active`, and
 * deleting it changed no verdict in the table below: the comparison is
 * for a whole name, and `data-[state=active]` is not `active` with the
 * brackets left on. Worse, stripping is the one direction that can
 * *create* a match — `group-hover[x]` would reduce to `hover` — which is
 * the expensive failure. A guard whose removal breaks nothing was
 * protecting against nothing.
 */
function isInteractionVariant(variant: string): boolean {
  // A named group or peer suffixes the variant: `group-hover/sidebar:`.
  // Standard syntax, and without this the name made the whole variant
  // unrecognisable — a hover fill would have failed a build.
  const unnamed = variant.replace(/\/.*$/, "");
  // `not-hover:` is deliberately not relayed — it paints when the pointer
  // is *away*, which is the resting case.
  return INTERACTION_STATES.has(unnamed.replace(RELAY, ""));
}

function isRestingAccentFill(token: string): boolean {
  const parts = token.split(":");
  const utility = parts.pop() ?? "";
  if (!ACCENT_FILLS.has(utility)) return false;
  return !parts.some(isInteractionVariant);
}

export function accentFills(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("[class]")].filter((el) =>
    // `getAttribute`, not `el.className`: on an SVG element `className` is
    // an `SVGAnimatedString`, whose `toString()` is the literal
    // "[object SVGAnimatedString]". lucide passes `className` straight to
    // its `<svg>`, so a fill put on an icon read as no classes at all.
    (el.getAttribute("class") ?? "").split(/\s+/).some(isRestingAccentFill),
  );
}

const folderProps = {
  isSpecialView: false,
  isFolderAnchored: true,
  tagFilter: null,
  hasPlayableFiles: false,
  sort: "created_at" as const,
  order: "desc" as const,
  typeFilter: null,
  total: 42,
  selectable: false,
  scanning: false,
  creatingFolder: false,
  newFolderName: "",
  folderError: null,
  fileIds: ["file-1"],
  drive: "test-drive",
  viewMode: "grid" as const,
  onSortChange: vi.fn(),
  onTypeFilterChange: vi.fn(),
  onTrustFilterChange: vi.fn(),
  onViewChange: vi.fn(),
  onToggleSelectable: vi.fn(),
  onScan: vi.fn(),
  onPlayAll: vi.fn(),
  onSetCreatingFolder: vi.fn(),
  onSetNewFolderName: vi.fn(),
  onSetFolderError: vi.fn(),
  onCreateFolder: vi.fn(),
  onCreateFile: vi.fn(),
  onReshuffle: vi.fn(),
};

/**
 * The **core** screens under the budget, named here so the set cannot be
 * narrowed by choosing what to render. Phase 3 B2c adds the three that
 * are left — Trash, Missing and a collection.
 *
 * Ask, Find and Media Import are not on this list and are not omissions:
 * they are addon-owned pages, and the assertion for them belongs beside
 * their components, in C1 and C2. An earlier draft of this comment
 * promised all six from here while the stub two blocks up explained why
 * three of them could not be reached — a list and its own impossibility
 * in one file. Ask and Find are accent-filled today
 * (`addons/intelligence/frontend/Page.tsx`, `pages/find.tsx`), so
 * whoever writes C2 is inheriting work, not confirming a clean slate.
 *
 * The drive root is here rather than in B2c because it draws the same
 * three controls as the folder toolbar from its own copy of the markup,
 * and a rule stated in `DESIGN.md` while a screen this PR edits breaks it
 * is not a rule.
 */
const SCREENS = ["folder toolbar", "drive root"] as const;

/**
 * The classifier, pinned directly.
 *
 * Reaching it only through a rendered screen means the table below is
 * whatever the screens happen to use, and every wrong entry two earlier
 * drafts had was a variant no screen used yet.
 */
describe("what counts as a fill at rest", () => {
  const has = (token: string) => {
    const el = document.createElement("div");
    el.setAttribute("class", token);
    const box = document.createElement("div");
    box.appendChild(el);
    return accentFills(box).length === 1;
  };

  it.each([
    // Plain, and variants that change nothing about being at rest.
    "bg-accent",
    "bg-accent-cta",
    "sm:bg-accent",
    "dark:bg-accent",
    "print:bg-accent",
    // Resting states that earlier drafts skipped. `enabled:` is the
    // complement of `disabled:` and is this repo's own idiom
    // (`Button.tsx` writes `enabled:hover:`); `disabled:bg-accent` is the
    // defect DESIGN.md §6 names; the `aria-`/`data-` families are mostly
    // selected-state, which §2.2 asks to be a border and not a fill.
    "enabled:bg-accent",
    "disabled:bg-accent",
    "visited:bg-accent",
    "target:bg-accent",
    "aria-selected:bg-accent",
    "aria-current:bg-accent",
    "aria-pressed:bg-accent",
    "data-[state=active]:bg-accent",
    "data-[theme=dark]:bg-accent",
    // Paints when the pointer is away — the resting half of a hover pair.
    "not-hover:bg-accent",
    // Relayed *resting* states, which the relay prefixes must not swallow.
    "group-data-[state=active]:bg-accent",
    "data-[state=hover]:bg-accent",
    // The row that makes the absent bracket-stripping step load-bearing:
    // with it, this reduces to `hover` and a resting fill goes unseen.
    "group-hover[x]:bg-accent",
    "peer-checked:bg-accent",
    "group-aria-selected:bg-accent",
  ])("counts %s", (token) => expect(has(token)).toBe(true));

  it.each([
    "hover:bg-accent",
    "focus:bg-accent",
    "focus-visible:bg-accent",
    "focus-within:bg-accent",
    "active:bg-accent",
    "group-hover:bg-accent",
    "peer-focus:bg-accent",
    "group-active:bg-accent",
    "has-hover:bg-accent",
    "in-hover:bg-accent",
    // Relays compose, so the prefix is stripped as many times as it is
    // written.
    "group-has-hover:bg-accent",
    // A named group or peer. Standard syntax, and the name used to make
    // the variant unrecognisable — a hover fill failing a build.
    "group-hover/sidebar:bg-accent",
    "peer-focus/email:bg-accent",
    // One interaction anywhere in the chain is enough.
    "sm:hover:bg-accent",
    "dark:group-hover:bg-accent",
  ])("does not count %s", (token) => expect(has(token)).toBe(false));

  it.each([
    "bg-accent/10",
    "bg-accent-hover",
    "bg-accent-teal",
    "border-accent",
    "text-accent",
  ])("does not count %s, which is not this fill at all", (token) =>
    expect(has(token)).toBe(false),
  );
});

describe("accent budget", () => {
  afterEach(cleanup);

  it("covers the screens it says it covers", () => {
    expect([...SCREENS]).toEqual(["folder toolbar", "drive root"]);
  });

  describe("folder toolbar", () => {
    // The toolbar draws its left group twice, once for each breakpoint, and
    // only one is visible — jsdom applies no stylesheet, so both are in the
    // tree. Counting distinct labels rather than nodes is what makes "one
    // fill" mean one control instead of one element.
    const fillLabels = (root: HTMLElement) =>
      [...new Set(accentFills(root).map((el) => el.textContent?.trim() ?? ""))];

    it("spends its one fill on Add, in an ordinary folder", () => {
      const { container } = render(<FolderToolbar {...folderProps} />);
      expect(fillLabels(container)).toEqual(["Add"]);
    });

    it("still spends only one when the folder can be played", () => {
      // Play is a first-class action here and stays exposed (hako
      // `55N_yML35Q2jdVBsCxc06`), so this is the case where a second fill
      // used to appear.
      const { container } = render(
        <FolderToolbar {...folderProps} hasPlayableFiles />,
      );
      expect(screen.getAllByRole("button", { name: "Play" }).length).toBeGreaterThan(0);
      expect(fillLabels(container)).toEqual(["Add"]);
    });

    it("still spends only one while a folder is being named", () => {
      // The inline Create button was a second fill, on the bar at the same
      // time as Add. Named rather than counted: `<= 1` would pass just as
      // well if Create were the one that survived and Add had lost its fill.
      const { container } = render(
        <FolderToolbar {...folderProps} creatingFolder />,
      );
      expect(fillLabels(container)).toEqual(["Add"]);
    });

    it("spends none in search mode, where nothing can be added", () => {
      const { container } = render(
        <FolderToolbar {...folderProps} isSearch isFolderAnchored={false} />,
      );
      expect(accentFills(container)).toHaveLength(0);
    });

    it("spends none in an empty special view", () => {
      const { container } = render(
        <FolderToolbar
          {...folderProps}
          isSpecialView
          isFolderAnchored={false}
          total={0}
          folderCount={0}
        />,
      );
      expect(accentFills(container)).toHaveLength(0);
    });
  });
});

describe("accent budget — drive root", () => {
  beforeEach(() => {
    mockGetDriveFiles.mockReset();
    mockGetDriveFiles.mockResolvedValue({ data: [playableFile()], meta: { total: 1 } });
  });
  afterEach(cleanup);

  it("spends its one fill on Add, with something playable in the drive", async () => {
    const { container } = render(<RootFileListing driveName="main" />);
    // Play only appears once the listing knows it holds something playable.
    expect(await screen.findByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(
      [...new Set(accentFills(container).map((el) => el.textContent?.trim() ?? ""))],
    ).toEqual(["Add"]);
  });

  it("still spends only one while a folder is being named", async () => {
    // The inline Create is the folder toolbar's twin, in this screen's own
    // copy of the markup. Reaching it means going through the Add menu,
    // which is the only way the row opens now.
    const { container } = render(<RootFileListing driveName="main" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByText("New Folder"));
    expect(screen.getByPlaceholderText("Folder name...")).toBeInTheDocument();
    expect(
      [...new Set(accentFills(container).map((el) => el.textContent?.trim() ?? ""))],
    ).toEqual(["Add"]);
  });
});
