# media_import addon

The `media_import` addon turns URLs into lightweight `.loft` reference files. The reference holds metadata and player hints; playback uses an embedded provider player (YouTube, Vimeo) rather than a downloaded copy of the file.

## What it provides

- **URL → `.loft`** — paste a URL, get a tiny JSON file in the chosen folder with provider, ID, title, channel, description, thumbnail, and captions.
- **Metadata fetch** — yt-dlp extracts metadata for any of the 1000+ platforms it supports.
- **Caption import** — `.vtt` subtitles (auto and manual, multiple languages) are downloaded and stored alongside the `.loft`.
- **Provider embeds** — YouTube and Vimeo files render as native embedded players in the file viewer; SoundCloud falls back to a generic link card (Phase 1).
- **Avatar caching** — channel avatars are cached locally for use in the metadata sidebar.

It is in-process, drive-scoped, and adds a *Loft Metadata* file-detail section.

> **Image needed:** file detail page of a `.loft` file showing the embedded YouTube player and the metadata sidebar.

## Installation

media_import is in-process. The repository ships it as a submodule under `addons/media_import/`; the backend Dockerfile copies every addon's `backend/` directory into the image at build time, so a plain rebuild is enough to pick it up:

```bash
docker compose up -d --build
```

`yt-dlp` is declared in the addon's own `requirements.txt`, which the backend Dockerfile installs alongside its own dependencies during the image build.

For local development (running the backend outside Docker) symlink the addon into the core tree with `./setup-addons.sh`.

## Per-drive policy

`drives.json`:

```json
{
  "name": "YouTube",
  "addons": {
    "media_import": {
      "url_import": true
    }
  }
}
```

| Flag | Default | What it does |
|---|---|---|
| `url_import` | `true` | Whether the addon accepts new URL imports for this drive. |

If absent, graceful-degradation kicks in (`true`).

## Importing a URL

Two paths:

- **From the UI** — open a folder and click *Import URL* in the folder action menu (contributed by the addon). Paste a URL, hit *Import*, the `.loft` file is created in that folder.
- **From the API** — `POST /api/addons/media_import/import` with `{ "drive": "...", "folder": "...", "url": "..." }`.

The pipeline:

1. **Provider detection** — URL pattern match (YouTube, Vimeo, SoundCloud).
2. **Metadata fetch** — yt-dlp `--dump-json --no-download`.
3. **Caption fetch** — yt-dlp `--write-subs --write-auto-subs --sub-langs all` (deduplicated across platform variants).
4. **Avatar fetch** — channel thumbnail downloaded to `data/media_import_avatars/<provider>/<channel_id>.jpg`.
5. **Write `.loft`** — JSON file with the structured metadata.
6. **Index** — the core scanner picks up the new `.loft` file on its next pass (startup or a manual rescan), reflected by the `scan.complete` event.

## The `.loft` format

A `.loft` file is JSON. Schema:

```json
{
  "version": 1,
  "provider": "youtube",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "external_id": "dQw4w9WgXcQ",
  "title": "Never Gonna Give You Up",
  "channel": {
    "id": "UCuAXFkgsw1L7xaCfnd5JJOw",
    "name": "Rick Astley",
    "avatar": "media_import/avatars/youtube/UCuAXFkgsw1L7xaCfnd5JJOw.jpg"
  },
  "description": "...",
  "published_at": "2009-10-25T06:57:33Z",
  "duration_s": 213,
  "thumbnail": "https://...",
  "captions": [
    { "lang": "en", "auto": false, "path": "captions/en.vtt" },
    { "lang": "ja", "auto": true, "path": "captions/ja.vtt" }
  ]
}
```

Caption files live in a sibling directory inside the same drive (path relative to the `.loft`).

## Player embedding

The file viewer routes `.loft` files through an *adaptive player* dispatcher:

| Provider | Player | Notes |
|---|---|---|
| YouTube | Embedded YouTube IFrame Player | Honours channel restrictions, adds optional language picker for captions. |
| Vimeo | Embedded Vimeo Player | Privacy-respecting embed where the source allows it. |
| SoundCloud (Phase 1) | Link card | A native player is on the roadmap. |
| Other | Link card | Fallback when no provider integration exists. |

Resume positions for `.loft` files are tracked in the same `WatchHistory` table as native files (the embedded player posts progress through a postMessage bridge).

## Loft Metadata file-detail section

Below the embedded player, the addon contributes a *Loft Metadata* card:

- Channel thumbnail and name (linkable to the channel page on the provider).
- Description (collapsed; expand to full).
- Publication date.
- Caption list with language picker.
- *Refresh metadata* button — re-runs yt-dlp.

## Search integration

`.loft` files participate in core search like any other file:

- Filename (typically the imported title), title, and description are indexed.
- When the [intelligence addon](intelligence.md) is enabled, captions become transcript chunks and feed semantic search and Ask. This is the most useful integration: ask *"what was the video where they explained X?"* and Ask retrieves the relevant `.loft` with a timestamp citation.

## Subscriptions

Subscriptions let the addon track YouTube channels and playlists, then poll
periodically for new videos.

- Channel / playlist registration: paste a YouTube channel or playlist URL in
  the Media Import UI, or call `POST /api/addons/media_import/subscriptions`.
- Manual sync is available from the UI and via
  `POST /api/addons/media_import/subscriptions/{id}/sync`.
- Periodic polling discovers new uploads and creates `.loft` files in the
  configured folder.
- The Subscriptions dashboard surfaces follows, status, recent imports,
  failures, and retry / conflict-resolution actions.

## Limits and caveats

- **No automatic file download.** The addon never downloads media. If you want the actual MP4, pair it with a separate downloader addon (planned).
- **Rate limits.** yt-dlp scrapes web pages; aggressive bulk imports can trigger captchas. Throttle by inserting delays between imports.
- **Provider terms.** Some platforms forbid embedding outside their site. Honour their terms; cloud-sync replicating cached `.loft` files is fine but the **content** is hosted by the provider.
- **No DRM.** Encrypted streams (Netflix, Apple TV+, Spotify) are out of scope for yt-dlp.

## Privacy

- yt-dlp uses public scraping for most providers; nothing is sent to third parties beyond fetching the metadata.
- Channel avatars are cached locally — they are not re-fetched on every render.
- Captions and descriptions live in the drive directory; respect privacy of personal notes you may add.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Import says *Unable to extract video data* | yt-dlp is out of date; rebuild the backend image (`docker compose up -d --build`). |
| Captions panel is empty | The provider does not expose subtitles for this video. Try *auto-generated* if available. |
| Embedded player blanked out | Provider-side embed restriction. Open the original URL in a tab. |
| `Refresh metadata` does nothing | Network blocked, or provider changed their HTML. Check `docker compose logs backend`. |

## See also

- [yt-dlp documentation](https://github.com/yt-dlp/yt-dlp) for supported providers.
- [Addon overview](overview.md) for the policy model.
