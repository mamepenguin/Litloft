/** The year and month a `YYYY-MM` shelf key names, in the viewer's locale. */
export function formatMonth(yearMonth: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) return yearMonth;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

/** A `YYYY-MM` month key, the only one a month shelf names. */
export function isMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}
