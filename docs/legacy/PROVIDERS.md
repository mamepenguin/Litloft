# Transcription Providers

Litloft supports multiple Speech-to-Text (STT) providers. Configure in `addons/intelligence/search-config.yml`'s `transcription` section.

## Provider matrix

| Provider | Local/Cloud | Diarization | Hotwords | Word timestamps | Notes |
|---|---|---|---|---|---|
| `whisper_local` | Local (CPU) | ✗ | ✗ | ✓ | faster-whisper, default. Slow on CPU but private |
| `openai_compatible` | Cloud | ✗ | ✗ | ✓ | OpenAI Whisper API + base_url override (Groq, Fireworks, etc) |
| `deepgram` | Cloud | ✓ | ✗ | ✓ | Nova-3 model, best WER + diarization |
| `elevenlabs_scribe` | Cloud | ✓ | ✗ | ✓ | Scribe v1 |

## Setup

### whisper_local (default)
No setup required. Edit `transcription.whisper_local.model` to change Whisper model.

### openai_compatible
Set env: `OPENAI_API_KEY=sk-...`. For Groq: set `transcription.openai_compatible.base_url=https://api.groq.com/openai/v1` and `model=whisper-large-v3-turbo`. For Fireworks: similar pattern.

> **Warning:** Official OpenAI Whisper API has a 25MB file size limit. Use Deepgram / ElevenLabs / Groq / self-hosted for long-form audio.

> **Warning:** OpenAI Whisper API determines format strictly from the filename extension. If the extension does not match the actual container (e.g. an M4A audio file saved with a `.mp4` extension, common with iTunes / GarageBand exports), the API responds with `400 Invalid file format` even though both extensions appear in their supported list. **Workaround:** rename the file so the extension matches the actual container (use `file path/to/file.mp4` to detect), or route the drive to Deepgram / ElevenLabs / `whisper_local`, all of which sniff the format from content rather than extension. A future release may add ffprobe-based extension normalization.

### deepgram
Set env: `DEEPGRAM_API_KEY=...`. Configure `transcription.deepgram.model` (default `nova-3`).

### elevenlabs_scribe
Set env: `ELEVENLABS_API_KEY=...`. Configure `transcription.elevenlabs_scribe.model_id` (default `scribe_v1`).

## Verified providers

These are tested in CI smoke tests (when API keys are present):
- `whisper_local` — full unit + integration coverage
- `openai_compatible` (api.openai.com) — wire + parity
- `deepgram` (api.deepgram.com) — wire + parity
- `elevenlabs_scribe` (api.elevenlabs.io) — wire + parity

For other endpoints (Groq, Fireworks, self-hosted), verify with a short test audio file before relying on them. Particularly verify that word timestamps are returned (some endpoints don't support `timestamp_granularities=["word"]`).

## Per-drive policy

To force a specific drive to use only `whisper_local` (block cloud transmission):

```json
{
  "drives": [{
    "name": "secret",
    "addons": {
      "intelligence": {
        "transcription_cloud": false
      }
    }
  }]
}
```

This applies even if the global `transcription.provider` is set to a cloud provider. Useful for sensitive drives.

## Failure handling

If a cloud provider fails (network / 401 / rate limit / etc), the job is marked as failed in the `JobRecord` table. **No silent fallback to local** — explicit failure preserves user expectations about cost / privacy / quality.

To observe failures: query `/api/addons/intelligence/index-details` for `provider_stats`, or query the `job_records` table directly.

## Migration from existing setup

Existing `indexing.whisper.*` config keys are still read via a backward-compatibility shim. Deprecation date: **2026-07-07**. Move keys to `transcription.whisper_local.*` before then to avoid future breakage.
