/**
 * SPEC-CORE-173 I1 with and without a classic scrollbar on the rail's
 * scroller. Playwright starts Chromium with `--hide-scrollbars`, under which
 * no `::-webkit-scrollbar` rule takes any width, so this file starts it
 * without.
 */

import { test, expect } from "@playwright/test";

import { serveFixture } from "./fixtureOrigin";
import { expectGrid, measure, open, showPages } from "./pdf-pages-grid.measure";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test.beforeEach(({ context }) => serveFixture(context));

for (const scrollbar of [0, 15]) {
  test(`SPEC-CORE-173 I1: at 1440×900 with a ${scrollbar}px scrollbar the rail is still three columns`, async ({
    page,
  }) => {
    await open(page, { scrollbar });
    await showPages(page);

    const m = await measure(page);
    expect(m.scroller.scrollbar).toBe(scrollbar);
    expectGrid(m);
  });
}
