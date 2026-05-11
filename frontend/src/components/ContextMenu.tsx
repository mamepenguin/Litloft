"use client";

import { useEffect, useRef, type ComponentType } from "react";
import { useShortcuts } from "@/hooks/useShortcuts";

export interface MenuItem {
  icon: ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  open: boolean;
  position: { x: number; y: number };
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ open, position, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useShortcuts(
    "context-menu",
    "",
    [{ key: "escape", label: "Close", handler: onClose, hidden: true }],
    open,
  );

  useEffect(() => {
    if (!open || !menuRef.current) return;
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const x = Math.max(8, Math.min(position.x, vw - rect.width - 8));
    const y = Math.max(8, Math.min(position.y, vh - rect.height - 8));
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  }, [open, position]);

  if (!open) return null;

  return (
    <>
      {/* Full-screen overlay absorbs all pointer events outside the menu,
          preventing clicks from reaching underlying elements. */}
      <div
        className="fixed inset-0 z-49"
        onPointerDown={(e) => {
          e.preventDefault();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        className="fixed z-50 w-44 overflow-hidden rounded-2xl border border-bg-border bg-bg-card shadow-lg animate-fade-in-scale"
        style={{ left: position.x, top: position.y }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
              // Use requestAnimationFrame to let the menu close before opening dialog
              requestAnimationFrame(() => item.onClick());
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
              item.danger
                ? "text-danger hover:bg-accent/10"
                : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            }`}
          >
            <item.icon size={14} />
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
