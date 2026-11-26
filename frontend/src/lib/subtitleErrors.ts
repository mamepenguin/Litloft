import { ApiStatusError } from "@/lib/apiError";

/** The refusals the subtitle-serving endpoints answer with a machine code. */
export const SUBTITLE_REFUSAL_CODES = [
  "subtitle_name_taken",
  "subtitle_owner_change",
  "subtitle_conflict",
  "subtitle_language_taken",
  "subtitle_language",
  "subtitle_extension",
  "subtitle_extension_reserved",
  "subtitle_too_large",
  "subtitle_not_utf8",
] as const;

export function isSubtitleRefusal(code: string | null | undefined): boolean {
  return (
    typeof code === "string" &&
    (SUBTITLE_REFUSAL_CODES as readonly string[]).includes(code)
  );
}

type Translate = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

export interface SubtitleErrorText {
  message: string;
  names: string[];
}

/**
 * The translated message for a subtitle refusal, with the files the server
 * named. The caller owns the namespace, so the translation's leaf must be
 * the code itself.
 */
export function subtitleErrorText(
  t: Translate,
  code: string,
  names: readonly string[] = [],
): SubtitleErrorText {
  return { message: t(code), names: [...names] };
}

/**
 * The translated message for a subtitle refusal, with the files the server
 * named appended. For places that can only draw one line; an alert lists the
 * names under the message instead.
 */
export function subtitleErrorMessage(
  t: Translate,
  code: string,
  names: readonly string[] = [],
): string {
  const { message, names: files } = subtitleErrorText(t, code, names);
  if (files.length === 0) return message;
  return `${message} ${files.join("、")}`;
}

/**
 * The message for a caught subtitle refusal, or null when the failure is
 * something else so the caller can keep its own text.
 */
export function subtitleFailure(
  cause: unknown,
  t: Translate,
): string | null {
  if (!(cause instanceof ApiStatusError) || !isSubtitleRefusal(cause.code)) {
    return null;
  }
  return subtitleErrorMessage(t, cause.code!, cause.names ?? []);
}

/** The split form of `subtitleFailure`, for an alert that lists the names. */
export function subtitleFailureText(
  cause: unknown,
  t: Translate,
): SubtitleErrorText | null {
  if (!(cause instanceof ApiStatusError) || !isSubtitleRefusal(cause.code)) {
    return null;
  }
  return subtitleErrorText(t, cause.code!, cause.names ?? []);
}

/** The names an operation could not carry, from its `sidecar_errors` field. */
export function sidecarErrorNames(result: unknown): string[] {
  if (typeof result !== "object" || result === null) return [];
  const names = (result as { sidecar_errors?: unknown }).sidecar_errors;
  return Array.isArray(names)
    ? names.filter((name): name is string => typeof name === "string")
    : [];
}

export function sidecarErrorMessage(
  t: Translate,
  names: readonly string[],
): string {
  return t("sidecarErrors", { names: names.join("、") });
}
