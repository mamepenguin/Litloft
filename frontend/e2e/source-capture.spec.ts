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
  await expect(
    dialog.getByRole("button", { name: /Append to Inbox\.md|Inbox\.md へ追記/ }),
  ).toBeVisible();
  await expect(dialog.getByText("Captures/Inbox.md")).toBeVisible();

  const note = dialog.getByPlaceholder(/Add a note|メモを追加/);
  await note.fill("Review this section");
  await expect(note).toHaveValue("Review this section");

  await dialog
    .getByRole("button", { name: /Other save methods|その他の保存方法/ })
    .click();
  await dialog
    .getByRole("button", { name: /Save \d+ captures|\d+ 件の引用を保存/ })
    .click();
  const filenameDialog = page.getByRole("dialog", {
    name: /Save capture note|引用ノートを保存/,
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

test("adds a transcript search hit and quick-appends it to Inbox", async ({
  page,
}) => {
  const file = {
    id: "search-source-01",
    filename: "search-source.mp4",
    title: "Search source",
    description: "",
    drive: "eval-drive",
    folder_path: "",
    file_type: "video",
    mime_type: "video/mp4",
    thumbnail_url: "",
    has_thumbnail: false,
    file_size: 100,
    duration: 120,
    likes: 0,
    is_favorite: false,
    tags: [],
    subtitles: [],
    deleted_at: null,
    missing_since: null,
    created_at: "2026-08-10T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
  };

  await page.route("**/api/addons/status?drive=eval-drive", async (route) => {
    await route.fulfill({ json: {
      addons: {
        intelligence: { label: "Intelligence", scope: "drive" },
        knowledge: { label: "Knowledge", scope: "drive" },
      },
      slots: {
        "header-actions": [{
          id: "knowledge-capture-basket",
          label: "Capture Basket",
          priority: 10,
          addonName: "knowledge",
        }],
        "search-result-actions": [{
          id: "knowledge-search-capture",
          label: "Capture Search Evidence",
          priority: 10,
          addonName: "knowledge",
        }],
      },
    } });
  });
  await page.route("**/api/drives/eval-drive/files?*", async (route) => {
    await route.fulfill({ json: {
      data: [],
      meta: { total: 0, page: 1, limit: 24 },
    } });
  });
  await page.route("**/api/addons/intelligence/search?*", async (route) => {
    await route.fulfill({ json: {
      available: true,
      results: [{
        file_id: file.id,
        drive: file.drive,
        filename: file.filename,
        file_type: file.file_type,
        score: 0.9,
        match_types: ["transcript"],
        segments: [{
          time_range: [12, 18],
          matches: [{
            type: "transcript",
            score: 0.9,
            text: "Verbatim transcript evidence",
          }],
        }],
        file,
      }],
    } });
  });

  const commit = page.waitForRequest((request) =>
    request.url().endsWith("/api/addons/knowledge/captures/commit") &&
    request.method() === "POST"
  );
  await page.route("**/api/addons/knowledge/captures/commit", async (route) => {
    await route.fulfill({ json: {
      note_file_id: "inbox-note",
      note_path: "Captures/Inbox.md",
      etag: "etag-1",
      committed: 1,
    } });
  });

  await page.goto("/drive/eval-drive/search?q=evidence");
  // The core paints the snippet; the Knowledge action is revealed on the row.
  const snippet = page.getByText("Verbatim transcript evidence");
  await expect(snippet).toBeVisible();
  await snippet.hover();
  await page.getByRole("button", {
    name: /Add this match to the capture basket|一致箇所を引用バスケットへ追加/,
  }).click();
  await page.getByRole("button", {
    name: /Capture basket|引用バスケット/,
  }).click();
  const dialog = page.getByRole("dialog", {
    name: /Capture basket|引用バスケット/,
  });
  await expect(dialog.getByText("Verbatim transcript evidence")).toBeVisible();
  await dialog.getByRole("button", {
    name: /Append to Inbox\.md|Inbox\.md へ追記/,
  }).click();

  const body = (await commit).postDataJSON();
  expect(body.target).toMatchObject({
    mode: "quick",
    folder: "Captures",
    filename: "Inbox.md",
  });
  expect(body.captures).toEqual([
    expect.objectContaining({
      source_file_id: file.id,
      kind: "transcript",
      quote: "Verbatim transcript evidence",
      locator: expect.objectContaining({ seconds: 12, end_seconds: 18 }),
    }),
  ]);
  await expect(dialog).toBeHidden();
});
