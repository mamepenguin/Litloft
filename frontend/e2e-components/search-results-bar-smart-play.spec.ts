import { test, expect } from "@playwright/test";

import { measure, open } from "./search-results-bar.cases";
import {
  PLAIN_COUNTERPART,
  SMART_PLAY,
  controlCounts,
  firstMenuRow,
  measureWithPlay,
  openSmartPlay,
} from "./search-results-bar-smart-play.cases";

const PHONE = 375;

for (const id of [SMART_PLAY.operator, SMART_PLAY.text]) {
  test(`SPEC-CORE-109 I11 / D3 ${id} at ${PHONE}px: 再生 is not in the bar, the bar holds today's controls, and nothing scrolls sideways`, async ({
    page,
  }) => {
    await open(page, PLAIN_COUNTERPART[id], PHONE);
    const today = controlCounts(await measure(page));

    await openSmartPlay(page, id, PHONE);
    const m = await measureWithPlay(page);

    expect(m.scrollWidth).toBeLessThanOrEqual(PHONE);
    expect(m.plays).toEqual([]);
    expect(controlCounts(m)).toEqual(today);
  });

  test(`SPEC-CORE-109 I11 / D3 ${id} at ${PHONE}px: 再生 is the … sheet's first row`, async ({ page }) => {
    await openSmartPlay(page, id, PHONE);

    expect(await firstMenuRow(page)).toBe("Play");
  });
}
