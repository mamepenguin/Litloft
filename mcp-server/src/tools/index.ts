import { askTools } from "./ask.js";
import { batchTools } from "./batch.js";
import { collectionTools } from "./collections.js";
import { documentTools } from "./documents.js";
import { folderTools } from "./folders.js";
import { readTools } from "./read.js";
import { searchTools } from "./search.js";
import { videoTools } from "./video.js";
import { writeTools } from "./write.js";
import type { LitloftMediaTool } from "./types.js";

export const allTools: LitloftMediaTool[] = [
  ...readTools,
  ...collectionTools,
  ...searchTools,
  ...documentTools,
  ...videoTools,
  ...writeTools,
  ...folderTools,
  ...batchTools,
  ...askTools,
];
