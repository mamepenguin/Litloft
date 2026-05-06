# Litloft

**Your files. Your server. Beautifully.**

An open-source file manager and media streaming app for your home LAN. No cloud. One `docker compose up` and you're running.

---

## Why Litloft?

Your files should stay at home.

- **Privacy by design** — Your data never leaves your server. No cloud upload, no telemetry
- **One command setup** — `docker compose up`. No complicated configuration
- **Browser-first** — No client app to install. Works from phones, tablets, and desktops
- **PWA ready** — Add to home screen for a native app feel

---

## What you can do

### Watch, listen, and browse

**Video streaming**
In-browser player with seek support. Subtitles (SRT/VTT), cast to TV, and resume playback. Picks up exactly where you left off.

**Music playback**
Play albums and playlists. Loop and shuffle support.

**Image gallery**
Slideshow view with keyboard navigation. Spread view with LTR/RTL direction toggle for manga/comics.

**HEIC support**
iPhone photos display without any manual conversion.

---

### Manage files from the browser

**Upload**
Drag and drop or use the file picker. Upload entire folder trees while preserving structure. Up to 2GB per file.

**Organize**
Rename, move, copy, and delete from the browser. Select multiple files for batch operations. Edit text files directly in the browser.

**Trash**
Deleted files go to trash first, auto-purged after 30 days. Restore instantly if you change your mind.

**Missing files**
If a NAS goes offline, viewer history, tags, and AI data are kept intact. Everything reconnects when the drive comes back.

---

### Read documents

PDF, Word, Excel, PowerPoint, plain text, and Markdown previewed in-browser.

**Markdown rendering**
Syntax highlighting, GitHub-flavored task lists, and Mermaid diagrams (flowcharts, sequence diagrams, etc.).

**ZIP files**
Browse contents and extract individual files. Shift_JIS filenames handled correctly.

---

### Find and organize

**Tags**
Tag files for categorization. Filter by tag from the sidebar. Markdown files sync tags with frontmatter `tags:` automatically.

**Favorites and pinned folders**
Star frequently accessed files. Pin folders to the sidebar for one-click navigation.

**Playlists**
Create playlists manually or play an entire folder as a playlist.

**Search**
Full-text filename search. Save search queries as Smart Folders for quick re-runs.

**Watch history**
Recently played, continue watching (unfinished videos), and auto-recorded page views. Share history across devices with a nickname profile.

---

### Access control

**Multi-drive**
Separate content areas by purpose — "Family Videos", "Music", "Private". Each drive is a fully independent security boundary.

**Password protection** (optional)
Per-drive password access. One drive can be public, another password-protected. Leave `passwords.json` out entirely for fully open home use.

**Admin panel**
Manage drives, passwords, and addon policy from the browser GUI. Dashboard shows per-drive stats, disk usage, and system health.

---

### Detect duplicates

Hash-based duplicate detection groups identical files and shows how much space you'd reclaim by removing them.

---

## Extend with addons

Litloft's addon system lets you bolt on features you actually want, without bloating the core install.

### intelligence — AI-powered search and organization

A separate Docker container. Works with any OpenAI-compatible API — including fully local setups with [ollama](https://ollama.ai).

| Feature | Description |
|---------|-------------|
| **Auto transcription** | Whisper speech-to-text for video and audio. Transcripts displayed as interactive subtitles |
| **Semantic search** | Search by meaning. "Upbeat music" or "cooking tutorial" — finds what you mean, not just what you typed |
| **Ask (Q&A)** | Ask questions about your files in plain language. Answers come with citations linking back to the source |
| **AI summaries** | One-sentence or long-form Markdown summaries. Editable and revertable |
| **Tag suggestions** | Content-aware tag proposals. Never applied automatically — you approve each one |
| **CLIP frame search** | Find specific scenes in videos ("cat running", "sunset") by keyword |

### knowledge — Markdown notes

Per-drive Markdown vaults and web clipping. Attach notes directly to files.

### downloader — Download from URLs

yt-dlp integration for downloading media from YouTube and other services. Register URLs as references (LoftRef) to get subtitles and metadata without downloading, and include them in intelligence search.

### podcast — Turn folders into feeds

Convert folders into Podcast RSS feeds. Subscribe with any podcast app.

### cloud-sync — Cloud backup

rclone-backed scheduled backups of drive contents to cloud storage.

---

## Use cases

### Family video library

Drop family videos into a "Family" drive. Stream from any phone on the LAN. Keep a separate "Private" drive behind a password that kids can't see.

### Personal media collection

Organize movies, shows, and music by genre across drives. Enable the intelligence addon to get automatic subtitles and semantic search — find "that sci-fi movie from five years ago" in seconds.

### Scanned books and PDFs

Organize scanned books and documents. Tag by subject, open in the browser reader, and annotate with knowledge notes.

### Home file server

Use as a NAS replacement. Upload and download from multiple devices, organize with folders and tags, and edit text files directly in the browser.

### Podcast studio

Record audio, drop it in a folder, and the podcast addon generates an RSS feed. Share audio content with family or a small group.

---

## UI highlights

- **Dark / Light / System theme** — Follows OS preference automatically
- **Japanese / English** — Switch from the menu at any time
- **Keyboard shortcuts** — Player controls and navigation (`?` to show all)
- **Context menu** — Right-click on desktop, long-press on mobile
- **Responsive** — Designed for phones, tablets, and desktops

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python 3.12) + SQLite + ffmpeg |
| Frontend | Next.js 16 (App Router, TypeScript, Tailwind CSS v4) |
| Infrastructure | Docker Compose |

---

## Quick start

### Option A — Interactive setup (recommended)

```bash
python configure.py
docker compose up -d --build
```

The interactive script asks about your drives, passwords, and addon settings, then generates `docker-compose.override.yml` and all required config files. The browser wizard is skipped automatically.

### Option B — Manual setup

**1. Copy the override template**

```bash
cp docker-compose.override.yml.example docker-compose.override.yml
```

Edit `docker-compose.override.yml` to mount your drives:

```yaml
services:
  backend:
    volumes:
      - /path/to/your/videos:/app/drives/videos
      - /path/to/your/music:/app/drives/music
      - ./data:/app/data
```

**2. Start**

```bash
docker compose up -d --build
```

Open `http://localhost:3000`. Other devices on your LAN use `http://<host-ip>:3000`.

**3. First-run wizard**

On first launch the browser takes you to `/setup`. A six-step wizard guides you through drive configuration and access control. Done in under five minutes.

---

## License

MIT — Free for personal and home use.

---

## Screenshots

<!-- TODO: Add screenshots -->

| Drive home | Folder browser | Video player |
|:---:|:---:|:---:|
| ![Drive home](screenshots/drive-home.png) | ![Folder browser](screenshots/folder-browser.png) | ![Video player](screenshots/video-player.png) |

| Admin dashboard | AI search | Setup wizard |
|:---:|:---:|:---:|
| ![Admin dashboard](screenshots/admin.png) | ![AI search](screenshots/search.png) | ![Setup](screenshots/setup.png) |
