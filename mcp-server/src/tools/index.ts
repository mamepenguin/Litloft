import { askTools } from "./ask.js";
import { readTools } from "./read.js";
import { writeTools } from "./write.js";
import type { LitloftTool } from "./types.js";

export const allTools: LitloftTool[] = [...readTools, ...writeTools, ...askTools];
