"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  orderContexts,
  type ShortcutContextDef,
  type ShortcutDef,
} from "@/lib/shortcuts";

interface ShortcutCheatSheetProps {
  open: boolean;
  stack: ShortcutContextDef[];
  onClose: () => void;
}

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

function formatKeyPart(p: string): string {
  if (p === "ctrl")      return isMac ? "⌘" : "Ctrl";
  if (p === "shift")     return isMac ? "⇧" : "Shift";
  if (p === "alt")       return isMac ? "⌥" : "Alt";
  if (p === "space")     return "Space";
  if (p === "escape")    return "Esc";
  if (p === "arrowleft")  return "←";
  if (p === "arrowright") return "→";
  if (p === "arrowup")    return "↑";
  if (p === "arrowdown")  return "↓";
  return p.toUpperCase();
}

function KbdKey({ value }: { value: string }) {
  const parts = value.split("+").map(formatKeyPart);
  return (
    <span className="flex items-center gap-0.5">
      {parts.map((part, i) => (
        <kbd
          key={i}
          className="inline-flex min-w-[1.5rem] items-center justify-center rounded-lg bg-sand px-2 py-0.5 font-mono text-xs text-text-primary"
        >
          {part}
        </kbd>
      ))}
    </span>
  );
}

function ShortcutList({ shortcuts }: { shortcuts: ShortcutDef[] }) {
  const visible = shortcuts.filter((s) => !s.hidden);
  if (visible.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1">
      {visible.map((s) => (
        <li key={s.key} className="flex items-center justify-between gap-4">
          <span className="text-sm text-text-muted">{s.label}</span>
          <KbdKey value={s.key} />
        </li>
      ))}
    </ul>
  );
}

export function ShortcutCheatSheet({ open, stack, onClose }: ShortcutCheatSheetProps) {
  const t = useTranslations("shortcuts");

  // Close on Escape is handled by ShortcutsProvider, but also handle it here
  // as a safety net in case the provider's listener order differs.
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  // Show every non-global layer in the same order the provider resolves them
  // (overlay tiers first, then most recently pushed), with global at the
  // bottom. Walking the full stack lets a mid-stack context (e.g. an addon
  // root that also has an editor pushed on top) keep its shortcuts visible.
  const globalCtx = stack.find((c) => c.id === "global");
  const sections: ShortcutContextDef[] = orderContexts(stack).filter(
    (ctx) => ctx.id !== "global",
  );
  if (globalCtx) sections.push(globalCtx);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        className="relative z-10 mx-4 w-full max-w-sm rounded-2xl bg-bg-card p-6 shadow-lg animate-fade-in-scale"
        role="dialog"
        aria-modal
        aria-label={t("title")}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">{t("title")}</h2>
          <button
            onClick={onClose}
            className="rounded-xl p-1 text-text-muted transition-colors hover:text-text-primary"
            aria-label={t("close")}
          >
            <X size={18} />
          </button>
        </div>

        {sections.length === 0 ? (
          <p className="text-sm text-text-muted">{t("noShortcuts")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {sections.map((ctx) => {
              const visible = ctx.shortcuts.filter((s) => !s.hidden);
              if (visible.length === 0) return null;
              return (
                <section key={ctx.id}>
                  {ctx.label && (
                    <h3 className="mb-2 text-xs font-medium uppercase text-text-muted">
                      {ctx.label}
                    </h3>
                  )}
                  <ShortcutList shortcuts={ctx.shortcuts} />
                </section>
              );
            })}
          </div>
        )}

        <p className="mt-4 text-center text-xs text-text-muted">
          <KbdKey value="?" /> {t("openHint")}
        </p>
      </div>
    </div>
  );
}
