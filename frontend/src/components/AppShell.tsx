"use client";

import type { ReactNode } from "react";

import { ChromeButtons } from "./ChromeButtons";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { useSidebar } from "./SidebarProvider";
import { ShortcutsProvider } from "./ShortcutsProvider";
import { QuickNoteProvider } from "./quick-note";
import { GlobalSearchProvider } from "./search/GlobalSearchProvider";

export function AppShell({ children }: { children: ReactNode }) {
  const { isOpen, isOverlay } = useSidebar();
  const inlineOpen = isOpen && !isOverlay;

  return (
    <ShortcutsProvider>
      <QuickNoteProvider>
        <GlobalSearchProvider>
          <div className="min-h-dvh">
            <Sidebar />
            <ChromeButtons />
            <div
              className={`flex min-h-dvh min-w-0 flex-col transition-[padding] duration-150 ease-out ${
                inlineOpen ? "min-[1200px]:pl-60" : ""
              }`}
            >
              <Header />
              <main className="flex min-w-0 flex-1 flex-col">{children}</main>
            </div>
          </div>
        </GlobalSearchProvider>
      </QuickNoteProvider>
    </ShortcutsProvider>
  );
}
