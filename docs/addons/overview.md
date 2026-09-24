# Addon overview

Addons are optional parts of Litloft. Each one is its own Git repository, checked out as a submodule under `addons/<name>/`. You choose which drives use each addon. To write your own, see [Addon development](../ADDON-DEVELOPMENT.md).

## The four addons

| Addon | Runs as | Scope | What it adds |
|---|---|---|---|
| [intelligence](intelligence.md) | Its own container (port 8100) | drive | Semantic search, Ask, summaries, transcripts, image descriptions |
| [knowledge](knowledge.md) | Its own container (port 8200) | drive | Markdown notes and editor, web clips, capture basket, connections graph |
| [cloud-sync](cloud-sync.md) | Inside the backend | global | Scheduled rclone backups |
| [media_import](media-import.md) | Inside the backend | drive | Video URLs as `.loft` files (YouTube, Vimeo), channel subscriptions |

## Two kinds of addon

**Inside the backend.** The addon's code is copied into the backend image when it is built, and loads with the backend. There is no extra container. A fault in the addon can affect the backend. `cloud-sync` and `media_import` work this way.

**Separate service.** The addon has its own `Dockerfile` and container. The browser reaches it through the backend at `/api/addons/<name>/...`, and it reads Litloft data through an internal API on the Docker network. It is isolated from the backend and can use heavy dependencies without enlarging the backend image. `intelligence` and `knowledge` work this way. Their containers should wait for the backend with `depends_on: condition: service_healthy`.

## Scope

- **drive**: the addon works on one drive at a time. Its page is under `/drive/<drive>/addons/<name>`.
- **global**: the addon is not tied to a drive. cloud-sync is a card on the admin dashboard that covers every drive.

## Per-drive policy

Each drive can turn each addon, or one of its features, on or off. Edit this under **Addon policy** at `/admin/settings` (see [Settings GUI](../admin-guide/settings-gui.md#addon-policy)), or in `drives.json`:

```json
{
  "name": "Photos",
  "path": "/app/drives/photos",
  "addons": {
    "intelligence": { "transcription_cloud": false },
    "knowledge": false
  }
}
```

- `true` turns every feature of the addon on, and `false` turns every feature off.
- An object turns single features on or off.
- Anything not listed is on.

A change saved in the settings GUI applies to the backend at once. A change made by editing `drives.json` needs a backend restart. Addons that check the policy themselves may take a short time to notice; see each addon's page.

Turning an addon off for a drive hides its menus, panels and pages on that drive. Routes reached through the backend's addon proxy answer `404` for that drive. The routes of an addon that runs inside the backend keep answering.

What happens to data the addon already stored depends on the addon. The intelligence addon deletes its data for a turned-off drive the next time it starts. The knowledge addon keeps it, and the notes themselves are ordinary files on the drive.

## Where addons appear

Addons add entries to fixed places in the interface: search modes, sections in a file's **Info** tab, tabs beside the player, the **Related** tab, the file's action row and `...` menu, the **Add** menu, the header, the sidebar, and the admin dashboard. When no addon uses a place, nothing is shown there. The full list of places is in [Addon development](../ADDON-DEVELOPMENT.md#available-slots).

## File events

The backend tells separate-service addons when files are created, updated, moved, deleted, restored, purged, go missing or come back, when folders change, and when a scan finishes. `configure.py` builds the list of listeners, `event-hooks.json`, from each enabled addon's `manifest.json`, and mounts it into the backend. Each addon checks a shared secret on these calls, for example `KNOWLEDGE_WEBHOOK_SECRET`. Set the same value on the backend and the addon.

Events for a drive where the addon's `index` feature is off are not sent to it.

## Enabling and disabling addons

The addons are Git submodules. `git clone --recurse-submodules`, or later `git submodule update --init --recursive`, checks them out.

- **Separate-service addons** (`intelligence`, `knowledge`): answer yes when `configure.py` asks, and it writes the service into `docker-compose.override.yml`. Then run `docker compose up -d --build`. To remove one, answer no (or delete its service block) and rebuild.
- **Addons inside the backend** (`cloud-sync`, `media_import`): they are built in whenever their directory is checked out, so rebuild after checking one out. To remove one, leave its submodule uninitialised and rebuild. Turning it off in the per-drive policy does not unload it.
- **Per drive**: use **Addon policy** in the [settings GUI](../admin-guide/settings-gui.md#addon-policy).

When you run the backend outside Docker for development, run `./setup-addons.sh` once from the repository root to link the addons into the core tree.

## See also

- [intelligence](intelligence.md), [knowledge](knowledge.md), [cloud-sync](cloud-sync.md), [media_import](media-import.md)
- [Addon development](../ADDON-DEVELOPMENT.md) for manifests, slots, event hooks and the internal API.
