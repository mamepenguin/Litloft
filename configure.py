#!/usr/bin/env python3
"""Litloft interactive setup — bootstrap-only.

Generates the *physical wiring* needed to bring the containers up:
docker-compose.override.yml (host mounts / addon services / env),
.env (port / generated secrets / optional API key), an empty
``drives.json`` (footgun guard — see below), event-hooks.json, and (when
intelligence is enabled) a verbatim copy of search-config.yml.example.

It deliberately does NOT ask for drive display names, access groups,
passwords, per-drive addon policy, or AI feature modes. Those are logical
settings owned by the first-run wizard at ``/setup`` and the running-app
editor at ``/admin/settings``.

drives.json and passwords.json are always written as an empty ``[]``. The
single-file bind-mounts ``./drives.json:/app/drives.json`` and
``./passwords.json:/app/passwords.json`` mean an absent host file makes
Docker create a *directory* there, which the backend cannot read or
write. Writing ``[]`` keeps each a real, writable file; the backend seeds
logical drive entries from the mount directories on startup, and the
wizard / admin settings own passwords from then on. An empty
``passwords.json`` is semantically identical to "no passwords" (every
drive public, graceful degradation). The override.yml mounts
passwords.json **read-write** (``:ro`` is incompatible with GUI writes).

``data/setup_completed`` is intentionally NOT created — the web wizard
must run on first launch (it now owns logical configuration).
"""

import json, os, re, shutil, subprocess, sys
from pathlib import Path

# ── Colors ────────────────────────────────────────────────────────────────────

_tty = sys.stdout.isatty()
GREEN  = '\033[0;32m' if _tty else ''
YELLOW = '\033[1;33m' if _tty else ''
BLUE   = '\033[0;34m' if _tty else ''
BOLD   = '\033[1m'    if _tty else ''
RESET  = '\033[0m'    if _tty else ''

def heading(text): print(f"\n{BOLD}{BLUE}━━  {text}{RESET}\n")
def ok(msg):       print(f"  {GREEN}✓{RESET}  {msg}")
def warn(msg):     print(f"  {YELLOW}!{RESET}  {msg}")
def info(msg):     print(f"  {BLUE}→{RESET}  {msg}")

# ── Prompt helpers ────────────────────────────────────────────────────────────

def ask(prompt, default=''):
    disp = f"  {prompt} [{BOLD}{default}{RESET}]: " if default != '' else f"  {prompt}: "
    try:
        val = input(disp).strip()
    except EOFError:
        val = ''
    return val if val else default

def ask_yn(prompt, default='n'):
    hint = "Y/n" if default.lower() == 'y' else "y/N"
    disp = f"  {prompt} [{BOLD}{hint}{RESET}]: "
    try:
        val = input(disp).strip().lower()
    except EOFError:
        val = ''
    return (val or default.lower()).startswith('y')

def slugify(s):
    import unicodedata
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii')
    s = re.sub(r'[^a-z0-9_-]', '_', s.lower())
    s = re.sub(r'_+', '_', s).strip('_')
    return s

def gen_secret():
    return os.urandom(32).hex()

def check_overwrite(path):
    if path.exists():
        return ask_yn(f"{YELLOW}{path.name}{RESET} already exists. Overwrite?", 'n')
    return True

def generate_event_hooks(base: Path, enabled_addons: list) -> bool:
    """Build event-hooks.json from the event_hooks field in each enabled addon's manifest.

    Returns True if the file was written (at least one hook was found).
    URL uniqueness is the dedup key — the same URL cannot appear twice across addons.
    """
    hooks: dict = {}
    seen_urls: set = set()

    for addon_name in enabled_addons:
        manifest_path = base / 'addons' / addon_name / 'manifest.json'
        if not manifest_path.exists():
            continue
        try:
            manifest = json.loads(manifest_path.read_text())
        except Exception:
            continue
        for entry in manifest.get('event_hooks', []):
            event = entry.get('event')
            url   = entry.get('url')
            if not event or not url or url in seen_urls:
                continue
            seen_urls.add(url)
            hook = {k: v for k, v in entry.items() if k != 'event'}
            hooks.setdefault(event, []).append(hook)

    if not hooks:
        return False

    hook_file = base / 'event-hooks.json'
    hook_file.write_text(json.dumps({'hooks': hooks}, ensure_ascii=False, indent=2) + '\n')
    return True


def ensure_submodules_initialized(base: Path) -> None:
    """Auto-init git submodules whose checkout directory is empty.

    A `git clone` without `--recurse-submodules` leaves `addons/<name>/` as
    empty directories. If configure.py then writes a single-file bind-mount
    (e.g. `./addons/intelligence/search-config.yml:/app/search-config.yml`)
    whose source does not exist on the host, Docker silently creates the
    bind-mount source as a *directory* — the single-file bind-mount footgun
    documented in design-decisions.md. Initializing here keeps the happy
    path working when the clone was incomplete.
    """
    addon_dirs = ['addons/intelligence', 'addons/knowledge',
                  'addons/cloud-sync', 'addons/media_import']
    uninitialized = [
        rel for rel in addon_dirs
        if (base / rel).is_dir() and not any((base / rel).iterdir())
    ]
    if not uninitialized:
        return

    warn("Uninitialized addon submodule(s) detected:")
    for rel in uninitialized:
        print(f"      - {rel}")

    if not (base / '.gitmodules').exists() or not shutil.which('git'):
        print()
        warn("Cannot auto-initialize (no .gitmodules or git not installed).")
        info("Re-clone with: git clone --recurse-submodules <url>")
        info("Or in this repo: git submodule update --init --recursive")
        sys.exit(1)

    info("Running: git submodule update --init --recursive")
    result = subprocess.run(
        ['git', 'submodule', 'update', '--init', '--recursive'],
        cwd=str(base))
    if result.returncode != 0:
        print()
        warn("git submodule update failed.")
        info("Re-run manually: git submodule update --init --recursive")
        sys.exit(1)

    still_empty = [
        rel for rel in uninitialized
        if not any((base / rel).iterdir())
    ]
    if still_empty:
        warn("Submodule(s) still empty after init: " + ', '.join(still_empty))
        sys.exit(1)
    ok("Submodules initialized")


def write_env_key(key, value, env_path):
    if env_path.exists():
        content = env_path.read_text()
        if re.search(rf'^{re.escape(key)}=', content, re.MULTILINE):
            env_path.write_text(
                re.sub(rf'^{re.escape(key)}=.*', f'{key}={value}', content, flags=re.MULTILINE))
            return
    with env_path.open('a') as f:
        f.write(f'{key}={value}\n')

# ── Read existing physical config (mounts / port only) ────────────────────────

class ExistingConfig:
    """Minimal reuse of the previous *physical* wiring.

    Only host_path + slug per drive and the port are reused. Logical
    settings (names / groups / passwords / AI) are no longer owned here, so
    they are not read back.
    """

    def __init__(self, base: Path):
        self.drives: list[dict] = []   # slug, host_path
        self.port = '3000'
        self.has_intelligence = False
        self.has_knowledge = False
        self.knowledge_webhook_secret = ''
        self.core_internal_secret = ''
        self._load(base)

    def _load(self, base: Path):
        drives_f = base / 'drives.json'
        dc_f     = base / 'docker-compose.override.yml'
        env_f    = base / '.env'

        slugs: list[str] = []
        if drives_f.exists():
            try:
                for d in json.loads(drives_f.read_text()):
                    path = d.get('path', '')
                    if path.startswith('/app/drives/'):
                        slugs.append(path[len('/app/drives/'):])
            except Exception:
                pass

        host_by_slug: dict[str, str] = {}
        if dc_f.exists():
            try:
                for m in re.finditer(r'-\s+([^:\s][^:]+):/app/drives/([^\s:]+)',
                                     dc_f.read_text()):
                    host_by_slug[m.group(2).strip()] = m.group(1).strip()
            except Exception:
                pass

        # Recover slugs from override.yml even if drives.json was reset to [].
        for slug in host_by_slug:
            if slug not in slugs:
                slugs.append(slug)

        for slug in slugs:
            self.drives.append({
                'slug': slug,
                'host_path': host_by_slug.get(slug, ''),
            })

        if dc_f.exists():
            try:
                dc_text = dc_f.read_text()
                # Detect service blocks by top-level service key pattern.
                self.has_intelligence = bool(re.search(r'^\s{2}intelligence\s*:', dc_text, re.MULTILINE))
                self.has_knowledge    = bool(re.search(r'^\s{2}knowledge\s*:',    dc_text, re.MULTILINE))
            except Exception:
                pass

        self.has_llm_api_key = False
        if env_f.exists():
            for line in env_f.read_text().splitlines():
                if line.startswith('LITLOFT_PORT='):
                    self.port = line.split('=', 1)[1].strip()
                elif line.startswith('KNOWLEDGE_WEBHOOK_SECRET='):
                    self.knowledge_webhook_secret = line.split('=', 1)[1].strip()
                elif line.startswith('CORE_INTERNAL_SECRET='):
                    self.core_internal_secret = line.split('=', 1)[1].strip()
                elif line.startswith('LLM_API_KEY=') and line.split('=', 1)[1].strip():
                    self.has_llm_api_key = True

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    base = Path(__file__).parent
    ensure_submodules_initialized(base)
    ex = ExistingConfig(base)

    if ex.drives:
        info(f"Existing wiring loaded ({len(ex.drives)} drive mount(s))")

    print(f"\n{BOLD}Litloft Setup{RESET}")
    print("Generates the container wiring (mounts, port, addons).")
    print("Drive names, passwords and AI features are configured later in")
    print("the browser at /setup.")
    print("Press Enter to accept defaults shown in [brackets].")

    # ── Step 1: Drive mounts ──────────────────────────────────────────────────

    heading("Step 1: Drive mounts")
    print("  Each drive is a host directory mounted into the container.")
    print("  The slug is a URL/path identifier (not a display name).")

    default_count = max(len(ex.drives), 1)
    raw = ask("How many drives?", str(default_count))
    num_drives = int(raw) if raw.isdigit() and int(raw) >= 1 else 1

    drives: list[dict] = []
    used_slugs: set[str] = set()

    for i in range(1, num_drives + 1):
        idx = i - 1
        ex_d = ex.drives[idx] if idx < len(ex.drives) else {}
        print(f"\n  {BOLD}Drive {i}{RESET}")

        host = ask("  Host path (absolute)",
                   ex_d.get('host_path') or str(base / 'videos'))

        default_slug = ex_d.get('slug') or slugify(os.path.basename(host.rstrip('/'))) or f'drive_{i}'
        slug = slugify(ask("  Slug (path identifier)", default_slug)) or f'drive_{i}'
        if slug in used_slugs:
            slug = f'{slug}_{i}'
        used_slugs.add(slug)

        drives.append({'host_path': host, 'slug': slug})

    # ── Step 2: Port ──────────────────────────────────────────────────────────

    heading("Step 2: Port")
    port = ask("Port", ex.port)
    if not port.isdigit():
        port = '3000'

    # ── Step 3: Intelligence Addon ────────────────────────────────────────────

    has_intelligence = False
    llm_api_key      = ''
    if (base / 'addons/intelligence').exists():
        heading("Step 3: Intelligence Addon (Semantic Search + AI)")
        print("  Enables the intelligence service. AI features themselves are")
        print("  configured later in the browser (all off by default).")
        has_intelligence = ask_yn("Enable intelligence addon?", 'y' if ex.has_intelligence else 'n')
        if has_intelligence:
            print()
            if ex.has_llm_api_key:
                print("  LLM_API_KEY is already set in .env.")
                if not ask_yn("  Update it?", 'n'):
                    llm_api_key = ''   # keep existing — no overwrite
                else:
                    llm_api_key = ask("  LLM_API_KEY", '')
            else:
                print("  LLM API key enables cloud LLM providers (OpenAI-compatible).")
                print("  Leave blank if you plan to use a local model (e.g. Ollama),")
                print("  or to configure it later by editing .env.")
                llm_api_key = ask("  LLM_API_KEY (optional, Enter to skip)", '')

    # ── Step 4: Knowledge Addon ───────────────────────────────────────────────

    has_knowledge            = False
    knowledge_webhook_secret = ''
    core_internal_secret     = ''

    if (base / 'addons/knowledge').exists():
        heading("Step 4: Knowledge Addon (Markdown Vault)")
        if ask_yn("Enable knowledge addon?", 'y' if ex.has_knowledge else 'n'):
            has_knowledge = True
            if ex.knowledge_webhook_secret and ex.core_internal_secret:
                knowledge_webhook_secret = ex.knowledge_webhook_secret
                core_internal_secret     = ex.core_internal_secret
                ok("Reusing existing secrets")
            else:
                knowledge_webhook_secret = gen_secret()
                core_internal_secret     = gen_secret()
                ok("Generated secrets")

    # ── Summary ───────────────────────────────────────────────────────────────

    heading("Summary")
    print("  Files to generate:")
    print("    docker-compose.override.yml")
    print("    drives.json     (empty — drives are named at /setup)")
    print("    passwords.json  (empty — passwords are set at /setup)")
    if port != '3000':        print(f"    .env  (LITLOFT_PORT={port})")
    if has_intelligence:      print("    addons/intelligence/search-config.yml")
    if has_intelligence or has_knowledge: print("    event-hooks.json")
    if has_knowledge:         print("    .env  (secrets)")
    if llm_api_key:           print("    .env  (LLM_API_KEY)")
    elif has_intelligence and not ex.has_llm_api_key:
        print("    .env  (LLM_API_KEY: not set — AI features will be unavailable)")
    print()
    print("  Drive mounts:")
    for d in drives:
        print(f"    {d['host_path']}  →  /app/drives/{d['slug']}")

    print()
    if not ask_yn("Generate files?", 'y'):
        print("\nAborted.")
        return

    # ── Generate event-hooks.json ─────────────────────────────────────────────

    enabled_addons = (['intelligence'] if has_intelligence else []) + \
                     (['knowledge']    if has_knowledge    else [])
    if generate_event_hooks(base, enabled_addons):
        ok("event-hooks.json")

    # ── Generate docker-compose.override.yml ──────────────────────────────────

    dc_file = base / 'docker-compose.override.yml'
    if check_overwrite(dc_file):
        lines = [
            "# Litloft user configuration",
            "# Generated by configure.py — edit freely.",
            "# Do NOT edit docker-compose.yml directly.",
            "", "services:", "  backend:", "    volumes:",
        ]
        for d in drives:
            lines.append(f"      - {d['host_path']}:/app/drives/{d['slug']}")
        # passwords.json is mounted unconditionally and read-write. The
        # single-file bind-mount needs a real host file (footgun guard,
        # symmetric with drives.json). :ro is incompatible with GUI
        # writes from /setup + /admin/settings (EBUSY / rejected), so it
        # is RW regardless of whether a password is configured yet.
        lines.append("      - ./passwords.json:/app/passwords.json")
        if (base / 'event-hooks.json').exists():
            lines.append("      - ./event-hooks.json:/app/event-hooks.json:ro")
        _cs_cfg = base / 'addons/cloud-sync/sync-config.json'
        if _cs_cfg.exists():
            lines.append("      - ./addons/cloud-sync/sync-config.json:/app/addons/cloud-sync/sync-config.json:ro")

        backend_env = []
        if has_intelligence: backend_env.append("- INTELLIGENCE_SERVICE_URL=http://intelligence:8100")
        if has_knowledge:
            backend_env += [
                "- KNOWLEDGE_SERVICE_URL=http://knowledge:8200",
                "- KNOWLEDGE_WEBHOOK_SECRET=${KNOWLEDGE_WEBHOOK_SECRET:-}",
                "- CORE_INTERNAL_SECRET=${CORE_INTERNAL_SECRET:-}",
            ]
        if backend_env:
            lines.append("    environment:")
            lines.extend(f"      {e}" for e in backend_env)

        if port != '3000':
            lines += ["", "  frontend:", "    ports:", f'      - "{port}:3000"']

        if has_intelligence:
            mounts = ','.join(f"{d['slug']}=/drives/{d['slug']}" for d in drives)
            lines += [
                "", "  intelligence:", "    build: ./addons/intelligence",
                "    expose:", '      - "8100"', "    volumes:",
                "      - ./addons/intelligence/search-config.yml:/app/search-config.yml:ro",
                "      - ./data/addons/intelligence:/intelligence-data",
                "      - ./data/data.db:/data/litloft.db:ro",
                "      - ./data/thumbnails:/data/thumbnails:ro",
                *[f"      - {d['host_path']}:/drives/{d['slug']}:ro" for d in drives],
                "    environment:", f"      - DRIVE_MOUNTS={mounts}",
                "      - HOMEVAULT_INTERNAL_URL=http://backend:8000",
                "      - LLM_API_KEY=${LLM_API_KEY:-}",
                "      - DEEPGRAM_API_KEY=${DEEPGRAM_API_KEY:-}",
                "      - ELEVENLABS_API_KEY=${ELEVENLABS_API_KEY:-}",
                "      - OPENAI_API_KEY=${OPENAI_API_KEY:-}",
                "      - ASSEMBLYAI_API_KEY=${ASSEMBLYAI_API_KEY:-}",
                "      - GEMINI_API_KEY=${GEMINI_API_KEY:-}",
                "      - CORE_INTERNAL_SECRET=${CORE_INTERNAL_SECRET:-}",
                "    depends_on:", "      backend:", "        condition: service_healthy",
                "    restart: unless-stopped",
            ]

        if has_knowledge:
            lines += [
                "", "  knowledge:", "    build: ./addons/knowledge",
                "    expose:", '      - "8200"',
                "    volumes:", "      - ./data/addons/knowledge:/knowledge-data",
                "    environment:", "      - HOMEVAULT_INTERNAL_URL=http://backend:8000",
                "      - KNOWLEDGE_WEBHOOK_SECRET=${KNOWLEDGE_WEBHOOK_SECRET:-}",
                "      - CORE_INTERNAL_SECRET=${CORE_INTERNAL_SECRET:-}",
                "    depends_on:", "      backend:", "        condition: service_healthy",
                "    restart: unless-stopped",
            ]

        dc_file.write_text('\n'.join(lines) + '\n')
        ok("docker-compose.override.yml")

    # ── Generate drives.json (always empty []) ────────────────────────────────
    #
    # Footgun guard: the single-file bind-mount needs a real file on the
    # host, otherwise Docker mounts a directory the backend cannot use.
    # Logical drive entries are seeded by the backend on startup and then
    # owned by /setup + /admin/settings.

    drives_file = base / 'drives.json'
    if check_overwrite(drives_file):
        drives_file.write_text('[]\n')
        ok("drives.json  (empty — named at /setup)")

    # ── Generate passwords.json (always empty []) ─────────────────────────────
    #
    # Same footgun guard as drives.json: the single-file bind-mount needs a
    # real host file, otherwise Docker mounts a directory the backend
    # cannot read or write. An empty [] is semantically identical to "no
    # passwords" — auth.load_passwords() treats absent and [] the same way
    # (all drives public, graceful degradation). Passwords are configured
    # later at /setup + /admin/settings.

    passwords_file = base / 'passwords.json'
    if check_overwrite(passwords_file):
        passwords_file.write_text('[]\n')
        ok("passwords.json  (empty — set at /setup)")

    # ── Generate search-config.yml (verbatim copy of the example) ─────────────
    #
    # AI features are configured in the browser. We only guarantee the file
    # exists (an absent bind-mount target would become a directory).

    if has_intelligence:
        sc_file  = base / 'addons/intelligence/search-config.yml'
        ex_file  = base / 'addons/intelligence/search-config.yml.example'
        if check_overwrite(sc_file):
            if not ex_file.exists():
                # Belt-and-suspenders: the override.yml mount has already
                # been written for this run, so silently skipping would
                # let `docker compose up` create a directory at the mount
                # source (single-file bind-mount footgun). Abort instead.
                warn("addons/intelligence/search-config.yml.example not found.")
                info("The intelligence submodule appears incomplete.")
                info("Run: git submodule update --init --recursive")
                sys.exit(1)
            sc_file.write_text(ex_file.read_text())
            ok("addons/intelligence/search-config.yml")

    # ── Update .env ───────────────────────────────────────────────────────────

    env_file = base / '.env'
    wrote_env = False
    if port != '3000':       write_env_key('LITLOFT_PORT', port, env_file);                          wrote_env = True
    if has_knowledge:
        if knowledge_webhook_secret: write_env_key('KNOWLEDGE_WEBHOOK_SECRET', knowledge_webhook_secret, env_file); wrote_env = True
        if core_internal_secret:     write_env_key('CORE_INTERNAL_SECRET', core_internal_secret, env_file);        wrote_env = True
    if llm_api_key:
        write_env_key('LLM_API_KEY', llm_api_key, env_file)
        wrote_env = True
    if wrote_env:
        ok(".env")

    # ── Done ──────────────────────────────────────────────────────────────────

    print(f"\n{BOLD}{GREEN}All files generated.{RESET}")

    url = f"http://localhost:{port}"

    if not shutil.which('docker'):
        print("\n  docker command not found. Start manually:")
        print("    docker compose up -d --build")
        print(f"  Then open: {BOLD}{url}{RESET}")
        if has_intelligence and not llm_api_key and not ex.has_llm_api_key:
            print()
            info("AI features require LLM_API_KEY in .env before starting.")
        print()
        return

    print()
    if has_intelligence and not llm_api_key and not ex.has_llm_api_key:
        warn("LLM_API_KEY is not set. AI features will be unavailable.")
        info("Add it to .env and restart to enable AI features.")
        print()

    if ask_yn("Start Litloft now?", 'y'):
        heading("Starting Litloft")
        result = subprocess.run(
            ['docker', 'compose', 'up', '-d', '--build'],
            cwd=str(base),
        )
        print()
        if result.returncode == 0:
            print(f"{BOLD}{GREEN}Litloft is running!{RESET}")
            print(f"\n  {BOLD}{BLUE}→  {url}{RESET}")
            print("\n  The /setup wizard will run on first launch.")
            print("  Use it to name drives, set passwords, and enable AI features.")
        else:
            warn("docker compose up failed. Check the output above.")
            print()
            info("To retry:  docker compose up -d --build")
            info(f"Then open: {url}")
    else:
        print()
        info("When ready, run:  docker compose up -d --build")
        info(f"Then open:        {url}")

    print()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nAborted.")
        sys.exit(1)
