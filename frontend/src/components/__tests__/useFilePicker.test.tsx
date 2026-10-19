import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { useFilePicker } from "../useFilePicker";

function Harness() {
  const picker = useFilePicker();
  return (
    <div data-upload-zone>
      {picker.input}
      <button onClick={picker.open}>pick</button>
    </div>
  );
}

const fileOf = (name: string) =>
  new File(["x"], name, { type: "text/plain" });

describe("useFilePicker", () => {
  it("clicks the input it renders", () => {
    render(<Harness />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const clicked = vi.fn();
    input.addEventListener("click", clicked);

    fireEvent.click(screen.getByRole("button", { name: "pick" }));
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("takes more than one file", () => {
    render(<Harness />);
    expect(
      document.querySelector<HTMLInputElement>('input[type="file"]'),
    ).toHaveAttribute("multiple");
  });

  it("delivers what was chosen to the upload zone, as an array", () => {
    render(<Harness />);
    const zone = document.querySelector<HTMLElement>("[data-upload-zone]")!;
    const received: unknown[] = [];
    zone.addEventListener("upload-files", (e) => {
      received.push((e as CustomEvent).detail);
    });

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [fileOf("a.txt"), fileOf("b.txt")] } });

    expect(received).toHaveLength(1);
    const detail = received[0] as File[];
    expect(detail.map((f) => f.name)).toEqual(["a.txt", "b.txt"]);
  });

  it("clears its value, so the same file can be chosen twice running", () => {
    render(<Harness />);
    const zone = document.querySelector<HTMLElement>("[data-upload-zone]")!;
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const seen: string[][] = [];
    zone.addEventListener("upload-files", (e) => {
      seen.push(((e as CustomEvent).detail as File[]).map((f) => f.name));
    });

    fireEvent.change(input, { target: { files: [fileOf("a.txt")] } });
    // Without the reset the browser fires no second change event for an
    // unchanged value.
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { files: [fileOf("a.txt")] } });
    expect(seen).toEqual([["a.txt"], ["a.txt"]]);
  });

  it("says nothing when there is no upload zone to say it to", () => {
    function Bare() {
      const picker = useFilePicker();
      return <>{picker.input}</>;
    }
    render(<Bare />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(() =>
      fireEvent.change(input, { target: { files: [fileOf("a.txt")] } }),
    ).not.toThrow();
  });
});
