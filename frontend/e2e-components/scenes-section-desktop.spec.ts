/**
 * SPEC-ADDON-089 I5 in Chromium with a mouse: the Scenes section draws its
 * tiles inside its own box with no scroll on either axis, and its height does
 * not move as the window or the browse point moves. jsdom lays nothing out.
 */

import { scenesSectionCases } from "./scenes-section.cases";

scenesSectionCases([
  { hostWidth: 384, pointer: "mouse" },
  { hostWidth: 900, pointer: "mouse" },
]);
