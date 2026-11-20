/**
 * SPEC-ADDON-152 / 153 in Chromium with a mouse: the real Scenes section in a
 * bounded host of a stated width and height, standing in for the workbench
 * panel body. jsdom lays nothing out.
 */

import {
  scenesCardCases,
  scenesPlacementCases,
  scenesSectionCases,
  scenesTimeLabelCases,
} from "./scenes-section.cases";

scenesSectionCases([
  { route: "scenes-384", hostWidth: 384, hostHeight: 1400, pointer: "mouse", columns: 3 },
  { route: "scenes-900", hostWidth: 900, hostHeight: 900, pointer: "mouse", columns: 7 },
]);

scenesCardCases([
  {
    route: "scenes-384",
    hostWidth: 384,
    hostHeight: 1400,
    pointer: "mouse",
    columns: 3,
    oneLine: false,
  },
  {
    route: "scenes-short-688",
    hostWidth: 688,
    hostHeight: 360,
    pointer: "mouse",
    columns: 5,
    oneLine: true,
  },
]);

scenesTimeLabelCases([
  {
    route: "scenes-long-384",
    hostWidth: 384,
    hostHeight: 1400,
    pointer: "mouse",
    columns: 3,
    long: true,
  },
  {
    route: "scenes-long-351",
    hostWidth: 351,
    hostHeight: 900,
    pointer: "mouse",
    columns: 3,
    long: true,
  },
]);

scenesPlacementCases();
