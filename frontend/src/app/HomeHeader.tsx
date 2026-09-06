"use client";

import { Warehouse } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";

/**
 * The home page's header, on the client side of the boundary.
 *
 * `page.tsx` is a Server Component — it reads cookies and talks to the
 * backend directly — and `PageHeader` is a client one. Strings cross that
 * boundary; a **component does not**. Passing `titleIcon={Warehouse}` from
 * the server compiles, type-checks, and renders correctly in every unit
 * test, because a test renders `await Home()` as one ordinary React tree
 * and never serialises anything. In the running app it is
 * "Functions cannot be passed directly to Client Components", and the
 * whole route 500s.
 *
 * So the icon is chosen here, where it is already client code, and the
 * page hands over the one value it actually knows: the greeting.
 */
export function HomeHeader({ greeting }: { greeting?: string }) {
  return <PageHeader titleIcon={Warehouse} title="Litloft" scope={greeting} />;
}

export default HomeHeader;
