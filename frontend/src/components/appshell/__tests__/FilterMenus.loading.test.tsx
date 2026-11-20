/**
 * SPEC-CORE-147 I3: a tag-counts answer belongs to the conditions it was
 * requested under. These hold the two boundaries the menu's own tests cannot
 * reach: conditions changing while the menu is closed, and while a earlier
 * load is still out.
 */

import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { FilterMenus } from "@/components/appshell/FilterMenus";

type Candidate = { name: string; count: number };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let loads: Array<{ signal: AbortSignal; d: ReturnType<typeof deferred<Candidate[]>> }>;

function Harness({ conditionsKey }: { conditionsKey: string }) {
  const [tags, setTags] = useState<string[]>([]);
  return (
    <FilterMenus
      tags={tags}
      onToggle={(name) =>
        setTags((held) =>
          held.some((tag) => tag.toLowerCase() === name.toLowerCase())
            ? held.filter((tag) => tag.toLowerCase() !== name.toLowerCase())
            : [...held, name],
        )
      }
      onClear={() => setTags([])}
      loadCandidates={(signal) => {
        const d = deferred<Candidate[]>();
        loads.push({ signal, d });
        return d.promise;
      }}
      conditionsKey={conditionsKey}
      excludeTags={[]}
      state={null}
      onViewerRejected={() => {}}
    />
  );
}

const tagButton = () => screen.getByRole("button", { name: /^Tag/ });

async function answer(index: number, value: Candidate[]) {
  await act(async () => {
    loads[index].d.resolve(value);
  });
}

beforeEach(() => {
  loads = [];
});

describe("SPEC-CORE-147 I3 the conditions a tag-counts answer belongs to", () => {
  it("draws no earlier answer after the conditions change while the menu is closed", async () => {
    const { rerender } = render(<Harness conditionsKey="first" />);
    fireEvent.click(tagButton());
    await waitFor(() => expect(loads).toHaveLength(1));
    await answer(0, [{ name: "stale", count: 1 }]);
    expect(screen.getByText("stale")).toBeInTheDocument();

    fireEvent.keyDown(tagButton(), { key: "Escape" });
    rerender(<Harness conditionsKey="second" />);
    expect(loads).toHaveLength(1);

    fireEvent.click(tagButton());
    await waitFor(() => expect(loads).toHaveLength(2));
    expect(screen.queryByText("stale")).not.toBeInTheDocument();

    await answer(1, [{ name: "fresh", count: 2 }]);
    expect(screen.getByText("fresh")).toBeInTheDocument();
  });

  it("drops an answer that arrives after the conditions changed under an open menu", async () => {
    const { rerender } = render(<Harness conditionsKey="first" />);
    fireEvent.click(tagButton());
    await waitFor(() => expect(loads).toHaveLength(1));

    rerender(<Harness conditionsKey="second" />);
    await waitFor(() => expect(loads).toHaveLength(2));

    await answer(1, [{ name: "fresh", count: 2 }]);
    await answer(0, [{ name: "stale", count: 1 }]);

    expect(screen.getByText("fresh")).toBeInTheDocument();
    expect(screen.queryByText("stale")).not.toBeInTheDocument();
  });
});
