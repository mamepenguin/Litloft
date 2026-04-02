"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";

import { useSidebar } from "./SidebarProvider";
import { GlobalSearch } from "./GlobalSearch";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Header() {
  const { toggle } = useSidebar();
  const t = useTranslations("header");

  return (
    <header className="flex h-14 flex-shrink-0 items-center border-b border-bg-border bg-bg-primary px-4">
      <button
        onClick={toggle}
        className="rounded-lg p-2 text-text-muted hover:bg-bg-elevated hover:text-text-primary md:hidden"
        aria-label={t("menu")}
      >
        <Menu size={20} />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <GlobalSearch />
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
