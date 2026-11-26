/**
 * The real `ToastProvider`, with its `useToast()` handle put on `window` so a
 * case can push a toast and measure the frame before it in one task; and a
 * dim drawn by the shared utility, beside the real `DismissScrim`.
 */

import { useEffect, useState, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { DismissScrim } from "@/components/DismissScrim";
import { ToastProvider, useToast } from "@/components/ToastProvider";
import enMessages from "@/messages-core/en.json";

declare global {
  interface Window {
    __toast?: ReturnType<typeof useToast>;
  }
}

function ExposeToast(): null {
  const toast = useToast();
  useEffect(() => {
    window.__toast = toast;
  }, [toast]);
  return null;
}

function ToastStackArrangement(): ReactElement {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ToastProvider>
        <ExposeToast />
        <main className="min-h-screen bg-bg-primary" />
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

function BackdropInArrangement(): ReactElement {
  const [bare, setBare] = useState(false);
  const [menu, setMenu] = useState(false);
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <div className="min-h-screen bg-bg-primary p-4">
        <button type="button" id="open-bare" onClick={() => setBare(true)}>
          bare
        </button>
        <button type="button" id="open-menu" onClick={() => setMenu(true)}>
          menu
        </button>
        {bare && <div id="bare-dim" className="fixed inset-0 bg-black/40 animate-backdrop-in" />}
        {menu && (
          <DismissScrim onDismiss={() => setMenu(false)}>
            <div role="menu" className="fixed inset-x-2 bottom-2 z-40 bg-bg-primary p-4">
              row
            </div>
          </DismissScrim>
        )}
      </div>
    </NextIntlClientProvider>
  );
}

export const MOTION_ARRANGEMENTS: Record<string, () => ReactElement> = {
  "toast-stack": ToastStackArrangement,
  "backdrop-in": BackdropInArrangement,
};
