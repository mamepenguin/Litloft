"use client";

import { useParams } from "next/navigation";

import { CollectionDetail } from "@/components/CollectionDetail";

export default function CollectionDetailPage() {
  const params = useParams();
  const driveName = decodeURIComponent(params.name as string);
  const collectionId = decodeURIComponent(params.id as string);
  return <CollectionDetail drive={driveName} collectionId={collectionId} />;
}
