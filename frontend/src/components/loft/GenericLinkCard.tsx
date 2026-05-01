"use client";

import { ExternalLink } from "lucide-react";
import type { LoftEmbedProps } from "./types";

export default function GenericLinkCard({ url }: LoftEmbedProps) {
  return (
    <div className="flex w-full flex-col items-center justify-center rounded-xl bg-bg-card py-16">
      <ExternalLink size={48} className="mb-4 text-text-muted" />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-accent-cta hover:underline"
      >
        {url}
      </a>
    </div>
  );
}
