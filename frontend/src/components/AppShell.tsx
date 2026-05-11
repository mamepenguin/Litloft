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
      // PWA safe-area: when iOS runs in standalone mode the viewport
      // can extend under the status bar, so anchor the fixed menu
      // button to the safe-area top + 12px instead of a raw 12px
      // offset. In a regular browser `safe-area-inset-top` resolves
      // to 0 so the visual offset is unchanged.
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 12px)",
      }}
      className="fixed left-3 z-50 flex h-10 w-10 items-center justify-center rounded-2xl text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary"
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
