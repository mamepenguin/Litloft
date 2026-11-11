/**
 * SPEC-ADDON-089 I5 and SPEC-ADDON-093 I1/I7 in Chromium with a coarse
 * pointer: the same section in the width a phone's Bottom Sheet gives it, at
 * three columns and at five, browsed by tapping the ruler.
 */

import {
  scenesSectionCases,
  scenesTimeLabelCases,
} from "./scenes-section.cases";

scenesSectionCases([
  { hostWidth: 390, pointer: "touch", columns: 3 },
  { hostWidth: 688, pointer: "touch", columns: 5 },
]);

scenesTimeLabelCases([{ hostWidth: 390, pointer: "touch", columns: 3, long: true }]);
