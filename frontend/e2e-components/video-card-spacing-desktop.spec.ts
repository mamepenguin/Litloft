import { videoCardSpacingCases } from "./video-card-spacing.cases";

videoCardSpacingCases({
  viewport: 1280,
  discover: [
    { host: 1120, columns: 3 },
    { host: 1080, columns: 3 },
    { host: 900, columns: 2 },
  ],
  seeAllColumns: 3,
  seeAllNarrow: { host: 700, columns: 2 },
});
