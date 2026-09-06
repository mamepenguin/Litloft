"use client";

/**
 * Whether the tree lists files as well as folders (F-7).
 *
 * Off by default. The tree is a map of the drive's shape, and the pane
 * beside it already lists the files in the folder you are standing in, so
 * drawing them in the tree too spends its height saying the same thing
 * twice — and on a drive of any size the folders get pushed off the
 * bottom by the files under the first one.
 *
 * Per drive, because a drive of notes and a drive of video want different
 * answers: in a notes drive the file *is* the destination.
 */

import { createDriveScopedFlag } from "@/lib/driveScopedFlag";

export const treeIncludeFilesStore = createDriveScopedFlag("tree:includeFiles:");
