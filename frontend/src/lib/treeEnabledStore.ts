"use client";

/**
 * Tree (folder navigation pane) visibility store.
 *
 * Phase 3 redesign: tree visibility is orthogonal to grid/list view mode
 * (Topic 1 補正, hako w4zVT8-dyYwshLNiJ5REY).
 */

import { createDriveScopedFlag } from "@/lib/driveScopedFlag";

export const treeEnabledStore = createDriveScopedFlag("tree:enabled:");
