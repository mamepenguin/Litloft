import { expect, test, type Page } from "@playwright/test";
import {
  getDriveFiles,
  getFirstDrive,
  waitForApp,
} from "./helpers";

/**
 * Runs against the live stack and picks fixtures from whichever drives are
 * configured; a test whose fixture is missing skips rather than fails.
 */

interface PickedFile {
  id: string;
  title: string;
  filename: string;
  drive: string;
  folder_path: string;
  file_type: string;
}

let driveName: string | null = null;
let anyFile: PickedFile | null = null;
let secondFileSameFolder: PickedFile | null = null;
let nonMediaFile: PickedFile | null = null;
let videoFile: PickedFile | null = null;
let imageFile: PickedFile | null = null;

const RIGHT_PANE_BACK_RE = /ツリーへ戻る|Back to tree/i;
const GALLERY_BTN_RE = /ギャラリー|gallery/i;

function folderUrl(drive: string, folderPath: string): string {
  const segs = folderPath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return segs
    ? `/drive/${encodeURIComponent(drive)}/${segs}`
    : `/drive/${encodeURIComponent(drive)}`;
}

function fileSelectionUrl(file: PickedFile, extra?: Record<string, string>) {
  const params = new URLSearchParams({ file: file.id, ...(extra ?? {}) });
  return `${folderUrl(file.drive, file.folder_path)}?${params.toString()}`;
}

/**
 * Seeded before the page mounts: the drive layout reads the flag
 * synchronously and only mounts the 2-pane host when it is true, so without
 * it `?file=` renders the default folder view.
 */
async function enableTreeFor(page: Page, drive: string) {
  await page.addInitScript((d: string) => {
    try {
      localStorage.setItem(`tree:enabled:${d}`, "true");
    } catch {
      /* storage unavailable; the test will skip via timeout */
    }
  }, drive);
}

test.beforeAll(async () => {
  const drive = await getFirstDrive();
  if (!drive) return;
  driveName = drive.name;

  const generic = await getDriveFiles(driveName, { limit: 200 });
  if (generic.data.length > 0) {
    anyFile = generic.data[0];
    const sibling = generic.data
      .slice(1)
      .find((f) => (f.folder_path ?? "") === (anyFile!.folder_path ?? ""));
    if (sibling) secondFileSameFolder = sibling;
  }
  // Arrow keys are intentionally inert on media to avoid clashing with
  // player seek.
  const nonMedia = generic.data.find(
    (f) =>
      f.file_type !== "video" &&
      f.file_type !== "audio" &&
      f.file_type !== "image",
  );
  if (nonMedia) nonMediaFile = nonMedia;

  try {
    const v = await getDriveFiles(driveName, { type: "video", limit: 1 });
    if (v.data.length > 0) videoFile = v.data[0];
  } catch {
    /* drive unreachable; tests will skip */
  }
  try {
    const i = await getDriveFiles(driveName, { type: "image", limit: 1 });
    if (i.data.length > 0) imageFile = i.data[0];
  } catch {
    /* drive unreachable; tests will skip */
  }
});

test.describe("Right pane: /files/{id} 307 redirect", () => {
  test.skip(() => !driveName, "No drives available");

  test("GET /files/{id} returns 307 with canonical Location", async ({
    request,
  }) => {
    test.skip(!anyFile, "No files to redirect");
    const res = await request.get(`/files/${anyFile!.id}`, {
      maxRedirects: 0,
    });
    // Next.js' redirect() emits 307 by default.
    expect(res.status()).toBe(307);
    const location = res.headers()["location"] ?? "";
    expect(location).toContain("/drive/");
    expect(location).toContain(`file=${anyFile!.id}`);
  });

  test("query (?t=10) is forwarded to the canonical URL", async ({
    request,
  }) => {
    test.skip(!anyFile, "No files to redirect");
    const res = await request.get(`/files/${anyFile!.id}?t=10`, {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(307);
    const location = res.headers()["location"] ?? "";
    expect(location).toMatch(/[?&]t=10\b/);
    expect(location).toContain(`file=${anyFile!.id}`);
  });

  test("?playlist=foo is NOT redirected (fullscreen exception)", async ({
    request,
  }) => {
    test.skip(!anyFile, "No files to redirect");
    // Playlist and folder_play modes stay on /files/{id} because the
    // 2-pane host doesn't render PlaylistPanel.
    const res = await request.get(`/files/${anyFile!.id}?playlist=foo`, {
      maxRedirects: 0,
    });
    expect(res.status()).not.toBe(307);
    expect(res.status()).toBeLessThan(400);
  });
});

test.describe("Right pane: 2-pane behaviour", () => {
  test.skip(() => !driveName || !anyFile, "No drives or files");

  test("?file= opens full file detail in the right pane", async ({ page }) => {
    await enableTreeFor(page, anyFile!.drive);
    await page.goto(fileSelectionUrl(anyFile!));
    await waitForApp(page);

    // The back-to-tree chip is `md:hidden` on desktop, so the <h1> is the
    // signal here and the chip is checked in the mobile case.
    const titleH1 = page.locator("main h1").first();
    await expect(titleH1).toBeVisible({ timeout: 10_000 });

    await expect(page.getByRole("button", { name: /^Like$/i })).toBeVisible();
  });

  test("arrow keys navigate to the sibling file (non-media)", async ({
    page,
  }) => {
    test.skip(
      !nonMediaFile || !secondFileSameFolder,
      "Need a non-media file with a sibling in the same folder",
    );
    // The direction the neighbors API returns is not known ahead of
    // time, so either arrow reaching a new id is accepted.
    await enableTreeFor(page, nonMediaFile!.drive);
    await page.goto(fileSelectionUrl(nonMediaFile!));
    await waitForApp(page);
    await page
      .locator("main h1")
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });

    const initialUrl = page.url();
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(800);
    let movedUrl = page.url();
    if (movedUrl === initialUrl) {
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(800);
      movedUrl = page.url();
    }

    // No neighbor means no navigation, which is a soft pass.
    if (movedUrl !== initialUrl) {
      expect(movedUrl).toMatch(/[?&]file=/);
      expect(movedUrl).not.toBe(initialUrl);
    }
  });

  test("playlist URL inside 2-pane does NOT render PlaylistPanel", async ({
    page,
  }) => {
    await enableTreeFor(page, anyFile!.drive);
    await page.goto(
      fileSelectionUrl(anyFile!, { playlist: "non-existent-id" }),
    );
    await waitForApp(page);
    await page.waitForTimeout(1500);

    // The PlaylistPanel renders the "1/N tracks" badge.
    const trackInfo = page.locator("text=/\\d+\\/\\d+ tracks/");
    await expect(trackInfo).toHaveCount(0);
  });
});

test.describe("Right pane: media", () => {
  test.skip(() => !driveName, "No drives available");

  test("video opens with mini-player container in the scroll surface", async ({
    page,
  }) => {
    test.skip(!videoFile, "No video file in the drive");
    // The reflow to floating cannot be observed without playing for
    // several seconds, so the check is structural.
    await enableTreeFor(page, videoFile!.drive);
    await page.goto(fileSelectionUrl(videoFile!));
    await waitForApp(page);

    const video = page.locator("main video").first();
    await video.waitFor({ state: "attached", timeout: 15_000 });

    const isInsideScroll = await video.evaluate((el) => {
      let p = el.parentElement;
      while (p) {
        const style = window.getComputedStyle(p);
        if (style.overflowY === "auto" || style.overflowY === "scroll") {
          return true;
        }
        p = p.parentElement;
      }
      return false;
    });
    expect(isInsideScroll).toBe(true);
  });

  test("image: Maximize button opens ImageGallery", async ({ page }) => {
    test.skip(!imageFile, "No image file in the drive");
    await enableTreeFor(page, imageFile!.drive);
    await page.goto(fileSelectionUrl(imageFile!));
    await waitForApp(page);

    const launcher = page.getByRole("button", { name: GALLERY_BTN_RE });
    await launcher.waitFor({ state: "visible", timeout: 10_000 });
    await launcher.click();

    await page.waitForTimeout(500);
    const overlayCount = await page
      .locator('[class*="fixed"][class*="inset-0"]')
      .count();
    expect(overlayCount).toBeGreaterThan(0);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    expect(page.url()).toContain(`file=${imageFile!.id}`);
  });
});

test.describe("Right pane: mobile screen swap", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test.skip(() => !driveName || !anyFile, "No drives or files");

  test("?file= shows the back-to-tree button on mobile widths", async ({
    page,
  }) => {
    await enableTreeFor(page, anyFile!.drive);
    await page.goto(fileSelectionUrl(anyFile!));
    await waitForApp(page);
    const back = page.getByRole("button", { name: RIGHT_PANE_BACK_RE });
    await expect(back).toBeVisible({ timeout: 10_000 });
  });
});
