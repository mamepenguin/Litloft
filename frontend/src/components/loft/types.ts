import type { MediaController } from "@/lib/mediaController";

export interface LoftEmbedProps {
  fileId: string;
  url: string;
  onMediaController?: (mc: MediaController | null) => void;
}
