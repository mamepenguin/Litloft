"use client";

import { useEffect, useRef, useState } from "react";

import type { FileItem } from "@/types";

/**
 * An on/off control over a file that shows its new state before the
 * server confirms it.
 *
 * The pending flag is what makes syncing from the prop safe: the parent's
 * value is authoritative except while a request is in flight, when the
 * local guess has to stand or the control would visibly snap back and
 * forth on every re-render.
 */
export function useOptimisticFileToggle({
  value,
  mutate,
  onToggle,
}: {
  value: boolean;
  mutate: () => Promise<FileItem>;
  onToggle: (file: FileItem) => void;
}) {
  const [optimistic, setOptimistic] = useState(value);
  const [pending, setPending] = useState(false);
  const iconRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!pending) setOptimistic(value);
  }, [value, pending]);

  const current = pending ? optimistic : value;

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;

    setOptimistic(!current);
    setPending(true);
    if (!current && iconRef.current) {
      // Reading offsetWidth between remove and add restarts the animation
      // when the class is already on the node.
      iconRef.current.classList.remove("animate-pop");
      void (iconRef.current as unknown as HTMLElement).offsetWidth;
      iconRef.current.classList.add("animate-pop");
    }
    try {
      onToggle(await mutate());
    } catch {
      setOptimistic(current);
    } finally {
      setPending(false);
    }
  }

  return { current, iconRef, toggle };
}
