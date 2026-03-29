import { expect, test } from "@playwright/test";
import {
  addPlaylistItems,
  createPlaylist,
  deletePlaylist,
  getDriveFiles,
  getFirstDrive,
  waitForApp,
} from "./helpers";

let driveName: string;
let playableFileId: string;
let createdPlaylistId: string | null = null;

const PLAYLIST_NAME = `_e2e_test_${Date.now()}`;

test.beforeAll(async () => {
  const drive = await getFirstDrive();
  if (!drive) return;
  driveName = drive.name;

  // Find a playable file (audio or video)
  const audioRes = await getDriveFiles(driveName, { type: "audio", limit: 1 });
  if (audioRes.data.length > 0) {
    playableFileId = audioRes.data[0].id;
  } else {
    const videoRes = await getDriveFiles(driveName, { type: "video", limit: 1 });
    if (videoRes.data.length > 0) {
      playableFileId = videoRes.data[0].id;
    }
  }
});

test.afterAll(async () => {
  if (createdPlaylistId && driveName) {
    await deletePlaylist(driveName, createdPlaylistId).catch(() => {});
  }
});

test.describe("Playlist", () => {
  test.skip(() => !driveName || !playableFileId, "No drive or playable files");

  test("playlist appears in sidebar after API creation", async ({ page }) => {
    // Create playlist via API
    const pl = await createPlaylist(driveName, PLAYLIST_NAME);
    createdPlaylistId = pl.id;

    // Add a file to it
    await addPlaylistItems(driveName, pl.id, [playableFileId]);

    // Navigate to drive page and verify playlist is in sidebar
    await page.goto(`/drive/${encodeURIComponent(driveName)}`);
    await waitForApp(page);

    // The playlist should appear in the sidebar
    const playlistBtn = page.locator("aside").getByText(PLAYLIST_NAME).last();
    await expect(playlistBtn).toBeVisible({ timeout: 10_000 });
  });

  test("clicking playlist navigates to playback", async ({ page }) => {
    test.skip(!createdPlaylistId, "Playlist not created");

    await page.goto(`/drive/${encodeURIComponent(driveName)}`);
    await waitForApp(page);

    // Click the playlist in sidebar (it's a button that triggers router.push)
    const playlistBtn = page.locator("aside").getByText(PLAYLIST_NAME).last();
    await expect(playlistBtn).toBeVisible({ timeout: 10_000 });
    await playlistBtn.click();

    // Should navigate to file page with playlist param
    await page.waitForURL(/\/files\/.*playlist=/, { timeout: 10_000 });

    // Playlist panel should be visible
    const trackInfo = page.locator("text=/1\\/\\d+ tracks/");
    await expect(trackInfo).toBeVisible({ timeout: 5_000 });
  });

  test("cleanup: delete playlist via API", async () => {
    test.skip(!createdPlaylistId, "Playlist not created");
    await deletePlaylist(driveName, createdPlaylistId!);
    createdPlaylistId = null;
  });
});
