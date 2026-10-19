"use client";

import { useEffect } from "react";

import { isNativeShell, reportPageBackground } from "@/lib/nativeBridge";

function pageBackground(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--bg-primary").trim();
}

/** Tells the shell the page's colour, which it paints beyond the page's edges. */
export function useReportPageBackground(): void {
  useEffect(() => {
    if (!isNativeShell()) return;
    let sent = "";
    const report = () => {
      const colour = pageBackground();
      if (!colour || colour === sent) return;
      sent = colour;
      reportPageBackground(colour);
    };
    report();
    const observer = new MutationObserver(report);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
}
