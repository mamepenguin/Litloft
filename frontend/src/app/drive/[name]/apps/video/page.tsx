"use client";

import { useParams } from "next/navigation";

import { VideoApp } from "@/components/videoapp/VideoApp";

export default function VideoAppPage() {
  const params = useParams();
  const driveName = decodeURIComponent(params.name as string);
  return <VideoApp key={driveName} drive={driveName} />;
}
