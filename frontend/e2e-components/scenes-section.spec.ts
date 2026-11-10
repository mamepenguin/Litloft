/**
 * SPEC-ADDON-089 I5 in Chromium with a coarse pointer: the same section in the
 * width a phone's Bottom Sheet gives it, browsed by tapping the ruler.
 */

import { scenesSectionCases } from "./scenes-section.cases";

scenesSectionCases([{ hostWidth: 390, pointer: "touch" }]);
