"use client";

import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";

import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { useSidebar } from "./SidebarProvider";
import { ShortcutsProvider } from "./ShortcutsProvider";

function MenuButton() {
  const { toggle } = useSidebar();
  const t = useTranslations("header");
  return (
    <button
      onClick={toggle}
      aria-label={t("menu")}
      className="fixed top-3 left-3 z-50 flex h-10 w-10 items-center justify-center rounded-2xl text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
    >
      <Menu size={20} />
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { isOpen, isOverlay } = useSidebar();
  const inlineOpen = isOpen && !isOverlay;

  return (
    <ShortcutsProvider>
      <div className="min-h-dvh">
        <Sidebar />
        <MenuButton />
        <div
          className={`flex min-h-dvh min-w-0 flex-col transition-[padding] duration-150 ease-out ${
            inlineOpen ? "min-[1200px]:pl-60" : ""
          }`}
        >
          <Header />
          <main className="flex min-w-0 flex-1 flex-col">{children}</main>
        </div>
      </div>
    </ShortcutsProvider>
  );
}
