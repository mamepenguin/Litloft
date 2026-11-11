import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { expect } from "vitest";

import type { InboxItemWire } from "./inboxData";

export async function renderInboxSettled(
  tree: () => ReactElement,
  items: InboxItemWire[],
) {
  const view = render(tree());
  await screen.findByRole("heading", { name: "Inbox" });
  await waitFor(() => {
    if (items.length === 0) {
      expect(screen.getByText("Inbox is empty")).toBeInTheDocument();
      return;
    }
    for (const item of items) {
      const link = document.querySelector(
        `a[href="/files/${item.file.id}?nav=inbox"]`,
      );
      expect(link, `no inbox row links to ${item.file.id}`).not.toBeNull();
    }
  });
  return view;
}
