// AddonPolicySection test (RED phase)
//
// Choices:
// - Component fetches both /api/admin/config/addon-policy AND /api/addons/status
//   (manifest list) on mount, in any order.
// - Policy shape: { driveName: { addonName: bool | { feature: bool } } }
// - Toggling a checkbox triggers PUT /api/admin/config/addon-policy with the full
//   updated policy object.
// - Errors render inline.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { AddonPolicySection } from "@/app/admin/settings/AddonPolicySection";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const initialPolicy = {
  main: { intelligence: true, knowledge: false },
  private: { intelligence: false, knowledge: true },
};

const addonsStatusResponse = {
  addons: {
    intelligence: {
      scope: "drive",
      policy_features: [
        {
          name: "transcription_cloud",
          default: true,
          i18n_key: "intelligence.policyFeatures.transcriptionCloud",
        },
      ],
    },
    knowledge: { scope: "drive" },
  },
  slots: {},
};

function setupSuccessfulLoads() {
  // Both calls can occur; mockImplementation routes based on URL.
  mockFetch.mockImplementation((url: string) => {
    if (url === "/api/admin/config/addon-policy") {
      return Promise.resolve(jsonResponse(initialPolicy));
    }
    if (url === "/api/addons/status") {
      return Promise.resolve(jsonResponse(addonsStatusResponse));
    }
    return Promise.resolve(jsonResponse({ ok: true }));
  });
}

/**
 * Real backends label their addons; the identifier is the fallback.
 *
 * `label` is optional on `AddonStatusEntry` — `adminConfig.ts` says so
 * where it parses the response, and tolerating a backend that omits it is
 * the reason the fallback exists. So one entry here carries a label and
 * one does not, in the same fixture.
 */
const labelledStatusResponse = {
  addons: {
    intelligence: {
      ...addonsStatusResponse.addons.intelligence,
      label: "Intelligence",
    },
    knowledge: { scope: "drive" },
  },
  slots: {},
};

function setupLabelledLoads() {
  mockFetch.mockImplementation((url: string) => {
    if (url === "/api/admin/config/addon-policy") {
      return Promise.resolve(jsonResponse(initialPolicy));
    }
    if (url === "/api/addons/status") {
      return Promise.resolve(jsonResponse(labelledStatusResponse));
    }
    return Promise.resolve(jsonResponse({ ok: true }));
  });
}

describe("AddonPolicySection column headings", () => {
  it("names an addon the way a person would, and falls back to the identifier", async () => {
    setupLabelledLoads();
    render(<AddonPolicySection />);
    const heads = await screen.findAllByRole("columnheader");
    const text = heads.map((h) => h.textContent?.trim());
    expect(text).toContain("Intelligence");
    // The unlabelled one is still drawn, under its identifier, rather than
    // the column vanishing or the row falling over.
    expect(text).toContain("knowledge");
    expect(text).not.toContain("intelligence");
  });

  /**
   * The accessible name keeps the identifiers even though the heading no
   * longer shows them. It has to be unique across the page, and `label` is
   * neither required nor guaranteed distinct.
   */
  it("addresses a cell by identifier even where the heading reads otherwise", async () => {
    setupLabelledLoads();
    render(<AddonPolicySection />);
    expect(
      await screen.findByRole("checkbox", { name: "main / intelligence" }),
    ).toBeInTheDocument();
  });
});

describe("AddonPolicySection layout", () => {
  it("puts the feature's name in the row-header column and its switch in the addon's", async () => {
    setupSuccessfulLoads();
    render(<AddonPolicySection />);
    const row = await screen.findByTestId(
      "feature-row-main-intelligence-transcription_cloud",
    );
    const cells = Array.from(row.children);
    // Column 0 is the row header; the switch belongs to intelligence's
    // column, which is column 1. Reading them positionally is the point —
    // "the toggle is under the checkbox that governs it" is a claim about
    // which cell it is in, and nothing else says it.
    expect(cells[0]!.textContent).toContain("↳");
    expect(cells[0]!.querySelector('[role="switch"]')).toBeNull();
    const switchCell = cells.find((c) => c.querySelector('[role="switch"]'))!;
    expect(cells.indexOf(switchCell)).toBe(1);
    expect(switchCell.className).toContain("text-center");
  });

  /**
   * A state, not a call to action. DESIGN.md §2.2 gives state colour to
   * teal and keeps the accent fill for the one thing to press.
   */
  it("paints an enabled feature switch teal, not accent", async () => {
    setupSuccessfulLoads();
    render(<AddonPolicySection />);
    const sw = await screen.findByRole("switch", {
      name: "main / intelligence / transcription_cloud",
    });
    expect(sw.className).toContain("bg-accent-teal");
    // `\b` is no help here: the boundary after "accent" matches inside
    // "bg-accent-teal" too, so the guard has to say "not followed by a
    // hyphen".
    expect(sw.className).not.toMatch(/bg-accent(?![-\w])/);
  });

  /**
   * The columns run off a narrow screen, and a scroll region that cannot
   * take focus cannot be scrolled without a pointer — the last addon's
   * column is then simply unreachable.
   */
  /**
   * The name the region announces has to be a name.
   *
   * `src/test/setup.ts`'s global `next-intl` mock renders a miss as
   * `` `${namespace}.${key}` `` — exactly what the real runtime does — so a
   * key written in the wrong namespace renders as a developer identifier
   * and no rendered assertion can tell the difference. The region shipped
   * announcing "settings.addonPolicy.tableLabel", on the very control
   * added for screen-reader reachability.
   *
   * So the key the component asked for is resolved against the real
   * catalogues here. Whatever namespace it moves to, it has to exist in
   * both.
   */
  it("announces a name, not the key path", async () => {
    setupSuccessfulLoads();
    render(<AddonPolicySection />);
    const region = await screen.findByRole("region");
    const name = region.getAttribute("aria-label")!;
    expect(name).toBeTruthy();
    // next-intl renders a miss as the key path it could not resolve, so
    // that shape *is* the symptom. Asserted as a shape rather than as one
    // literal string, which would have to move every time the wording does.
    expect(name, `announced a key path: ${name}`).not.toMatch(
      /^[a-z][\w]*(\.[\w]+)+$/,
    );
    // And it is the message the catalogues hold, in both locales.
    for (const locale of ["en", "ja"]) {
      const messages = JSON.parse(
        readFileSync(
          resolve(REPO_ROOT, `frontend/src/messages-core/${locale}.json`),
          "utf-8",
        ),
      );
      const values = JSON.stringify(messages.settings.addonPolicy);
      expect(values, `${locale}.json has no label for the table`).toContain(
        '"tableLabel"',
      );
    }
  });

  it("lets a keyboard reach the columns that are off-screen", async () => {
    setupSuccessfulLoads();
    render(<AddonPolicySection />);
    const table = await screen.findByRole("table");
    const region = table.closest("[tabindex]");
    expect(region).not.toBeNull();
    expect(region!.getAttribute("tabindex")).toBe("0");
    expect(region!.className).toContain("overflow-x-auto");
    // `w-full` is what made the table fold its headings instead of
    // scrolling; `min-w-full` keeps it from shrinking below the region.
    expect(table.className).toContain("min-w-full");
    expect(table.className).not.toMatch(/(?<![-\w])w-full/);
  });
});

describe("AddonPolicySection", () => {
  it("loads policy and addon list and renders matrix of toggles", async () => {
    setupSuccessfulLoads();
    render(<AddonPolicySection />);
    await waitFor(() => {
      expect(
        screen.getByRole("columnheader", { name: "intelligence" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("columnheader", { name: "knowledge" }),
    ).toBeInTheDocument();
    // Drive labels also rendered
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("private")).toBeInTheDocument();
  });

  it("toggling a cell PUTs updated policy", async () => {
    setupSuccessfulLoads();
    render(<AddonPolicySection />);
    await waitFor(() => {
      expect(
        screen.getByRole("columnheader", { name: "intelligence" }),
      ).toBeInTheDocument();
    });

    // Find a checkbox/toggle for main x knowledge (currently false)
    const toggles = screen.getAllByRole("checkbox");
    expect(toggles.length).toBeGreaterThan(0);
    fireEvent.click(toggles[0]);

    await waitFor(() => {
      const putCall = mockFetch.mock.calls.find(
        ([url, opts]) =>
          url === "/api/admin/config/addon-policy" && opts?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
    });
  });

  it("renders transcription_cloud sub-toggle when intelligence is enabled", async () => {
    setupSuccessfulLoads();
    render(<AddonPolicySection />);
    await waitFor(() => {
      expect(
        screen.getByRole("columnheader", { name: "intelligence" }),
      ).toBeInTheDocument();
    });

    // main has intelligence: true → sub-toggle present
    const mainSubToggle = screen.queryByTestId(
      "feature-row-main-intelligence-transcription_cloud",
    );
    expect(mainSubToggle).toBeInTheDocument();

    // private has intelligence: false → no sub-toggle
    const privateSubToggle = screen.queryByTestId(
      "feature-row-private-intelligence-transcription_cloud",
    );
    expect(privateSubToggle).toBeNull();
  });

  it("toggling transcription_cloud PUTs feature dict policy", async () => {
    setupSuccessfulLoads();
    render(<AddonPolicySection />);
    await waitFor(() => {
      expect(
        screen.getByRole("columnheader", { name: "intelligence" }),
      ).toBeInTheDocument();
    });

    const subToggle = screen.getByLabelText(
      "main / intelligence / transcription_cloud",
    );
    fireEvent.click(subToggle);

    await waitFor(() => {
      const putCall = mockFetch.mock.calls.find(
        ([url, opts]) =>
          url === "/api/admin/config/addon-policy" && opts?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse(putCall![1].body);
      // Default of transcription_cloud is true; clicking flips it to false
      // and promotes intelligence to a feature dict.
      expect(body.main.intelligence).toEqual({ transcription_cloud: false });
    });
  });

  it("server unknown_addon error shows inline error", async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === "/api/admin/config/addon-policy" && opts?.method === "PUT") {
        return Promise.resolve(
          jsonResponse(
            {
              detail: {
                code: "unknown_addon",
                field: "addons",
                message: "manifest に存在しない addon です",
              },
            },
            422,
          ),
        );
      }
      if (url === "/api/admin/config/addon-policy") {
        return Promise.resolve(jsonResponse(initialPolicy));
      }
      if (url === "/api/addons/status") {
        return Promise.resolve(jsonResponse(addonsStatusResponse));
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });

    render(<AddonPolicySection />);
    await waitFor(() => {
      expect(
        screen.getByRole("columnheader", { name: "intelligence" }),
      ).toBeInTheDocument();
    });

    const toggles = screen.getAllByRole("checkbox");
    fireEvent.click(toggles[0]);

    await waitFor(() => {
      expect(
        screen.getByText(/unknown_addon|manifest|存在しない addon/),
      ).toBeInTheDocument();
    });
  });
});


/**
 * The rule this section shares with the listings (`lib/listMeta.ts`): a
 * line whose words are the same on every row is not telling the reader
 * which row they are on.
 *
 * Measured on the running app before the change: the transcription
 * feature's help paragraph was rendered four times, once per drive with
 * intelligence enabled, in a 186px-wide column, and the table stood
 * 1152px tall against an 863px viewport. Without them it is 548px.
 *
 * **jsdom cannot see either of those numbers.** It lays nothing out, so
 * nothing here observes the column width, the table's height, or whether
 * the sticky column headings stay on screen — those were measured in
 * Chrome and are recorded in the PR. What this file can see, and what it
 * asserts, is how many times each paragraph is in the document.
 */
describe("AddonPolicySection says each explanation once", () => {
  /**
   * The rendered strings, read from the catalogue the component reads.
   *
   * Not the key paths: the global `next-intl` mock resolves against the
   * real merged messages, so a key path is what a *miss* renders as —
   * counting those would count zero copies of everything and pass.
   */
  const feature = JSON.parse(
    readFileSync(resolve(REPO_ROOT, "frontend/src/messages/en.json"), "utf-8"),
  ).intelligence.policyFeatures.transcriptionCloud;
  const HELP: string = feature.help;
  const WARNING: string = feature.warning;
  const LABEL: string = feature.label;

  /** Three drives, all with intelligence on: three rows, one legend. */
  const threeDrives = {
    main: { intelligence: true },
    photos: { intelligence: true },
    work: { intelligence: true },
  };

  function setupDrives(policy: Record<string, Record<string, unknown>>) {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/admin/config/addon-policy") {
        return Promise.resolve(jsonResponse(policy));
      }
      if (url === "/api/addons/status") {
        return Promise.resolve(jsonResponse(addonsStatusResponse));
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });
  }

  it("draws the help once however many drives show the feature", async () => {
    setupDrives(threeDrives);
    render(<AddonPolicySection />);

    // Three rows, so three switches and three copies of the row's own
    // name — that part is per-row and stays.
    await waitFor(() => {
      expect(screen.getAllByRole("switch")).toHaveLength(3);
    });
    // The feature's *name* is per-row and stays per-row — one in each of
    // the three rows — and the legend names it once more so its entry can
    // be told from the next feature's. Counted by where they are rather
    // than by text alone, because the two are different elements saying
    // the same words on purpose.
    const named = (root: ParentNode, selector: string) =>
      Array.from(root.querySelectorAll(selector)).filter((el) =>
        el.textContent!.includes(LABEL),
      );
    expect(named(document.body, "tbody td")).toHaveLength(3);
    expect(named(document.body, "dt")).toHaveLength(1);
    // `toBe(1)`, not `toBeLessThan(4)`: a bound would go green again the
    // moment a second copy came back for a different reason.
    expect(screen.getAllByText(HELP)).toHaveLength(1);
  });

  it("draws the warning once however many drives have it off", async () => {
    setupDrives({
      main: { intelligence: { transcription_cloud: false } },
      photos: { intelligence: { transcription_cloud: false } },
      work: { intelligence: { transcription_cloud: false } },
    });
    render(<AddonPolicySection />);

    await waitFor(() => {
      expect(screen.getAllByRole("switch")).toHaveLength(3);
    });
    expect(screen.getAllByText(WARNING)).toHaveLength(1);
  });

  it("says nothing about a feature no drive is showing a row for", async () => {
    // A legend entry for a control that is not on the page is the
    // "heading for a thing that does not exist yet" the redesign's first
    // principle rejects.
    setupDrives({ main: { intelligence: false }, photos: { intelligence: false } });
    render(<AddonPolicySection />);

    await waitFor(() => {
      expect(
        screen.getByRole("columnheader", { name: "intelligence" }),
      ).toBeInTheDocument();
    });
    expect(screen.queryAllByText(HELP)).toHaveLength(0);
    expect(screen.queryAllByText(LABEL)).toHaveLength(0);
  });

  it("names the addon on each legend entry", async () => {
    // The only thing tying an entry to the column it explains: the rows
    // draw `↳ <feature label>` and no addon name, so with two addons
    // declaring a same-named feature the legend would be two entries a
    // reader cannot tell apart. Measured before this case existed:
    // blanking the addon label left all 98 jsdom tests green.
    setupDrives(threeDrives);
    render(<AddonPolicySection />);

    await waitFor(() => {
      expect(screen.getAllByRole("switch")).toHaveLength(3);
    });
    const entries = Array.from(document.querySelectorAll("dt"));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.textContent).toContain("intelligence");
    expect(entries[0]!.textContent).toContain(LABEL);
  });

  it("draws no empty rule under the table when nothing declares a feature", async () => {
    // `intelligence` is the only addon in the tree that declares
    // `policy_features`, so every install without it takes this path. The
    // `<dl>` carries `border-t` and `mt-6`, so an unguarded one is a
    // stray rule under the table on all of them.
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/admin/config/addon-policy") {
        return Promise.resolve(jsonResponse({ main: { knowledge: true } }));
      }
      if (url === "/api/addons/status") {
        return Promise.resolve(
          jsonResponse({ addons: { knowledge: { scope: "drive" } }, slots: {} }),
        );
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    const { container } = render(<AddonPolicySection />);

    await waitFor(() =>
      expect(
        screen.getByRole("columnheader", { name: "knowledge" }),
      ).toBeInTheDocument(),
    );
    expect(container.querySelectorAll("dl")).toHaveLength(0);
  });

  it("keeps the warning out of it while every drive has the feature on", async () => {
    setupDrives(threeDrives);
    render(<AddonPolicySection />);

    await waitFor(() => {
      expect(screen.getAllByRole("switch")).toHaveLength(3);
    });
    expect(screen.queryAllByText(WARNING)).toHaveLength(0);
  });
});
