# Litloft

A media library for files you want to return to.

Litloft runs on your home LAN and gives your videos, documents, images,
web videos, and Markdown notes one place to live. It is a media server at
the base, but the point is not only playback. The point is remembering what
is inside your files, finding the right moment again, and turning scattered
media into material you can work with.

**[Landing page](https://mamepenguin.github.io/Litloft/)** ·
**[Documentation](docs/README.md)** ·
**[日本語 README](docs/README_ja.md)**

> **LAN only.** Litloft is designed for trusted home networks. Do not expose
> it to the public internet without an HTTPS reverse proxy and VPN.

> **Personal project.** Built for my own use. Issues and PRs are welcome, but
> support is best-effort.

<p align="center">
  <img src="docs/images/user-guide/drive-home-overview.png" width="92%" alt="Litloft drive home overview" />
</p>

<p align="center">
  <img src="docs/images/screenshot_summary.png" width="45%" alt="Litloft summary with citations" />
  <img src="docs/images/user-guide/markdown-viewer-frontmatter-mermaid.png" width="45%" alt="Litloft Markdown viewer with frontmatter and Mermaid" />
</p>

---

## Why Litloft Exists

Most media servers are good at playing files. Most note apps are good at
writing notes. Most search tools assume the interesting material is already
text.

Litloft sits in the overlap: lectures, streams, talks, screenshots, PDFs,
self-scanned books, personal notes, downloaded documents, and links you
keep meaning to revisit. It treats them as one local library.

You can watch a video, search its subtitles, ask what it said, save the
answer into a note, connect that note to another file, and come back later
from any of those entry points.

## Media Server

Litloft starts as a browser-based media server for your LAN.

Point it at folders on a disk or NAS, open it from a phone, tablet, or
desktop browser, and stream the files in place. Videos resume where you left
off. Images, PDFs, archives, and Markdown files open in the same library.
Drives can be separated by access rules, so public family media,
private archives, and research material do not need to share one
flat space.

The media server is the foundation: fast browsing, thumbnails, streaming,
history, comments, tags, collections, and ordinary file operations. Nothing
else in Litloft matters unless the library itself feels useful every day.

## Intelligence

Intelligence is how Litloft remembers what is inside the library.

It indexes text, subtitles, transcripts, summaries, file metadata, and video
frames. A long recording becomes searchable by the words spoken inside it.
A video with captions can be found by the topic discussed halfway through.
A document can surface from a phrase you half remember. With an LLM
configured, Litloft can summarize files, suggest tags, refine transcripts,
and answer questions with citations back to the source material.

The useful part is not that a model is present. The useful part is that the
library gains handles: timestamps, excerpts, summaries, keywords, related
files, and cited answers. Ask is most valuable when the answer is not the
end of the search, but a path back to the exact file and passage it came
from.

## Media Import

Media Import brings outside videos into the same working library.

Paste a URL, or subscribe to a YouTube channel or playlist, and Litloft can
collect new entries automatically. Titles, descriptions, thumbnails, channel
information, and available captions are pulled into the library, so external
media can be searched, summarized, and used by Ask alongside local files.

That changes what "saving a video" means. It is no longer just a bookmark
you may or may not open again. It becomes part of the same searchable archive
as your own recordings and notes.

## Knowledge

Knowledge turns the library into a place for writing around your files.

Markdown notes live in ordinary folders, with frontmatter that Litloft can
understand. Notes can be edited in the browser or with external tools. They
can point to source files, clips, summaries, Ask answers, and other notes.
Links between Markdown files are projected back into Litloft, so a folder of
plain text becomes a connected layer over the media archive.

This is not a separate notebook bolted onto the side. It is the place where
the library starts to explain itself: why a video mattered, which file
supports a claim, what a PDF connects to, what should be read next.

## What You Can Use It For

- A private LAN media server for videos, books, scans, and personal files.
- A searchable archive of lectures, streams, talks, podcasts, and clips.
- A research library where video, text, screenshots, and notes stay linked.
- A way to collect YouTube channels and playlists without losing their
  captions and context.
- A local knowledge workspace where summaries, citations, and Markdown notes
  live beside the original files.

## Quick Start

**Requirements:** Git, Docker, Python 3.

```bash
git clone --recurse-submodules https://github.com/mamepenguin/Litloft
cd Litloft
python3 configure.py
docker compose up -d --build
```

Open `http://localhost:3000`.

From another device on the same LAN, open `http://<host-ip>:3000`.

`configure.py` writes the local Docker wiring, drive mounts, port settings,
and optional addon services. On first launch, the setup wizard names your
drives and configures access control and addon policy.

For updates:

```bash
git pull --recurse-submodules
docker compose up -d --build
```

## Feature Sweep

**Media:** video streaming, audio playback, Range requests, resume playback,
subtitle display, thumbnail previews, image viewer, spread view, Markdown
viewer, Mermaid rendering, syntax highlighting, PDF viewer, ZIP/archive browsing.

**Library:** multi-drive setup, folder browser, grid/list views, pinned
folders, favorites, collections, comments, tags, watch history, recently
played, recently added, duplicate detection, smart folders, trash, missing
file recovery, upload, folder upload, rename, move, copy, batch operations,
in-browser text editing.

**Intelligence:** transcript indexing, subtitle indexing, semantic search,
scene/frame search, hybrid BM25/vector retrieval, Ask with citations,
summaries, detailed Markdown summaries, suggested tags, retrieval keywords,
transcript refinement, vision descriptions, local Whisper, cloud STT
providers, deepgram APIs, ElevenLabs APIs, OpenAI-compatible LLM endpoints,
Ollama/local LLM support, per-drive privacy policy.

**Media Import:** URL import, YouTube channel subscriptions, YouTube playlist
subscriptions, automatic sync, metadata refresh, caption import, thumbnail
caching, provider embeds, import activity, retry tools, per-drive enablement.

**Knowledge:** Markdown vaults, frontmatter sync, wiki links, Markdown
editing, web clipping, source-file relations, related notes, active summary
panel, vault search, note distillation, external editor compatibility.

**Admin:** first-run setup, settings GUI, password-protected drives, access
groups, master viewer admin access, addon policy, restart-pending banner,
dashboard, Docker Compose deployment, PWA, dark/light theme.

## Stack

FastAPI, SQLite, SQLAlchemy, Next.js, TypeScript, Tailwind CSS, Docker
Compose, ffmpeg, faster-Whisper, SigLIP/CLIP, multilingual embeddings,
SQLite FTS5, sqlite-vec.

```
Browser -> :3000 Next.js -> /api/* -> :8000 FastAPI
```

## License

[AGPL-3.0](LICENSE)
