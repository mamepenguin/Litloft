"use client";

import { useEffect, type ReactElement, type ReactNode } from "react";
import { useShortcutsContext } from "./ShortcutsProvider";
import type { ShortcutContextDef } from "@/lib/shortcuts";

interface ShortcutLayerProps {
  context: ShortcutContextDef;
  children: ReactNode;
}

export function ShortcutLayer({ context, children }: ShortcutLayerProps): ReactElement {
  const { push, pop } = useShortcutsContext();

  useEffect(() => {
    push(context);
    return () => pop(context.id);
    // context.id is the stable identity; the full context object is
    // re-registered by useShortcuts via ref, not by re-mounting here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.id, push, pop]);

  return <>{children}</>;
}
