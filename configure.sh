#!/usr/bin/env bash
# configure.sh — Interactive setup for Litloft
# Generates: docker-compose.override.yml, drives.json, passwords.json (optional),
#            addons/intelligence/search-config.yml (optional), .env (optional)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Colors & helpers ─────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'
NC='\033[0m'

heading() {
  echo
  echo -e "${BOLD}${BLUE}━━  $1${RESET}"
  echo
}

ok()   { echo -e "  ${GREEN}✓${RESET}  $1"; }
warn() { echo -e "  ${YELLOW}!${RESET}  $1"; }
info() { echo -e "  ${BLUE}→${RESET}  $1"; }

ask() {
  local prompt="$1" default="${2:-}" varname="$3"
  local display
  if [[ -n "$default" ]]; then
    display="  ${prompt} [${BOLD}${default}${RESET}]: "
  else
    display="  ${prompt}: "
  fi
  local input
  # shellcheck disable=SC2086
  read -r -p "$(echo -e "$display")" input
  input="${input:-$default}"
  printf -v "$varname" '%s' "$input"
}

ask_yn() {
  local prompt="$1" default="${2:-n}" varname="$3"
  local hint default_lower
  default_lower=$(echo "$default" | tr '[:upper:]' '[:lower:]')
  if [[ "$default_lower" == "y" ]]; then hint="Y/n"; else hint="y/N"; fi
  local input input_lower
  read -r -p "$(echo -e "  ${prompt} [${BOLD}${hint}${RESET}]: ")" input
  input="${input:-$default}"
  input_lower=$(echo "$input" | tr '[:upper:]' '[:lower:]')
  if [[ "$input_lower" =~ ^y ]]; then printf -v "$varname" 'y'
  else printf -v "$varname" 'n'; fi
}

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' \
    | iconv -c -f utf-8 -t ascii//TRANSLIT 2>/dev/null \
    | sed 's/[^a-z0-9_-]/_/g' \
    | sed 's/__*/_/g' \
    | sed 's/^_//;s/_$//'
}

check_overwrite() {
  local file="$1"
  if [[ -f "$file" ]]; then
    local ans
    ask_yn "$(echo -e "${YELLOW}$(basename "$file")${RESET} already exists. Overwrite?") " "n" ans
    [[ "$ans" == "n" ]] && return 1
  fi
  return 0
}

write_env_key() {
  local key="$1" value="$2" file="$SCRIPT_DIR/.env"
  if [[ -f "$file" ]] && grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file"
    rm -f "${file}.bak"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

# ── Welcome ──────────────────────────────────────────────────────────────────

echo
echo -e "${BOLD}Litloft Setup${RESET}"
echo "Generates configuration files for your Litloft instance."
echo "Press Enter to accept defaults shown in [brackets]."

# ── Step 1: Drives ───────────────────────────────────────────────────────────

heading "Step 1: Drives"

declare -a DRIVE_NAMES=()
declare -a DRIVE_HOST_PATHS=()
declare -a DRIVE_SLUGS=()
declare -a DRIVE_READONLY=()
declare -a DRIVE_GROUPS=()

num_drives_str=""
ask "How many drives?" "1" num_drives_str
num_drives="${num_drives_str//[^0-9]/}"
[[ -z "$num_drives" || "$num_drives" -lt 1 ]] && num_drives=1

for ((i=1; i<=num_drives; i++)); do
  echo
  echo -e "  ${BOLD}Drive $i${RESET}"

  name=""
  ask "  Display name" "Videos" name

  host_path=""
  ask "  Host path (absolute)" "$SCRIPT_DIR/videos" host_path

  readonly_ans=""
  ask_yn "  Read-only?" "n" readonly_ans

  slug=""
  slug=$(slugify "$name")
  [[ -z "$slug" ]] && slug="drive_${i}"

  # Ensure unique slug
  for existing in "${DRIVE_SLUGS[@]:-}"; do
    if [[ "$existing" == "$slug" ]]; then
      slug="${slug}_${i}"
      break
    fi
  done

  DRIVE_NAMES+=("$name")
  DRIVE_HOST_PATHS+=("$host_path")
  DRIVE_SLUGS+=("$slug")
  DRIVE_READONLY+=("$readonly_ans")
  DRIVE_GROUPS+=("")
done

# ── Step 2: Port ─────────────────────────────────────────────────────────────

heading "Step 2: Port"
PORT=""
ask "Port" "3000" PORT
[[ -z "$PORT" || ! "$PORT" =~ ^[0-9]+$ ]] && PORT="3000"

# ── Step 3: Password Protection ──────────────────────────────────────────────

heading "Step 3: Password Protection"
echo "  Without passwords.json, all drives are publicly accessible."
echo

USE_PASSWORDS=""
ask_yn "Enable password protection?" "n" USE_PASSWORDS

declare -a PASS_PASSWORDS=()
declare -a PASS_GROUPS=()

if [[ "$USE_PASSWORDS" == "y" ]]; then
  echo
  echo "  Assign an access_group to each drive you want to protect,"
  echo "  then set a password for each group."
  echo

  seen_groups=" "  # space-padded membership test (bash 3 compat)

  for ((i=0; i<${#DRIVE_NAMES[@]}; i++)); do
    name="${DRIVE_NAMES[$i]}"
    echo -e "  ${BOLD}Drive: $name${RESET}"
    protect_ans=""
    ask_yn "  Password protect this drive?" "n" protect_ans
    if [[ "$protect_ans" == "y" ]]; then
      default_group=$(slugify "$name")
      [[ -z "$default_group" ]] && default_group="group_$((i+1))"
      group=""
      ask "  Access group name" "$default_group" group
      DRIVE_GROUPS[$i]="$group"

      if [[ "$seen_groups" != *" ${group} "* ]]; then
        password=""
        ask "  Password for group '$group'" "" password
        seen_groups="${seen_groups}${group} "
        PASS_PASSWORDS+=("$password")
        PASS_GROUPS+=("$group")
      else
        info "Group '$group' already has a password — reusing it"
      fi
    fi
    echo
  done
fi

# ── Step 4: Intelligence Addon ───────────────────────────────────────────────

HAS_INTELLIGENCE=false
WHISPER_MODEL="openai/whisper-small"
LLM_PROVIDER="disabled"
LLM_BASE_URL=""
LLM_MODEL=""
LLM_API_KEY_VAL=""
FEAT_AUTO_TAGS="false"
FEAT_SUMMARIES="false"
FEAT_RAG="false"
LLM_OUTPUT_LANG="auto"

if [[ -d "$SCRIPT_DIR/addons/intelligence" ]]; then
  heading "Step 4: Intelligence Addon (Semantic Search + AI)"
  use_intel=""
  ask_yn "Configure intelligence addon?" "y" use_intel

  if [[ "$use_intel" == "y" ]]; then
    HAS_INTELLIGENCE=true

    echo
    echo "  Whisper transcription model:"
    echo "    1) small       — 244 M, ~500 MB RAM  (default, fast)"
    echo "    2) turbo       — 809 M, ~1.0–1.2 GB RAM  (best accuracy/speed)"
    echo "    3) large-v3    — 1550 M, ~2–3 GB RAM  (highest accuracy)"
    whisper_choice=""
    ask "  Choice" "1" whisper_choice
    case "$whisper_choice" in
      2) WHISPER_MODEL="openai/whisper-large-v3-turbo" ;;
      3) WHISPER_MODEL="openai/whisper-large-v3" ;;
      *) WHISPER_MODEL="openai/whisper-small" ;;
    esac

    echo
    echo "  LLM provider (for auto-tags, summaries, Ask):"
    echo "    1) disabled          — no LLM features  (default)"
    echo "    2) ollama            — local Ollama instance"
    echo "    3) openai_compatible — OpenAI / DeepSeek / LM Studio / vLLM"
    llm_choice=""
    ask "  Choice" "1" llm_choice

    case "$llm_choice" in
      2)
        LLM_PROVIDER="ollama"
        ask "  Ollama base URL" "http://host.docker.internal:11434" LLM_BASE_URL
        ask "  Model (e.g. gemma4:e4b, llama3.2)" "" LLM_MODEL
        ;;
      3)
        LLM_PROVIDER="openai_compatible"
        ask "  Base URL (e.g. https://api.openai.com/v1)" "" LLM_BASE_URL
        ask "  Model (e.g. gpt-4o-mini, deepseek-chat)" "" LLM_MODEL
        ask "  API key (blank = set LLM_API_KEY in .env later)" "" LLM_API_KEY_VAL
        ;;
    esac

    if [[ "$LLM_PROVIDER" != "disabled" ]]; then
      echo
      echo "  AI features (all require LLM — can be changed later in search-config.yml):"
      auto_tags_ans=""; ask_yn "  Auto-tags? (suggest tags on index)" "n" auto_tags_ans
      [[ "$auto_tags_ans" == "y" ]] && FEAT_AUTO_TAGS="manual"

      summaries_ans=""; ask_yn "  AI summaries?" "n" summaries_ans
      [[ "$summaries_ans" == "y" ]] && FEAT_SUMMARIES="manual"

      rag_ans=""; ask_yn "  Ask / RAG (Q&A over your files)?" "n" rag_ans
      [[ "$rag_ans" == "y" ]] && FEAT_RAG="true"

      echo
      ask "  Output language for AI (auto/ja/en)" "auto" LLM_OUTPUT_LANG
    fi
  fi
fi

# ── Step 5: Knowledge Addon ──────────────────────────────────────────────────

HAS_KNOWLEDGE=false
KNOWLEDGE_WEBHOOK_SECRET=""
CORE_INTERNAL_SECRET=""

if [[ -d "$SCRIPT_DIR/addons/knowledge" ]]; then
  heading "Step 5: Knowledge Addon (Markdown Vault)"
  use_knowledge=""
  ask_yn "Configure knowledge addon?" "n" use_knowledge

  if [[ "$use_knowledge" == "y" ]]; then
    HAS_KNOWLEDGE=true
    if command -v openssl &>/dev/null; then
      KNOWLEDGE_WEBHOOK_SECRET=$(openssl rand -hex 32)
      CORE_INTERNAL_SECRET=$(openssl rand -hex 32)
      ok "Generated secrets with openssl"
    else
      warn "openssl not found — enter secrets manually (or leave blank and edit .env later)"
      ask "  KNOWLEDGE_WEBHOOK_SECRET" "" KNOWLEDGE_WEBHOOK_SECRET
      ask "  CORE_INTERNAL_SECRET" "" CORE_INTERNAL_SECRET
    fi
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────

heading "Summary"

echo "  Files to generate:"
echo "    docker-compose.override.yml"
echo "    drives.json"
[[ "$PORT" != "3000" ]] && echo "    .env  (LITLOFT_PORT=$PORT)"
[[ "$USE_PASSWORDS" == "y" ]] && echo "    passwords.json"
[[ "$HAS_INTELLIGENCE" == "true" ]] && echo "    addons/intelligence/search-config.yml"
[[ "$HAS_KNOWLEDGE" == "true" || -n "$LLM_API_KEY_VAL" ]] && echo "    .env  (secrets / API key)"

echo
echo "  Drives:"
for ((i=0; i<${#DRIVE_NAMES[@]}; i++)); do
  flags=""
  [[ "${DRIVE_READONLY[$i]}" == "y" ]] && flags="${flags} readonly"
  [[ -n "${DRIVE_GROUPS[$i]}" ]] && flags="${flags} group=${DRIVE_GROUPS[$i]}"
  echo "    ${DRIVE_NAMES[$i]}  →  ${DRIVE_HOST_PATHS[$i]}${flags:+  (${flags# })}"
done

echo
confirm=""
ask_yn "Generate files?" "y" confirm
[[ "$confirm" != "y" ]] && { echo; echo "Aborted."; exit 0; }

# ── Generate docker-compose.override.yml ─────────────────────────────────────

DC_FILE="$SCRIPT_DIR/docker-compose.override.yml"
if check_overwrite "$DC_FILE"; then
  {
    echo "# Litloft user configuration"
    echo "# Generated by configure.sh — edit freely."
    echo "# Do NOT edit docker-compose.yml directly."
    echo
    echo "services:"
    echo "  backend:"

    # Volumes
    echo "    volumes:"
    for ((i=0; i<${#DRIVE_NAMES[@]}; i++)); do
      slug="${DRIVE_SLUGS[$i]}"
      host="${DRIVE_HOST_PATHS[$i]}"
      ro_flag=""
      [[ "${DRIVE_READONLY[$i]}" == "y" ]] && ro_flag=":ro"
      echo "      - ${host}:/app/drives/${slug}${ro_flag}"
    done
    if [[ "$USE_PASSWORDS" == "y" ]]; then
      echo "      - ./passwords.json:/app/passwords.json:ro"
    fi

    # Backend environment
    env_lines=()
    [[ "$HAS_INTELLIGENCE" == "true" ]] && env_lines+=("- INTELLIGENCE_SERVICE_URL=http://intelligence:8100")
    [[ "$HAS_KNOWLEDGE" == "true" ]] && env_lines+=("- KNOWLEDGE_SERVICE_URL=http://knowledge:8200")
    [[ "$HAS_KNOWLEDGE" == "true" ]] && env_lines+=("- KNOWLEDGE_WEBHOOK_SECRET=\${KNOWLEDGE_WEBHOOK_SECRET:-}")
    [[ "$HAS_KNOWLEDGE" == "true" ]] && env_lines+=("- CORE_INTERNAL_SECRET=\${CORE_INTERNAL_SECRET:-}")

    if [[ ${#env_lines[@]} -gt 0 ]]; then
      echo "    environment:"
      for line in "${env_lines[@]}"; do
        echo "      $line"
      done
    fi

    # Frontend port
    if [[ "$PORT" != "3000" ]]; then
      echo
      echo "  frontend:"
      echo "    ports:"
      echo "      - \"${PORT}:3000\""
    fi

    # Intelligence service
    if [[ "$HAS_INTELLIGENCE" == "true" ]]; then
      echo
      echo "  intelligence:"
      echo "    build: ./addons/intelligence"
      echo "    expose:"
      echo "      - \"8100\""
      echo "    volumes:"
      echo "      - ./addons/intelligence/search-config.yml:/app/search-config.yml:ro"
      echo "      - ./data/addons/intelligence:/intelligence-data"
      for ((i=0; i<${#DRIVE_NAMES[@]}; i++)); do
        slug="${DRIVE_SLUGS[$i]}"
        host="${DRIVE_HOST_PATHS[$i]}"
        echo "      - ${host}:/drives/${slug}:ro"
      done
      echo "    environment:"
      # Build DRIVE_MOUNTS env value
      drive_mounts_val=""
      for ((i=0; i<${#DRIVE_NAMES[@]}; i++)); do
        slug="${DRIVE_SLUGS[$i]}"
        name="${DRIVE_NAMES[$i]}"
        [[ -n "$drive_mounts_val" ]] && drive_mounts_val+=","
        drive_mounts_val+="${name}=/drives/${slug}"
      done
      echo "      - DRIVE_MOUNTS=${drive_mounts_val}"
      echo "    depends_on:"
      echo "      backend:"
      echo "        condition: service_healthy"
      echo "    restart: unless-stopped"
    fi

    # Knowledge service
    if [[ "$HAS_KNOWLEDGE" == "true" ]]; then
      echo
      echo "  knowledge:"
      echo "    build: ./addons/knowledge"
      echo "    expose:"
      echo "      - \"8200\""
      echo "    volumes:"
      echo "      - ./data/addons/knowledge:/knowledge-data"
      echo "    environment:"
      echo "      - HOMEVAULT_INTERNAL_URL=http://backend:8000"
      echo "      - KNOWLEDGE_WEBHOOK_SECRET=\${KNOWLEDGE_WEBHOOK_SECRET:-}"
      echo "      - CORE_INTERNAL_SECRET=\${CORE_INTERNAL_SECRET:-}"
      echo "    depends_on:"
      echo "      backend:"
      echo "        condition: service_healthy"
      echo "    restart: unless-stopped"
    fi
  } > "$DC_FILE"
  ok "docker-compose.override.yml"
fi

# ── Generate drives.json ──────────────────────────────────────────────────────

DRIVES_FILE="$SCRIPT_DIR/drives.json"
if check_overwrite "$DRIVES_FILE"; then
  {
    echo "["
    for ((i=0; i<${#DRIVE_NAMES[@]}; i++)); do
      [[ $i -gt 0 ]] && echo ","
      name="${DRIVE_NAMES[$i]}"
      slug="${DRIVE_SLUGS[$i]}"
      group="${DRIVE_GROUPS[$i]}"
      readonly_flag="${DRIVE_READONLY[$i]}"

      # Escape name for JSON
      name_escaped="${name//\\/\\\\}"
      name_escaped="${name_escaped//\"/\\\"}"

      printf '  {'
      printf '"name": "%s", ' "$name_escaped"
      printf '"path": "/app/drives/%s"' "$slug"
      [[ "$readonly_flag" == "y" ]] && printf ', "readonly": true'
      [[ -n "$group" ]] && printf ', "access_group": "%s"' "$group"
      printf '}'
    done
    echo
    echo "]"
  } > "$DRIVES_FILE"
  ok "drives.json"
fi

# ── Generate passwords.json ───────────────────────────────────────────────────

if [[ "$USE_PASSWORDS" == "y" && ${#PASS_PASSWORDS[@]} -gt 0 ]]; then
  PASS_FILE="$SCRIPT_DIR/passwords.json"
  if check_overwrite "$PASS_FILE"; then
    {
      echo "["
      for ((i=0; i<${#PASS_PASSWORDS[@]}; i++)); do
        [[ $i -gt 0 ]] && echo ","
        pw="${PASS_PASSWORDS[$i]//\"/\\\"}"
        grp="${PASS_GROUPS[$i]//\"/\\\"}"
        printf '  {"password": "%s", "groups": ["%s"]}' "$pw" "$grp"
      done
      echo
      echo "]"
    } > "$PASS_FILE"
    ok "passwords.json"
  fi
fi

# ── Generate search-config.yml ────────────────────────────────────────────────

if [[ "$HAS_INTELLIGENCE" == "true" ]]; then
  SEARCH_CONFIG="$SCRIPT_DIR/addons/intelligence/search-config.yml"
  if check_overwrite "$SEARCH_CONFIG"; then
    {
      echo "# Litloft intelligence addon configuration"
      echo "# Generated by configure.sh — edit freely."
      echo "# Full reference: search-config.yml.example"
      echo
      echo "features:"
      echo "  indexing: true"
      echo "  search: true"
      echo "  auto_tags: ${FEAT_AUTO_TAGS}"
      echo "  summaries: ${FEAT_SUMMARIES}"
      echo "  detailed_summaries: false"
      echo "  rag: ${FEAT_RAG}"
      echo "  transcript_refine: false"
      echo "  vision_describe: false"
      echo
      echo "llm:"
      echo "  provider: \"${LLM_PROVIDER}\""
      echo "  base_url: \"${LLM_BASE_URL}\""
      if [[ -n "$LLM_API_KEY_VAL" ]]; then
        echo "  api_key: \"${LLM_API_KEY_VAL}\""
      else
        echo "  api_key: \"\"  # or set LLM_API_KEY in .env"
      fi
      echo "  model: \"${LLM_MODEL}\""
      echo "  max_tokens: 2048"
      echo "  temperature: 0.3"
      echo "  output_language: \"${LLM_OUTPUT_LANG}\""
      echo "  retry_attempts: 3"
      echo "  retry_base_delay: 1.0"
      echo "  retry_max_delay: 30.0"
      echo "  min_request_interval_ms: 0"
      echo "  request_timeout_seconds: 90.0"
      echo "  request_connect_timeout_seconds: 10.0"
      echo "  vision_model: \"\""
      echo
      echo "models:"
      echo "  whisper: \"${WHISPER_MODEL}\""
      echo "  text_embedding: \"intfloat/multilingual-e5-small\""
      echo "  clip: \"llm-jp/waon-siglip2-base-patch16-256\""
      echo "  blip: \"\""
      echo
      echo "search:"
      echo "  alpha: 0.7"
      echo "  default_limit: 20"
      echo "  max_limit: 100"
      echo "  min_score_clip: 0.05"
      echo "  min_score_clip_thumbnail: 0.05"
      echo
      echo "indexing:"
      echo "  reconciliation_interval: 3600"
      echo "  frame_extraction:"
      echo "    scene_threshold: 0.3"
      echo "    min_interval: 30"
      echo "    max_frames: 500"
      echo "  whisper:"
      echo "    min_segment_duration: 30"
      echo "    max_segment_duration: 60"
      echo "    beam_size: 1"
      echo "    batch_size: 0"
      echo "    condition_on_previous_text: true"
      echo "    compression_ratio_threshold: 2.0"
      echo "    no_speech_threshold: 0.45"
      echo "    log_prob_threshold: -1.0"
      echo "    initial_prompt: \"\""
      echo "  text_chunking:"
      echo "    max_chunk_size: 400"
      echo "    overlap: 80"
      echo
      echo "workers:"
      echo "  whisper_parallel: 1"
      echo "  clip_parallel: 2"
      echo "  metadata_batch_size: 32"
      echo "  clip_frame_batch_size: 50"
      echo
      echo "memory:"
      echo "  whisper_idle_unload: 300"
      echo "  blip_idle_unload: 300"
    } > "$SEARCH_CONFIG"
    ok "addons/intelligence/search-config.yml"
  fi
fi

# ── Update .env ───────────────────────────────────────────────────────────────

wrote_env=false

if [[ "$PORT" != "3000" ]]; then
  write_env_key "LITLOFT_PORT" "$PORT"
  wrote_env=true
fi

if [[ -n "$LLM_API_KEY_VAL" ]]; then
  write_env_key "LLM_API_KEY" "$LLM_API_KEY_VAL"
  wrote_env=true
fi

if [[ "$HAS_KNOWLEDGE" == "true" ]]; then
  [[ -n "$KNOWLEDGE_WEBHOOK_SECRET" ]] && { write_env_key "KNOWLEDGE_WEBHOOK_SECRET" "$KNOWLEDGE_WEBHOOK_SECRET"; wrote_env=true; }
  [[ -n "$CORE_INTERNAL_SECRET" ]] && { write_env_key "CORE_INTERNAL_SECRET" "$CORE_INTERNAL_SECRET"; wrote_env=true; }
fi

$wrote_env && ok ".env"

# ── Done ──────────────────────────────────────────────────────────────────────

echo
echo -e "${BOLD}${GREEN}Done.${RESET}"
echo
echo "  Next steps:"
echo "    docker compose up -d --build"
if [[ "$HAS_INTELLIGENCE" == "true" && "$LLM_PROVIDER" == "disabled" ]]; then
  echo
  warn "LLM is disabled. Edit addons/intelligence/search-config.yml"
  warn "to enable auto-tags / summaries / Ask when ready."
fi
echo
