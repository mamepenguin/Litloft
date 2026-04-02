export interface RenamePreviewFile {
  id: string;
  filename: string;
}

export interface RenamePreviewResult {
  id: string;
  oldName: string;
  newName: string;
  changed: boolean;
}

export type PrefixSuffixAction =
  | "add_prefix"
  | "add_suffix"
  | "remove_prefix"
  | "remove_suffix";

export interface RenameParams {
  template?: string;
  startNumber?: number;
  zeroPad?: number;
  pattern?: string;
  replacement?: string;
  action?: PrefixSuffixAction;
  value?: string;
}

function splitFilename(filename: string): { stem: string; ext: string } {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0) {
    return { stem: filename, ext: "" };
  }
  return {
    stem: filename.substring(0, lastDot),
    ext: filename.substring(lastDot),
  };
}

function padNumber(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function applyTemplate(
  stem: string,
  template: string,
  index: number,
  startNumber: number,
  zeroPad: number
): string {
  const num = startNumber + index;
  const padded = padNumber(num, zeroPad);
  return template
    .replace(/\{original\}/g, stem)
    .replace(/\{n\}/g, padded);
}

const MAX_REGEX_PATTERN_LENGTH = 200;

function applyRegex(
  stem: string,
  pattern: string,
  replacement: string
): string {
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) return stem;
  const regex = new RegExp(pattern, "g");
  return stem.replace(regex, replacement);
}

function applyPrefixSuffix(
  stem: string,
  action: PrefixSuffixAction,
  value: string
): string {
  switch (action) {
    case "add_prefix":
      return value + stem;
    case "add_suffix":
      return stem + value;
    case "remove_prefix":
      return stem.startsWith(value) ? stem.slice(value.length) : stem;
    case "remove_suffix":
      return stem.endsWith(value) ? stem.slice(0, -value.length) : stem;
    default:
      return stem;
  }
}

export function computeNewFilenames(
  files: ReadonlyArray<RenamePreviewFile>,
  mode: "template" | "regex" | "prefix_suffix",
  params: RenameParams
): ReadonlyArray<RenamePreviewResult> {
  return files.map((file, index) => {
    const { stem, ext } = splitFilename(file.filename);
    let newStem = stem;

    if (mode === "template") {
      const template = params.template || "{original}_{n}";
      const startNumber = params.startNumber ?? 1;
      const zeroPad = params.zeroPad ?? 3;
      newStem = applyTemplate(stem, template, index, startNumber, zeroPad);
    } else if (mode === "regex") {
      if (params.pattern) {
        newStem = applyRegex(stem, params.pattern, params.replacement ?? "");
      }
    } else if (mode === "prefix_suffix") {
      if (params.action && params.value) {
        newStem = applyPrefixSuffix(stem, params.action, params.value);
      }
    }

    const newName = newStem + ext;
    return {
      id: file.id,
      oldName: file.filename,
      newName,
      changed: newName !== file.filename,
    };
  });
}

export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}
