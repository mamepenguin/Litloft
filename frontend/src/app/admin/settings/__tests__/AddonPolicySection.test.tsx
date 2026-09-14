import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { existsSync, readdirSync, readFileSync } from "node:fs";
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
 * `label` is optional on `AddonStatusEntry`, so one entry here carries a
 * label and one does not, in the same fixture.
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
    expect(text).toContain("knowledge");
    expect(text).not.toContain("intelligence");
  });

  /**
   * The accessible name keeps the identifiers: it has to be unique across
   * the page, and `label` is neither required nor guaranteed distinct.
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
    // column, which is column 1.
    expect(cells[0]!.textContent).toContain("↳");
    expect(cells[0]!.querySelector('[role="switch"]')).toBeNull();
    const switchCell = cells.find((c) => c.querySelector('[role="switch"]'))!;
    expect(cells.indexOf(switchCell)).toBe(1);
    expect(switchCell.className).toContain("text-center");
  });

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

  it("announces a name, not the key path", async () => {
    setupSuccessfulLoads();
    render(<AddonPolicySection />);
    const region = await screen.findByRole("region");
    const name = region.getAttribute("aria-label")!;
    expect(name).toBeTruthy();
    // next-intl renders a miss as the key path it could not resolve, so
    // that shape *is* the symptom.
    expect(name, `announced a key path: ${name}`).not.toMatch(
      /^[a-z][\w]*(\.[\w]+)+$/,
    );
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

    const mainSubToggle = screen.queryByTestId(
      "feature-row-main-intelligence-transcription_cloud",
    );
    expect(mainSubToggle).toBeInTheDocument();

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

describe("AddonPolicySection says each explanation once", () => {
  /**
   * The rendered strings, not the key paths: the global `next-intl` mock
   * resolves against the real merged messages, so a key path is what a
   * *miss* renders as. The strings exist only while the intelligence addon
   * is linked, so the block gates on the link rather than on the key.
   */
  const ADDON_DIR = resolve(REPO_ROOT, "frontend/src/addons/intelligence");
  const intelligenceLinked =
    existsSync(ADDON_DIR) && readdirSync(ADDON_DIR).length > 0;

  const feature = (
    JSON.parse(
      readFileSync(resolve(REPO_ROOT, "frontend/src/messages/en.json"), "utf-8"),
    ) as {
      intelligence?: {
        policyFeatures?: {
          transcriptionCloud?: { help: string; warning: string; label: string };
        };
      };
    }
  ).intelligence?.policyFeatures?.transcriptionCloud;
  const HELP: string = feature?.help ?? "";
  const WARNING: string = feature?.warning ?? "";
  const LABEL: string = feature?.label ?? "";

  it.runIf(intelligenceLinked)(
    "reads a catalogue that still carries the feature it counts",
    () => {
      expect(feature).toBeDefined();
      expect([HELP, WARNING, LABEL].every((s) => s.length > 0)).toBe(true);
    },
  );

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

  it.runIf(intelligenceLinked)("draws the help once however many drives show the feature", async () => {
    setupDrives(threeDrives);
    render(<AddonPolicySection />);

    await waitFor(() => {
      expect(screen.getAllByRole("switch")).toHaveLength(3);
    });
    // Counted by where they are rather than by text alone, because the row
    // and the legend are different elements saying the same words on purpose.
    const named = (root: ParentNode, selector: string) =>
      Array.from(root.querySelectorAll(selector)).filter((el) =>
        el.textContent!.includes(LABEL),
      );
    expect(named(document.body, "tbody td")).toHaveLength(3);
    expect(named(document.body, "dt")).toHaveLength(1);
    expect(screen.getAllByText(HELP)).toHaveLength(1);
  });

  it.runIf(intelligenceLinked)("draws the warning once however many drives have it off", async () => {
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

  it.runIf(intelligenceLinked)("says nothing about a feature no drive is showing a row for", async () => {
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

  it.runIf(intelligenceLinked)("names the addon on each legend entry", async () => {
    // The only thing tying an entry to the column it explains: the rows
    // draw `↳ <feature label>` and no addon name.
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

  it.runIf(intelligenceLinked)("draws no empty rule under the table when nothing declares a feature", async () => {
    // The `<dl>` carries `border-t` and `mt-6`, so an unguarded one is a
    // stray rule under the table.
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

  it.runIf(intelligenceLinked)("keeps the warning out of it while every drive has the feature on", async () => {
    setupDrives(threeDrives);
    render(<AddonPolicySection />);

    await waitFor(() => {
      expect(screen.getAllByRole("switch")).toHaveLength(3);
    });
    expect(screen.queryAllByText(WARNING)).toHaveLength(0);
  });
});

describe("AddonPolicySection shows what the backend enforces", () => {
  const stored = {
    bare: {},
    indexOff: { knowledge: { index: false } },
    featureOff: { intelligence: { index: true, transcription_cloud: false } },
    off: { intelligence: false },
  };

  function load() {
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/admin/config/addon-policy") {
        return Promise.resolve(jsonResponse(stored));
      }
      if (url === "/api/addons/status") {
        return Promise.resolve(jsonResponse(addonsStatusResponse));
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    render(<AddonPolicySection />);
  }

  const sw = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

  it("reads each stored shape as the backend does", async () => {
    load();
    await waitFor(() => expect(sw("bare / intelligence")).toBeInTheDocument());
    expect(sw("bare / intelligence").checked).toBe(true);
    expect(sw("bare / knowledge").checked).toBe(true);
    expect(sw("indexOff / knowledge").checked).toBe(false);
    expect(sw("indexOff / intelligence").checked).toBe(true);
    expect(sw("featureOff / intelligence").checked).toBe(true);
    const feature = (label: string) => screen.getByLabelText(label).getAttribute("aria-checked");
    expect(feature("featureOff / intelligence / transcription_cloud")).toBe("false");
    expect(feature("bare / intelligence / transcription_cloud")).toBe("true");
    expect(sw("off / intelligence").checked).toBe(false);
  });

  it("stores the opposite of what was shown, for that drive and addon only", async () => {
    load();
    await waitFor(() => expect(sw("bare / intelligence")).toBeInTheDocument());
    fireEvent.click(sw("bare / intelligence"));
    await waitFor(() => {
      const putCall = mockFetch.mock.calls.find(
        ([url, opts]) => url === "/api/admin/config/addon-policy" && opts?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      expect(JSON.parse(putCall![1].body)).toEqual({ ...stored, bare: { intelligence: false } });
    });
  });
});
