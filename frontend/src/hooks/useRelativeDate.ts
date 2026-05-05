"use client";

import { useLocale } from "next-intl";
import { formatRelativeDate } from "@/lib/format";

export function useRelativeDate() {
  const locale = useLocale();
  return (isoString: string) => formatRelativeDate(isoString, locale);
}
