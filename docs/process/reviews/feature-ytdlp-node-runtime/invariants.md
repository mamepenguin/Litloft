spec: docs/specs/ytdlp-node-runtime.md

## Revisions

I2. (acceptance) Every yt-dlp process the intelligence addon starts, from any of the lookup's three callers and from the download, has `--no-js-runtimes` followed later by `--js-runtimes=node`, no other argument starting with `--js-runtimes`, and no `--remote-components`. The URL is its last argument and its only positional argument; an option's value may be the argument after the option.
