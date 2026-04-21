"use client";

import type { ReactNode } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { useSidebar } from "./SidebarProvider";

export function AppShell({ children }: { children: ReactNode }) {
  const { isOpen, isOverlay } = useSidebar();
  const inlineOpen = isOpen && !isOverlay;

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <div
        className={`flex min-h-dvh min-w-0 flex-col transition-[padding] duration-150 ease-out ${
          inlineOpen ? "min-[1200px]:pl-60" : ""
        }`}
      >
        <Header />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
