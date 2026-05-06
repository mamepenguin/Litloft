#!/usr/bin/env python3
"""Litloft interactive setup — generates docker-compose.override.yml and friends."""

import json, os, re, sys
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

def write_env_key(key, value, env_path):
    if env_path.exists():
        content = env_path.read_text()
        if re.search(rf'^{re.escape(key)}=', content, re.MULTILINE):
            env_path.write_text(
                re.sub(rf'^{re.escape(key)}=.*', f'{key}={value}', content, flags=re.MULTILINE))
            return
    with env_path.open('a') as f:
        f.write(f'{key}={value}\n')

# ── YAML helpers ─────────────────────────────────────────────────────────────

def _set_yaml_scalar(content, key, value, quoted=False):
    """Replace a YAML scalar value in-place, preserving inline comments."""
    if quoted:
        pattern = rf'^(\s+{re.escape(key)}:\s*)"[^"]*"'
        repl    = rf'\g<1>"{value}"'
    else:
        pattern = rf'^(\s+{re.escape(key)}:\s*)\S+'
        repl    = rf'\g<1>{value}'
    return re.sub(pattern, repl, content, flags=re.MULTILINE)

def _ask_feature_mode(label, hint, current='false'):
    """Ask for a 3-mode feature flag: false / manual / on_index."""
    print(f"  {label}:")
    if hint:
        print(f"    {hint}")
    print("    1) false    — disabled")
    print("    2) manual   — generate on request")
    print("    3) on_index — run automatically during indexing")
    num = {'false': '1', 'manual': '2', 'on_index': '3'}.get(current, '1')
    choice = ask("  Choice", num)
    return {'1': 'false', '2': 'manual', '3': 'on_index'}.get(choice, 'false')

# ── Read existing config ──────────────────────────────────────────────────────

def _yaml_section_value(content, section, key):
    """Extract a scalar value from a YAML section without a YAML library."""
    # Include the trailing newline so m.end() lands at the start of the block.
    m = re.search(rf'^{re.escape(section)}:[^\n]*\n', content, re.MULTILINE)
    if not m:
        return None
    block = re.match(r'((?:[ \t]+[^\n]*\n?)*)', content[m.end():])
    if not block:
        return None
    km = re.search(
        rf'^\s+{re.escape(key)}:\s*["\']?([^"\'#\n]+?)["\']?\s*(?:#.*)?$',
        block.group(1), re.MULTILINE)
    return km.group(1).strip() if km else None


class ExistingConfig:
    def __init__(self, base: Path):
        self.drives: list[dict] = []   # name, slug, group, host_path
        self.passwords: list[dict] = []  # password, group
        self.port = '3000'
        self.use_passwords = False
        self.llm_provider = 'disabled'
        self.llm_base_url = ''
        self.llm_model = ''
        self.llm_api_key = ''
        self.llm_output_lang = 'auto'
        self.feat_auto_tags          = 'false'
        self.feat_summaries          = 'false'
        self.feat_detailed_summaries = 'false'
        self.feat_rag                = 'false'
        self.feat_transcript_refine  = 'false'
        self.feat_vision_describe    = 'false'
        self.llm_vision_model        = ''
        self.whisper_model           = 'openai/whisper-large-v3-turbo'
        self.text_embedding_model    = 'intfloat/multilingual-e5-small'
        self._load(base)

    def _load(self, base: Path):
        drives_f = base / 'drives.json'
        dc_f     = base / 'docker-compose.override.yml'
        pass_f   = base / 'passwords.json'
        env_f    = base / '.env'
        sc_f     = base / 'addons/intelligence/search-config.yml'

        if drives_f.exists():
            try:
                for d in json.loads(drives_f.read_text()):
                    path = d.get('path', '')
                    slug = path[len('/app/drives/'):] if path.startswith('/app/drives/') else path
                    self.drives.append({
                        'name': d.get('name', ''),
                        'slug': slug,
                        'group': d.get('access_group', ''),
                        'host_path': '',
                    })
            except Exception:
                pass

        if dc_f.exists():
            try:
                for m in re.finditer(r'-\s+([^:\s][^:]+):/app/drives/([^\s:]+)',
                                     dc_f.read_text()):
                    host, slug = m.group(1).strip(), m.group(2).strip()
                    for d in self.drives:
                        if d['slug'] == slug:
                            d['host_path'] = host
            except Exception:
                pass

        if pass_f.exists():
            try:
                for p in json.loads(pass_f.read_text()):
                    groups = p.get('groups', [''])
                    self.passwords.append({
                        'password': p.get('password', ''),
                        'group': groups[0] if groups else '',
                    })
                    self.use_passwords = True
            except Exception:
                pass

        if env_f.exists():
            for line in env_f.read_text().splitlines():
                if line.startswith('LITLOFT_PORT='):
                    self.port = line.split('=', 1)[1].strip()
                elif line.startswith('LLM_API_KEY='):
                    val = line.split('=', 1)[1].strip()
                    if val and not val.startswith('sk-your'):
                        self.llm_api_key = val

        if sc_f.exists():
            content = sc_f.read_text()
            for attr, section, key in [
                ('llm_provider',    'llm',      'provider'),
                ('llm_base_url',    'llm',      'base_url'),
                ('llm_output_lang', 'llm',      'output_language'),
                ('llm_model',       'llm',      'model'),
                ('feat_auto_tags',          'features', 'auto_tags'),
                ('feat_summaries',          'features', 'summaries'),
                ('feat_detailed_summaries', 'features', 'detailed_summaries'),
                ('feat_rag',                'features', 'rag'),
                ('feat_transcript_refine',  'features', 'transcript_refine'),
                ('feat_vision_describe',    'features', 'vision_describe'),
                ('llm_vision_model',        'llm',      'vision_model'),
                ('whisper_model',           'models',   'whisper'),
                ('text_embedding_model',    'models',   'text_embedding'),
            ]:
                val = _yaml_section_value(content, section, key)
                if val:
                    setattr(self, attr, val)

    def password_for_group(self, group: str) -> str:
        return next((p['password'] for p in self.passwords if p['group'] == group), '')

    @property
    def whisper_choice(self) -> str:
        if 'turbo'    in self.whisper_model: return '2'
        if 'large-v3' in self.whisper_model: return '3'
        return '1'

    @property
    def llm_choice(self) -> str:
        return {'ollama': '2', 'openai_compatible': '3'}.get(self.llm_provider, '1')

    def feat_yn(self, key: str) -> str:
        return 'y' if getattr(self, f'feat_{key}', 'false') != 'false' else 'n'

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    base = Path(__file__).parent
    ex = ExistingConfig(base)

    if ex.drives:
        info(f"Existing configuration loaded ({len(ex.drives)} drive(s))")

    print(f"\n{BOLD}Litloft Setup{RESET}")
    print("Generates configuration files for your Litloft instance.")
    print("Press Enter to accept defaults shown in [brackets].")

    # ── Step 1: Drives ────────────────────────────────────────────────────────

    heading("Step 1: Drives")

    default_count = max(len(ex.drives), 1)
    raw = ask("How many drives?", str(default_count))
    num_drives = int(raw) if raw.isdigit() and int(raw) >= 1 else 1

    drives: list[dict] = []
    used_slugs: set[str] = set()

    for i in range(1, num_drives + 1):
        idx = i - 1
        ex_d = ex.drives[idx] if idx < len(ex.drives) else {}
        print(f"\n  {BOLD}Drive {i}{RESET}")

        name = ask("  Display name",       ex_d.get('name', 'Videos'))
        host = ask("  Host path (absolute)", ex_d.get('host_path') or str(base / 'videos'))

        # Reuse existing slug if name unchanged; otherwise compute a new one
        if ex_d and name == ex_d.get('name') and ex_d.get('slug'):
            slug = ex_d['slug']
        else:
            slug = slugify(name) or f'drive_{i}'
        if slug in used_slugs:
            slug = f'{slug}_{i}'
        used_slugs.add(slug)

        drives.append({'name': name, 'host_path': host, 'slug': slug, 'group': ''})

    # ── Step 2: Port ──────────────────────────────────────────────────────────

    heading("Step 2: Port")
    port = ask("Port", ex.port)
    if not port.isdigit():
        port = '3000'

    # ── Step 3: Password Protection ───────────────────────────────────────────

    heading("Step 3: Password Protection")
    print("  Without passwords.json, all drives are publicly accessible.")
    print()
    use_passwords = ask_yn("Enable password protection?", 'y' if ex.use_passwords else 'n')

    pass_entries: list[tuple[str, str]] = []  # (password, group)
    seen_groups: set[str] = set()

    if use_passwords:
        print()
        print("  Assign an access_group to each drive you want to protect.")
        print()
        for i, drive in enumerate(drives):
            print(f"  {BOLD}Drive: {drive['name']}{RESET}")
            ex_d    = ex.drives[i] if i < len(ex.drives) else {}
            ex_grp  = ex_d.get('group', '')
            protect = ask_yn("  Password protect this drive?", 'y' if ex_grp else 'n')
            if protect:
                def_grp = ex_grp or slugify(drive['name']) or f'group_{i + 1}'
                group   = ask("  Access group name", def_grp)
                drive['group'] = group
                if group not in seen_groups:
                    password = ask(f"  Password for group '{group}'",
                                   ex.password_for_group(group))
                    seen_groups.add(group)
                    pass_entries.append((password, group))
                else:
                    info(f"Group '{group}' already has a password — reusing it")
            print()

    # ── Step 4: Intelligence Addon ────────────────────────────────────────────

    has_intelligence         = False
    whisper_model            = 'openai/whisper-large-v3-turbo'
    text_embedding_model     = 'intfloat/multilingual-e5-small'
    llm_provider             = 'disabled'
    llm_base_url             = ''
    llm_model                = ''
    llm_api_key_val          = ''
    llm_vision_model         = ''
    feat_auto_tags           = 'false'
    feat_summaries           = 'false'
    feat_detailed_summaries  = 'false'
    feat_rag                 = 'false'
    feat_transcript_refine   = 'false'
    feat_vision_describe     = 'false'
    llm_output_lang          = 'auto'

    if (base / 'addons/intelligence').exists():
        heading("Step 4: Intelligence Addon (Semantic Search + AI)")
        if ask_yn("Configure intelligence addon?", 'y'):
            has_intelligence = True

            print("  Whisper transcription model:")
            print("    1) small       — 244 M, ~500 MB RAM  (fast)")
            print("    2) turbo       — 809 M, ~1.0–1.2 GB RAM  (best accuracy/speed)")
            print("    3) large-v3    — 1550 M, ~2–3 GB RAM  (highest accuracy)")
            wc = ask("  Choice", ex.whisper_choice)
            if wc == '2': whisper_model = 'openai/whisper-large-v3-turbo'
            elif wc == '3': whisper_model = 'openai/whisper-large-v3'
            else:          whisper_model = 'openai/whisper-small'

            print()
            _te_options = [
                ('1', 'intfloat/multilingual-e5-small', '384d, ~120 MB  (fast)'),
                ('2', 'intfloat/multilingual-e5-base',  '768d, ~470 MB  (recommended balance)'),
                ('3', 'cl-nagoya/ruri-v3-30m',          '256d, ~150 MB  (Japanese-optimised, fast)'),
                ('4', 'cl-nagoya/ruri-v3-130m',         '768d, ~520 MB  (Japanese, highest accuracy)'),
            ]
            _te_to_num = {model: num for num, model, _ in _te_options}
            print("  Text embedding model  (re-index required on change):")
            for num, model, desc in _te_options:
                print(f"    {num}) {model.split('/')[-1]:<30} — {desc}")
            tc = ask("  Choice", _te_to_num.get(ex.text_embedding_model, '1'))
            text_embedding_model = next(
                (m for n, m, _ in _te_options if n == tc),
                'intfloat/multilingual-e5-small')

            print()
            print("  LLM provider (for auto-tags, summaries, Ask):")
            print("    1) disabled          — no LLM features")
            print("    2) ollama            — local Ollama instance")
            print("    3) openai_compatible — OpenAI / DeepSeek / LM Studio / vLLM")
            lc = ask("  Choice", ex.llm_choice)

            if lc == '2':
                llm_provider = 'ollama'
                llm_base_url = ask("  Ollama base URL",
                                   ex.llm_base_url or 'http://host.docker.internal:11434')
                llm_model    = ask("  Model (e.g. gemma4:e4b, llama3.2)", ex.llm_model)
            elif lc == '3':
                llm_provider = 'openai_compatible'
                llm_base_url = ask("  Base URL (e.g. https://api.openai.com/v1)", ex.llm_base_url)
                llm_model    = ask("  Model (e.g. gpt-4o-mini, deepseek-chat)", ex.llm_model)
                llm_api_key_val = ask("  API key (blank = keep existing / set in .env)",
                                      ex.llm_api_key)

            if llm_provider != 'disabled':
                print()
                print("  AI features — can be changed later in search-config.yml")
                print()
                feat_auto_tags = _ask_feature_mode(
                    "Auto-tags", "suggest tags from file content",
                    ex.feat_auto_tags)
                print()
                feat_summaries = _ask_feature_mode(
                    "Summaries", "1-sentence + paragraph summary for videos, audio, documents",
                    ex.feat_summaries)
                print()
                feat_detailed_summaries = _ask_feature_mode(
                    "Detailed summaries",
                    "long-form Markdown — on_index costs ~10K-15K tokens per new file",
                    ex.feat_detailed_summaries)
                print()
                feat_transcript_refine = _ask_feature_mode(
                    "Transcript refine", "LLM-based ASR correction (originals kept for revert)",
                    ex.feat_transcript_refine)
                print()
                feat_vision_describe = _ask_feature_mode(
                    "Vision describe",
                    "image description — on_index sends image bytes to LLM on each new file",
                    ex.feat_vision_describe)
                if feat_vision_describe != 'false':
                    print()
                    llm_vision_model = ask(
                        "    vision_model (e.g. llava:13b, gpt-4o-mini)",
                        ex.llm_vision_model)
                print()
                feat_rag = 'true' if ask_yn(
                    "Ask / RAG (Q&A over files)?  ⚠ file content sent to LLM on every ask",
                    ex.feat_yn('rag')) else 'false'
                print()
                llm_output_lang = ask("  Output language for AI (auto/ja/en)", ex.llm_output_lang)

    # ── Step 5: Knowledge Addon ───────────────────────────────────────────────

    has_knowledge            = False
    knowledge_webhook_secret = ''
    core_internal_secret     = ''

    if (base / 'addons/knowledge').exists():
        heading("Step 5: Knowledge Addon (Markdown Vault)")
        if ask_yn("Configure knowledge addon?", 'n'):
            has_knowledge            = True
            knowledge_webhook_secret = gen_secret()
            core_internal_secret     = gen_secret()
            ok("Generated secrets")

    # ── Summary ───────────────────────────────────────────────────────────────

    heading("Summary")
    print("  Files to generate:")
    print("    docker-compose.override.yml")
    print("    drives.json")
    if port != '3000':        print(f"    .env  (LITLOFT_PORT={port})")
    if use_passwords:         print("    passwords.json")
    if has_intelligence:      print("    addons/intelligence/search-config.yml")
    if has_knowledge or llm_api_key_val: print("    .env  (secrets / API key)")
    print()
    print("  Drives:")
    for d in drives:
        suffix = f"  (group={d['group']})" if d['group'] else ''
        print(f"    {d['name']}  →  {d['host_path']}{suffix}")

    print()
    if not ask_yn("Generate files?", 'y'):
        print("\nAborted.")
        return

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
        if use_passwords:
            lines.append("      - ./passwords.json:/app/passwords.json:ro")

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
            mounts = ','.join(f"{d['name']}=/drives/{d['slug']}" for d in drives)
            lines += [
                "", "  intelligence:", "    build: ./addons/intelligence",
                "    expose:", '      - "8100"', "    volumes:",
                "      - ./addons/intelligence/search-config.yml:/app/search-config.yml:ro",
                "      - ./data/addons/intelligence:/intelligence-data",
                "      - ./data/videos.db:/data/litloft.db:ro",
                *[f"      - {d['host_path']}:/drives/{d['slug']}:ro" for d in drives],
                "    environment:", f"      - DRIVE_MOUNTS={mounts}",
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

    # ── Generate drives.json ──────────────────────────────────────────────────

    drives_file = base / 'drives.json'
    if check_overwrite(drives_file):
        data = []
        for d in drives:
            entry: dict = {"name": d['name'], "path": f"/app/drives/{d['slug']}"}
            if d['group']: entry['access_group'] = d['group']
            data.append(entry)
        drives_file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
        ok("drives.json")

    # ── Generate passwords.json ───────────────────────────────────────────────

    if use_passwords and pass_entries:
        pass_file = base / 'passwords.json'
        if check_overwrite(pass_file):
            data = [{"password": pw, "groups": [grp]} for pw, grp in pass_entries]
            pass_file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
            ok("passwords.json")

    # ── Generate search-config.yml ────────────────────────────────────────────

    if has_intelligence:
        sc_file  = base / 'addons/intelligence/search-config.yml'
        ex_file  = base / 'addons/intelligence/search-config.yml.example'
        if check_overwrite(sc_file):
            if not ex_file.exists():
                warn("search-config.yml.example not found — skipping")
            else:
                content = ex_file.read_text()
                # Update header comment
                content = content.replace(
                    '# Copy to search-config.yml and customize as needed.',
                    '# Generated by configure.py — edit freely.')
                # Feature flags (unquoted)
                for key, val in [
                    ('auto_tags',          feat_auto_tags),
                    ('summaries',          feat_summaries),
                    ('detailed_summaries', feat_detailed_summaries),
                    ('rag',                feat_rag),
                    ('transcript_refine',  feat_transcript_refine),
                    ('vision_describe',    feat_vision_describe),
                ]:
                    content = _set_yaml_scalar(content, key, val)
                # LLM settings (quoted strings)
                for key, val in [
                    ('provider',        llm_provider),
                    ('base_url',        llm_base_url),
                    ('model',           llm_model),
                    ('output_language', llm_output_lang),
                ]:
                    content = _set_yaml_scalar(content, key, val, quoted=True)
                if llm_api_key_val:
                    content = _set_yaml_scalar(content, 'api_key', llm_api_key_val, quoted=True)
                if llm_vision_model:
                    content = _set_yaml_scalar(content, 'vision_model', llm_vision_model, quoted=True)
                # models: section (quoted)
                content = _set_yaml_scalar(content, 'whisper',         whisper_model,        quoted=True)
                content = _set_yaml_scalar(content, 'text_embedding',  text_embedding_model, quoted=True)
                sc_file.write_text(content)
                ok("addons/intelligence/search-config.yml")

    # ── Update .env ───────────────────────────────────────────────────────────

    env_file = base / '.env'
    wrote_env = False
    if port != '3000':       write_env_key('LITLOFT_PORT', port, env_file);                          wrote_env = True
    if llm_api_key_val:      write_env_key('LLM_API_KEY', llm_api_key_val, env_file);               wrote_env = True
    if has_knowledge:
        if knowledge_webhook_secret: write_env_key('KNOWLEDGE_WEBHOOK_SECRET', knowledge_webhook_secret, env_file); wrote_env = True
        if core_internal_secret:     write_env_key('CORE_INTERNAL_SECRET', core_internal_secret, env_file);        wrote_env = True
    if wrote_env:
        ok(".env")

    # ── Mark setup as complete (skip web wizard on first launch) ─────────────

    sentinel = base / 'data' / 'setup_completed'
    sentinel.parent.mkdir(parents=True, exist_ok=True)
    sentinel.touch()
    ok("data/setup_completed  (web wizard will be skipped)")

    # ── Done ──────────────────────────────────────────────────────────────────

    print(f"\n{BOLD}{GREEN}Done.{RESET}")
    print("\n  Next steps:")
    print("    docker compose up -d --build")
    if has_intelligence and llm_provider == 'disabled':
        print()
        warn("LLM is disabled. Edit addons/intelligence/search-config.yml")
        warn("to enable auto-tags / summaries / Ask when ready.")
    print()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nAborted.")
        sys.exit(1)
