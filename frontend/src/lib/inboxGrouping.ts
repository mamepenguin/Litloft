import type { InboxItem } from "@/lib/api";

export type InboxGroupKey = "today" | "yesterday" | "earlier";

export const INBOX_GROUP_ORDER: readonly InboxGroupKey[] = [
  "today",
  "yesterday",
  "earlier",
];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function inboxDayOffset(arrivedAt: string, now: Date): number {
  const arrived = new Date(arrivedAt);
  return Math.round(
    (startOfDay(now) - startOfDay(arrived)) / 86_400_000,
  );
}

export function inboxGroupOf(arrivedAt: string, now: Date): InboxGroupKey {
  const offset = inboxDayOffset(arrivedAt, now);
  if (offset <= 0) return "today";
  if (offset === 1) return "yesterday";
  return "earlier";
}

export interface InboxGroup {
  key: InboxGroupKey;
  items: InboxItem[];
}

export function groupInboxItems(
  items: readonly InboxItem[],
  now: Date,
): InboxGroup[] {
  const grouped = new Map<InboxGroupKey, InboxItem[]>();
  for (const item of items) {
    const key = inboxGroupOf(item.arrived_at, now);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(item);
    else grouped.set(key, [item]);
  }
  return INBOX_GROUP_ORDER.flatMap((key) => {
    const bucket = grouped.get(key);
    return bucket && bucket.length > 0 ? [{ key, items: bucket }] : [];
  });
}

export function inboxClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

export type InboxTimeTranslator = (
  key: string,
  values?: { time: string },
) => string;

export function inboxTimeLabel(
  arrivedAt: string,
  now: Date,
  locale: string,
  t: InboxTimeTranslator,
): string {
  const arrived = new Date(arrivedAt);
  const offset = inboxDayOffset(arrivedAt, now);
  if (offset <= 0) return inboxClock(arrived);
  if (offset === 1) {
    return t("yesterdayAt", { time: inboxClock(arrived) });
  }
  return arrived.toLocaleDateString(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

export function inboxFolderLabel(
  folderPath: string,
  rootLabel: string,
): string {
  return folderPath ? `${folderPath}/` : rootLabel;
}
