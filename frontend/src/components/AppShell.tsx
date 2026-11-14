"use client";

import type { ReactNode } from "react";

import { useEntryVisibility } from "@/hooks/useEntryVisibility";
import { useReportPageBackground } from "@/hooks/useReportPageBackground";

import { ChromeButtons } from "./ChromeButtons";
import { useCurrentDrive } from "./CurrentDriveProvider";
import { FileHeaderRowProvider } from "./FileHeaderRowProvider";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { useSidebar } from "./SidebarProvider";
import { ShortcutsProvider } from "./ShortcutsProvider";
import { QuickNoteProvider } from "./quick-note";
import { GlobalSearchProvider } from "./search/GlobalSearchProvider";

export function AppShell({ children }: { children: ReactNode }) {
  const { isOpen, isOverlay } = useSidebar();
  const inlineOpen = isOpen && !isOverlay;
  const { hidden: hiddenEntries } = useEntryVisibility(useCurrentDrive());
  useReportPageBackground();

  return (
    <ShortcutsProvider>
      <QuickNoteProvider>
        <GlobalSearchProvider>
          <FileHeaderRowProvider>
            <div className="min-h-dvh">
              <Sidebar hiddenKeys={hiddenEntries} />
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
          </FileHeaderRowProvider>
        </GlobalSearchProvider>
      </QuickNoteProvider>
    </ShortcutsProvider>
  );
}
