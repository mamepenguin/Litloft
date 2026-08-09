import { expect, test } from "@playwright/test";

test("opens a drive-scoped capture basket and edits a capture note", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "litloft:source-captures:eval-drive",
      JSON.stringify([
        {
          id: "cap-e2e",
          drive: "eval-drive",
          sourceFileId: "e2e-source-01",
          filename: "source-video.mp4",
          fileType: "video",
          kind: "media_timestamp",
          locator: { seconds: 65 },
          capturedAt: "2026-08-10T00:00:00.000Z",
        },
      ]),
    );
  });

  await page.goto("/drive/eval-drive");

  const basketButton = page.getByRole("button", {
    name: /Capture basket|引用バスケット/,
  });
  await expect(basketButton).toBeVisible();
  await basketButton.click();

  const dialog = page.getByRole("dialog", {
    name: /Capture basket|引用バスケット/,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("source-video.mp4")).toBeVisible();
  await expect(dialog.getByText("1:05")).toBeVisible();

  const note = dialog.getByPlaceholder(/Add a note|メモを追加/);
  await note.fill("Review this section");
  await expect(note).toHaveValue("Review this section");

  await dialog
    .getByRole("button", { name: /Save .* to new note|件を新規ノートへ保存/ })
    .click();
  const filenameDialog = page.getByRole("dialog", {
    name: /Save captures to new note|引用を新規ノートへ保存/,
  });
  await expect(filenameDialog).toBeVisible();
  await expect(filenameDialog.getByLabel(/Filename|ファイル名/)).toHaveValue(
    /^captures-\d{4}-\d{2}-\d{2}-\d{6}-\d{3}\.md$/,
  );
  const [basketZIndex, filenameZIndex] = await Promise.all([
    dialog.evaluate((element) => Number(getComputedStyle(element).zIndex)),
    filenameDialog.evaluate((element) => Number(getComputedStyle(element).zIndex)),
  ]);
  expect(filenameZIndex).toBeGreaterThan(basketZIndex);
  await page.keyboard.press("Escape");
  await expect(filenameDialog).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBe(0);
  expect(box!.width).toBe(390);
  expect(Math.round(box!.y + box!.height)).toBe(844);
});
