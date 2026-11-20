/**
 * SPEC-ADDON-152 / 153 in Chromium with a coarse pointer: the real Scenes
 * section in a bounded host of a stated width and height, standing in for the
 * phone sheet's column.
 */

import {
  scenesCardCases,
  scenesSectionCases,
  scenesTimeLabelCases,
} from "./scenes-section.cases";

scenesSectionCases([
  { route: "scenes-390", hostWidth: 390, hostHeight: 844, pointer: "touch", columns: 3 },
  { route: "scenes-688", hostWidth: 688, hostHeight: 844, pointer: "touch", columns: 5 },
]);

scenesCardCases([
  {
    route: "scenes-short-688",
    hostWidth: 688,
    hostHeight: 360,
    pointer: "touch",
    columns: 5,
    oneLine: true,
  },
]);

scenesTimeLabelCases([
  {
    route: "scenes-long-390",
    hostWidth: 390,
    hostHeight: 844,
    pointer: "touch",
    columns: 3,
    long: true,
  },
]);
