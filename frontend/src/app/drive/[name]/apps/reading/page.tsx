"use client";

import { useParams } from "next/navigation";

import { ReadingApp } from "@/components/readingapp/ReadingApp";

export default function ReadingAppPage() {
  const params = useParams();
  const driveName = decodeURIComponent(params.name as string);
  return <ReadingApp key={driveName} drive={driveName} />;
}
