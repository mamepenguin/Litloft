/**
 * The layout fixture's class lists, against the section it copies.
 *
 * `e2e-layout/addon-policy.spec.ts` measures a sticky heading in
 * Chromium, and it can only measure the markup in front of it. Here the
 * class lists *are* the mechanism: `sticky top-0` resolves against the
 * nearest scrollport, and the wrapper is that scrollport only because it
 * is bounded. A fixture that kept the sticky class and lost the cap would
 * go on reporting a heading at the top of a box — a box that never
 * scrolls, which is what the app did before the cap and what the spec
 * exists to catch.
 *
 * So the two are compared, whole, in both directions: a class dropped
 * from either side is red. Rendering the real section rather than reading
 * one table twice, per the shape `justifiedGridFixtureParity.test.tsx`
 * argues for at length.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { AddonPolicySection } from "@/app/admin/settings/AddonPolicySection";

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../..",
);

const FIXTURE_HTML = readFileSync(
  resolve(REPO_ROOT, "frontend/e2e-layout/fixtures/addon-policy.html"),
  "utf-8",
);

const SPEC: Record<string, string> = JSON.parse(
  FIXTURE_HTML.match(
    /<script type="application\/json" id="fixture-markup">([\s\S]*?)<\/script>/,
  )![1],
);

const mockFetch = vi.fn();

beforeEach(() => vi.stubGlobal("fetch", mockFetch));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function setup() {
  mockFetch.mockImplementation((url: string) => {
    if (url === "/api/admin/config/addon-policy") {
      return Promise.resolve(jsonResponse({ main: { intelligence: true } }));
    }
    if (url === "/api/addons/status") {
      return Promise.resolve(
        jsonResponse({
          addons: {
            intelligence: {
              scope: "drive",
              // A feature, so the sub-row exists: its own height is half
              // of what makes the app's table 548px, and the fixture
              // cannot draw it from a table that has never seen one.
              policy_features: [
                {
                  name: "transcription_cloud",
                  default: true,
                  i18n_key: "intelligence.policyFeatures.transcriptionCloud",
                },
              ],
            },
          },
          slots: {},
        }),
      );
    }
    return Promise.resolve(jsonResponse({ ok: true }));
  });
}

const tokens = (className: string) => className.split(/\s+/).filter(Boolean);
const normalise = (className: string) => tokens(className).sort().join(" ");

describe("the addon-policy layout fixture's class lists", () => {
  it("declares every class list the section renders, and no others", async () => {
    setup();
    render(<AddonPolicySection />);
    await waitFor(() =>
      expect(screen.getByRole("switch")).toBeInTheDocument(),
    );

    const table = screen.getByRole("table");
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    const driveRow = rows[0]!;
    const featureRow = rows[1]!;

    // Sorted before comparing: the order utilities are written in is not
    // a property of anything, and pinning it would make a reorder red for
    // no reason. Which utilities are present is the property.
    //
    // The body rows are here and not only the head because the fixture's
    // table has to be the *height* the app's is — 548px at four drives —
    // and that height is these paddings and this switch. Twelve uniform
    // rows measured 588px, which would have made every claim arithmetic
    // on the wrong number by 40px.
    const rendered: Record<string, string> = {
      wrapper: table.parentElement!.className,
      table: table.className,
      rowHeadCell: table.querySelectorAll("thead th")[0]!.className,
      headCell: table.querySelectorAll("thead th")[1]!.className,
      driveRow: driveRow.className,
      driveNameCell: driveRow.querySelectorAll("td")[0]!.className,
      driveToggleCell: driveRow.querySelectorAll("td")[1]!.className,
      driveToggle: driveRow.querySelector("input")!.className,
      featureNameCell: featureRow.querySelectorAll("td")[0]!.className,
      featureToggleCell: featureRow.querySelector("td:has(> [role='switch'])")!
        .className,
      featureSwitch: featureRow.querySelector('[role="switch"]')!.className,
    };

    // Both directions, as sets: a key the fixture invents and a class
    // list the section changed are each red.
    expect(Object.keys(SPEC).sort()).toEqual(Object.keys(rendered).sort());
    for (const [key, className] of Object.entries(rendered)) {
      expect(normalise(className), key).toBe(normalise(SPEC[key]!));
    }
  });

  it("keeps the two halves of the mechanism, named", async () => {
    // Stated on their own as well as inside the whole-list comparison,
    // because these two are what the browser spec is about and a reader
    // of a failed `toBe` on a forty-character string should not have to
    // work out which token moved. Either one alone does nothing: the cap
    // with no `sticky` leaves the head scrolling away, and `sticky` with
    // no cap sticks it to a box that never scrolls.
    setup();
    render(<AddonPolicySection />);
    await waitFor(() =>
      expect(screen.getByRole("table")).toBeInTheDocument(),
    );

    const wrapper = screen.getByRole("table").parentElement!;
    expect(tokens(wrapper.className)).toContain("max-h-[70vh]");
    expect(tokens(wrapper.className)).toContain("overflow-y-auto");
    for (const th of Array.from(
      screen.getByRole("table").querySelectorAll("thead th"),
    )) {
      expect(tokens(th.className)).toContain("sticky");
      expect(tokens(th.className)).toContain("top-0");
      // Without a background of its own a sticky head is transparent and
      // the rows travel visibly underneath it.
      expect(tokens(th.className)).toContain("bg-bg-card");
    }
  });
});
