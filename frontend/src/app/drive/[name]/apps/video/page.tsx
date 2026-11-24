"use client";

import { useParams, useSearchParams } from "next/navigation";

import { useFolderPositionUrl } from "@/components/appshell/useFolderPositionUrl";
import { VideoApp } from "@/components/videoapp/VideoApp";

export default function VideoAppPage() {
  const params = useParams();
  const search = useSearchParams();
  const driveName = decodeURIComponent(params.name as string);
  const { position, chooseFolder, dropTargetAndFolder, dropFolder } = useFolderPositionUrl();
  return (
    <VideoApp
      key={driveName}
      drive={driveName}
      target={search.get("target")}
      homeEntry="video"
      position={position}
      onChooseFolder={chooseFolder}
      onTargetHandled={dropTargetAndFolder}
      onTargetChosen={dropFolder}
    />
  );
}
