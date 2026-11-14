import { test, expect } from "@playwright/test";

import { overlapVertically } from "./search-results-bar.cases";
import { SMART_PLAY, measureWithPlay, openSmartPlay } from "./search-results-bar-smart-play.cases";

for (const width of [1440, 768]) {
  for (const id of [SMART_PLAY.operator, SMART_PLAY.text]) {
    test(`SPEC-CORE-109 I11 / D1 ${id} at ${width}px: 再生 sits after the count and before view, sort and …, on one row within the content width`, async ({
      page,
    }) => {
      await openSmartPlay(page, id, width);
      const m = await measureWithPlay(page);

      expect(m.scrollWidth).toBeLessThanOrEqual(width);
      expect(m.plays).toHaveLength(1);
      const play = m.plays[0];

      const controls = [play, ...m.switches, ...m.checkboxes, ...m.counts, ...m.views, ...m.sorts, ...m.mores];
      for (const a of controls) for (const b of controls) expect(overlapVertically(a, b)).toBe(true);
      for (const c of controls) {
        expect(c.left).toBeGreaterThanOrEqual(m.bar.left - 0.5);
        expect(c.right).toBeLessThanOrEqual(m.bar.right + 0.5);
      }
      expect(m.counts).toHaveLength(1);
      expect(m.counts[0].lines).toBe(1);

      expect(play.left).toBeGreaterThanOrEqual(m.counts[0].right);
      for (const after of [...m.views, ...m.sorts, ...m.mores]) {
        expect(play.right).toBeLessThanOrEqual(after.left);
      }
      if (id === SMART_PLAY.text) {
        expect(m.switches).toHaveLength(1);
        expect(m.checkboxes).toHaveLength(1);
      }
    });
  }
}
