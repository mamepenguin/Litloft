import { File, FileAudio, FileImage, FileText, FileVideo } from "lucide-react";
import type { FileType } from "@/types";

const iconMap: Record<FileType, typeof File> = {
  video: FileVideo,
  image: FileImage,
  audio: FileAudio,
  document: FileText,
  other: File,
};

export function FileTypeIcon({
  fileType,
  size = 24,
  className = "",
}: {
  fileType: FileType;
  size?: number;
  className?: string;
}) {
  const Icon = iconMap[fileType] || File;
  return <Icon size={size} className={className} />;
}
