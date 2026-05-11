"use client";

import { useEffect, useRef, useState } from "react";
import { getRenderUrl } from "@/lib/api";

interface HtmlPreviewProps {
  fileId: string;
  fullscreen?: boolean;
}

const INITIAL_HEIGHT = 480;

export function HtmlPreview({ fileId, fullscreen = false }: HtmlPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number>(INITIAL_HEIGHT);

  useEffect(() => {
    if (fullscreen) return;

    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== "litloft:height") return;
      const value = Number(data.value);
      if (!Number.isFinite(value) || value <= 0) return;
      setHeight(value);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [fullscreen]);

  const src = fullscreen
    ? `${getRenderUrl(fileId)}#litloft-fullscreen`
    : getRenderUrl(fileId);

  const style = fullscreen
    ? { height: "100dvh", minHeight: "100dvh" }
    : { height: `${height}px`, minHeight: "50vh" };

  return (
    <iframe
      ref={iframeRef}
      src={src}
      sandbox="allow-scripts allow-popups"
      className="w-full border-0 bg-bg-card"
      style={style}
      title="HTML preview"
    />
  );
}
