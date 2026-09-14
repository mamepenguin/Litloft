# P4-2: configure.py presents Intelligence as recommended and bundled addons as facts — R-0 invariants

"Existing wiring" means `docker-compose.override.yml` exists. An in-process
(bundled) addon is a non-empty `addons/<name>/` holding a `backend/` directory.

1. Without existing wiring and with `addons/intelligence` present, pressing Enter at
   the Intelligence prompt enables it (the intelligence service, env and
   `search-config.yml` are written). With existing wiring the default follows it:
   on if the override has an intelligence service, off if it does not.
2. The Knowledge prompt's default is unchanged: on only if the existing override
   has a knowledge service.
3. The bundled addons are listed by directory name, exactly the in-process addons
   present, and nothing is asked about them; adding or removing one changes no
   prompt and no generated file.
4. For the same answers typed explicitly, every generated file
   (`docker-compose.override.yml`, `.env`, `event-hooks.json`, `drives.json`,
   `passwords.json`, `search-config.yml`) is byte-identical to the parent commit.
5. When Intelligence and Knowledge are both declined, the summary says the bundled
   addons can be turned off per drive at `/setup`; when either is enabled it does not.
6. An addon whose directory is absent has no prompt and no list entry.
7. The prompts' order and defaults are declared in one table in
   `tests/test_configure.py`; changing the order or a default fails a test.

## Revised by the author, approved by the supervisor before review

5. When Intelligence and Knowledge are both declined **and at least one bundled addon is present**, the summary says the bundled addons can be turned off per drive at `/setup`; otherwise it does not.

## Revised by the supervisor after r1

3. The bundled addons are listed by directory name, exactly the in-process addons present, and nothing is asked about them; adding or removing one changes no prompt and, apart from the cloud-sync `sync-config.json` mount, no generated file.
7. The prompts' order and defaults are declared in one table in `tests/test_configure_presentation.py`; changing the order or a default fails a test.
