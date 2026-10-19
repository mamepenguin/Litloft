"use client";

import { Warehouse } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";

/**
 * Strings cross the server/client boundary; a **component does not**.
 * Passing `titleIcon={Warehouse}` from the server compiles and type-checks,
 * and in the running app the whole route 500s.
 */
export function HomeHeader({ greeting }: { greeting?: string }) {
  return <PageHeader titleIcon={Warehouse} title="Litloft" scope={greeting} />;
}

export default HomeHeader;
