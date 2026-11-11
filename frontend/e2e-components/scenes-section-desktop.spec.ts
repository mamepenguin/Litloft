/**
 * SPEC-ADDON-089 I5 and SPEC-ADDON-093 I1/I7 in Chromium with a mouse: the
 * Scenes section fills the width its host gives it, draws a column count from
 * that width, and keeps its height and its single scroll-free box as the
 * window or the browse point moves. jsdom lays nothing out.
 */

import {
  scenesSectionCases,
  scenesTimeLabelCases,
} from "./scenes-section.cases";

scenesSectionCases([
  { hostWidth: 384, pointer: "mouse", columns: 3 },
  { hostWidth: 900, pointer: "mouse", columns: 7 },
]);

scenesTimeLabelCases([
  { hostWidth: 384, pointer: "mouse", columns: 3, long: true },
  { hostWidth: 351, pointer: "mouse", columns: 3, long: true },
]);
