"use client";

import { createContext, useContext, type ReactNode } from "react";

/** How the detail's inbox controls move to the next arrival, in the host's URL model. */
export interface InboxDetailHost {
  onNext: (fileId: string) => void;
  onClose: () => void;
}

const InboxDetailHostContext = createContext<InboxDetailHost | null>(null);

export function InboxDetailHostProvider({
  value,
  children,
}: {
  value: InboxDetailHost;
  children: ReactNode;
}) {
  return (
    <InboxDetailHostContext.Provider value={value}>
      {children}
    </InboxDetailHostContext.Provider>
  );
}

export function useInboxDetailHost(): InboxDetailHost | null {
  return useContext(InboxDetailHostContext);
}
