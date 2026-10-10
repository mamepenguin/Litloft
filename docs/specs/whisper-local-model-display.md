# The admin GUI shows the Whisper model that transcription loads

SPEC-ID: SPEC-ADDON-016

Approval: sha256:741a2972be1d7b7e4713e71ac74430b0d93c17672feeb99f544e00f19849c188 Yuichi Senga 2026-10-10

## Summary

The intelligence addon's admin transcription section (`/admin/settings`, provider list)
shows a read-only `model=…` line under each provider. For `whisper_local` it shows
`transcription.whisper_local.model` (`routers/admin.py` `_frozen_subconfig_summary`), but
the local Whisper worker never reads that field: it loads `models.whisper`
(`workers/whisper.py` `_ensure_loaded`). `search-config.yml.example` and
`docs/addons/intelligence.md` no longer list `whisper_local.model` (removed with
SPEC-ADDON-011), so an operator who sets `models.whisper` to another model still sees the
dataclass default `openai/whisper-large-v3-turbo` in the GUI and may think the setting did
not take effect. After this change the GUI line for `whisper_local` reads
`models.whisper=<value>`: the model that is actually loaded, labelled with the key that sets
it, so the operator edits that key and not the ignored one. For the operator.

## Required items

### 1. Normal flow

SPEC-ADDON-016:

1. The operator opens the transcription section of the admin settings; the frontend fetches
   the transcription payload as today.
2. `_frozen_subconfig_summary()` returns
   `{"whisper_local": {"models.whisper": <settings.models.whisper>}, …}`; the entry has no
   `model` key. Every other provider's entry is unchanged.
3. The GUI renders the entry with `describeSubconfig` as today (`key=value`), so the line
   reads `models.whisper=<that value>`.

### 2. Failure cases

- `models.whisper` absent from the config: the `ModelConfig` default
  (`openai/whisper-large-v3-turbo`) is shown, which is also what the worker loads.
- A config that still sets `transcription.whisper_local.model` (or legacy
  `indexing.whisper.model`): it is parsed as today and stays unused; the GUI no longer
  shows it. Nothing warns about it (see Checked, no action).

### 3. States

None. The summary is computed per request from the loaded settings.

### 4. Data read and written

Read: `config.settings.models.whisper`, the object the running process loaded at start and
the worker reads, not a fresh read of `search-config.yml` (a value edited since start is
not loaded until restart). Nothing written.

### 5. External services

None.

### 6. Authorization

Unchanged: the endpoint's existing admin gate.

### 7. Effect on existing features

- The transcription worker, refine and the aligner do not read
  `_frozen_subconfig_summary`; they are unaffected.
- The frontend type of the summary changes from `whisper_local?: { model?: string }` to
  `whisper_local?: { "models.whisper"?: string }`; `describeSubconfig` is unchanged. The
  admin GUI is the only consumer of this payload.

### 8. Error behavior

None new.

### 9. User-visible behavior

In the admin transcription section, the `whisper_local` line reads
`models.whisper=<value of models.whisper>` instead of `model=<value of
transcription.whisper_local.model>`. With the shipped defaults the value is the same as
today (`openai/whisper-large-v3-turbo`); it differs when `models.whisper` is set to another
model. Other providers' lines are unchanged.

### 10. Non-functional

None: one attribute read.

## Touch points

- `addons/intelligence/app/routers/admin.py`: `_frozen_subconfig_summary`, the `whisper_local`
  entry.
- `addons/intelligence/frontend/AdminTranscriptionSettingsSection.tsx`: the summary type
  for `whisper_local`; `AdminTranscriptionSettingsSection.test.tsx`: its fixture.
- Read, not changed: `addons/intelligence/app/config.py` (`ModelConfig.whisper`,
  `WhisperLocalConfig.model`), `addons/intelligence/app/workers/whisper.py`
  (`_ensure_loaded`).
- Tests: new tests citing SPEC-ADDON-016 in `addons/intelligence/tests/` (through
  `GET /admin/transcription`) and in the frontend test of the section.
- The addon change is committed in the addon repository; the core bumps the
  `addons/intelligence` pointer.
- Review topic: `docs/process/reviews/feature-whisper-local-model-display/`.
- Docs: none; `docs/addons/intelligence.md` already names `models.whisper` as the Whisper
  model setting.
- No protected path.

## Invariants

I1. With `models.whisper` set to `openai/whisper-small` and `transcription.whisper_local.model`
set to `openai/whisper-large-v3`, the transcription admin payload's
`search_config_summary.whisper_local` is exactly `{"models.whisper": "openai/whisper-small"}`.
I2. With neither key set, it is exactly `{"models.whisper": "openai/whisper-large-v3-turbo"}`;
with only legacy `indexing.whisper.model` set to another model, the value is still the
`models.whisper` value.
I3. The value shown equals the model name `_ensure_loaded` passes to `_resolve_model_size`
for the same settings.
I4. The `openai_compatible`, `deepgram`, `elevenlabs_scribe`, `assemblyai` and `gemini`
entries of the summary are unchanged.
I5. Setting `transcription.whisper_local.model` still parses without error and changes
nothing that transcription loads.
I6. The admin transcription section renders `models.whisper=<value>` under `whisper_local`,
and no `model=` text on that line.

## Checked, no action

- **Making `transcription.whisper_local.model` take effect instead.** `models.whisper` is the
  documented key and the one the worker, the docs and the example config use; honouring a
  second key would need a precedence rule for no user who asked for one.
- **Removing `WhisperLocalConfig.model` or rejecting the key.** An existing config with the
  key (or legacy `indexing.whisper.model`) would then fail to load; parsing it and ignoring
  it is harmless now that the GUI does not show it.
- **Warning in the log when the unused key is set.** The operator does not read the log to
  learn which model is loaded; the GUI now tells them.
- **Showing the resolved faster-whisper size (e.g. `large-v3-turbo`).** The GUI shows
  configured names for every provider; the configured name is what the operator edits.
