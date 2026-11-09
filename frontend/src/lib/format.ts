export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}:${String(remainMins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatRelativeAge(isoString: string, locale = "en"): string {
  const date = new Date(isoString);
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  const always = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  const named = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const text = (value: number, unit: Intl.RelativeTimeFormatUnit, formatter = always) => {
    const formatted = formatter.format(value, unit);
    return locale.startsWith("ja") ? formatted.replace(/\s/g, "") : formatted;
  };

  if (diffMin < 1) return text(0, "second", named);
  if (diffMin < 60) return text(-diffMin, "minute");
  if (diffHour < 24) return text(-diffHour, "hour");
  if (diffDay < 7) return text(-diffDay, "day", diffDay === 1 ? named : always);
  if (diffDay < 30) return text(-Math.floor(diffDay / 7), "week");
  if (diffDay < 360) return text(-Math.floor(diffDay / 30), "month");
  return text(-Math.max(1, Math.floor(diffDay / 365)), "year");
}

export function formatRelativeDate(isoString: string, locale = "en"): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (diffMin < 1) return rtf.format(0, "second");
  if (diffMin < 60) return rtf.format(-diffMin, "minute");
  if (diffHour < 24) return rtf.format(-diffHour, "hour");
  if (diffDay < 7) return rtf.format(-diffDay, "day");

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y === now.getFullYear() ? `${m}/${d}` : `${y}/${m}/${d}`;
}
