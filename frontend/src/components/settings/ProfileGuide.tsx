"use client";

import {
  History,
  Lock,
  MessageSquare,
  Play,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface GuideItem {
  key: "resume" | "history" | "comments" | "sync";
  icon: LucideIcon;
}

const ITEMS: ReadonlyArray<GuideItem> = [
  { key: "resume", icon: Play },
  { key: "history", icon: History },
  { key: "comments", icon: MessageSquare },
  { key: "sync", icon: Smartphone },
];

export function ProfileGuide() {
  const t = useTranslations("settings.profile.guide");

  return (
    <section
      aria-labelledby="settings-profile-guide-title"
      className="rounded-xl border border-bg-border bg-bg-card p-6"
    >
      <h2
        id="settings-profile-guide-title"
        className="text-base font-semibold text-text-primary"
      >
        {t("title")}
      </h2>
      <p className="mt-2 text-sm text-text-muted">{t("intro")}</p>

      <ul className="mt-4 space-y-3">
        {ITEMS.map(({ key, icon: Icon }) => (
          <li key={key} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warm-light text-text-primary"
            >
              <Icon size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">
                {t(`items.${key}.title`)}
              </p>
              <p className="text-sm text-text-muted">
                {t(`items.${key}.description`)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex items-start gap-3 rounded-lg bg-bg-elevated p-3">
        <Lock
          size={16}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-text-muted"
        />
        <p className="text-xs text-text-muted">{t("privacy")}</p>
      </div>
    </section>
  );
}
