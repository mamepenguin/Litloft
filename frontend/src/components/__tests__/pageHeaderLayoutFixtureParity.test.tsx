import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PageHeader } from "../PageHeader";

const FIXTURE = readFileSync(
  join(__dirname, "..", "..", "..", "e2e-layout", "fixtures", "page-header-wrap.html"),
  "utf8",
);

const normalise = (className: string) =>
  className.split(/\s+/).filter(Boolean).sort().join(" ");

const fixtureClasses = new Set(
  [...FIXTURE.matchAll(/class="([^"]*)"/g)].map((m) => normalise(m[1])),
);

describe("the page-header-wrap fixture draws what PageHeader draws", () => {
  it("carries the classes of the scope-and-actions row and the actions group", () => {
    render(
      <PageHeader
        title="Shelf"
        titleField={<input defaultValue="Shelf" />}
        scope={<span>scope</span>}
        actions={<button>action</button>}
      />,
    );

    const row = screen.getByText("scope").parentElement!.parentElement!;
    const group = screen.getByText("action").parentElement!;

    expect(fixtureClasses).toContain(normalise(row.getAttribute("class") ?? ""));
    expect(fixtureClasses).toContain(normalise(group.getAttribute("class") ?? ""));
  });
});
