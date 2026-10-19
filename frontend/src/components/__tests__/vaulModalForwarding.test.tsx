import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Drawer } from "vaul";

function OpenDrawer({ modal }: { modal: boolean }) {
  return (
    <>
      <div data-testid="page">page</div>
      <Drawer.Root open modal={modal}>
        <Drawer.Portal>
          <Drawer.Content data-testid="drawer">
            <Drawer.Title>t</Drawer.Title>
            <Drawer.Description>d</Drawer.Description>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}

describe("vaul forwards modal to Radix", () => {
  it("leaves the rest of the document exposed when modal is false", () => {
    render(<OpenDrawer modal={false} />);
    expect(screen.getByTestId("drawer")).toBeInTheDocument();
    expect(
      screen.getByTestId("page").closest("[aria-hidden='true']"),
    ).toBeNull();
    expect(document.body.style.pointerEvents).not.toBe("none");
  });

  it("still hides the rest of the document when modal is true", () => {
    render(<OpenDrawer modal />);
    expect(screen.getByTestId("drawer")).toBeInTheDocument();
    expect(
      screen.getByTestId("page").closest("[aria-hidden='true']"),
    ).not.toBeNull();
  });
});
