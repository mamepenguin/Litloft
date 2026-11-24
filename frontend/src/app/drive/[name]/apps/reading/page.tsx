"use client";

import { useParams, useSearchParams } from "next/navigation";

import { useFolderPositionUrl } from "@/components/appshell/useFolderPositionUrl";
import { ReadingApp } from "@/components/readingapp/ReadingApp";

export default function ReadingAppPage() {
  const params = useParams();
  const search = useSearchParams();
  const driveName = decodeURIComponent(params.name as string);
  const { position, chooseFolder, dropTargetAndFolder, dropFolder } = useFolderPositionUrl();
  return (
    <ReadingApp
      key={driveName}
      drive={driveName}
      target={search.get("target")}
      homeEntry="reading"
      position={position}
      onChooseFolder={chooseFolder}
      onTargetHandled={dropTargetAndFolder}
      onTargetChosen={dropFolder}
    />
  );
}
