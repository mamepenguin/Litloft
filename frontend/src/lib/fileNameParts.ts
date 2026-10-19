export interface FileNameParts {
  /** The basename, lowercased. */
  base: string;
  /**
   * The segment that names the file's type: a dotfile's *leading* segment,
   * otherwise the extension. `null` when there is none.
   */
  token: string | null;
  /** Whether `token` was taken from a leading dot. */
  fromDot: boolean;
}

/**
 * A dotfile's *leading* segment names its type, not its trailing one:
 * `.gitignore`, and `.env.local` as much as `.env`. Reading the last segment
 * instead would ask whether `local` is a language.
 *
 * Shared so that what the viewer agrees to render and what it agrees to
 * colour are decided by one rule. Two copies drift into a file that opens
 * without highlighting, or highlights without opening.
 */
export function fileNameParts(filename: string): FileNameParts {
  const base = filename.slice(filename.lastIndexOf("/") + 1).toLowerCase();

  if (base.startsWith(".")) {
    const lead = base.slice(1).split(".")[0];
    return { base, token: lead === "" ? null : lead, fromDot: true };
  }

  const dot = base.lastIndexOf(".");
  // Matching an extensionless name against the *extension* list is how
  // `bin/go`, `usr/bin/env` and `bin/patch` — ELF binaries — would be
  // rendered as text.
  if (dot < 0) return { base, token: null, fromDot: false };

  const ext = base.slice(dot + 1);
  return { base, token: ext === "" ? null : ext, fromDot: false };
}
