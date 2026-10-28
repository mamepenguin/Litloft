import { askTools } from "./ask.js";
import { readTools } from "./read.js";
import { videoTools } from "./video.js";
import { writeTools } from "./write.js";
import type { LitloftMediaTool } from "./types.js";

export const allTools: LitloftMediaTool[] = [
  ...readTools,
  ...videoTools,
  ...writeTools,
  ...askTools,
];
