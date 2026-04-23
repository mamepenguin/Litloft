# Development Guide

## Prerequisites

- Docker and Docker Compose (on Windows, use [Docker Desktop](https://www.docker.com/products/docker-desktop/) with WSL 2 backend)
- Node.js 22+ / pnpm (for frontend development)
- Git

> **Note**: The backend runs inside Docker. Local Python 3.14 is incompatible with pydantic, so local execution is not recommended.

## Environment Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd video_share
```

### 2. Configure drives

```bash
cp drives.json.example drives.json
```

Edit `docker-compose.yml` volume mounts as needed.

### 3. Start

```bash
docker compose up -d --build
```

Access at `http://localhost:3000`.

## Directory Structure

```
backend/
  app/
    main.py          # Entry point, startup scan, addon loader
    config.py        # drives.json reader, DATA_DIR
    database.py      # SQLAlchemy, migrations
    models.py        # ORM models
    schemas.py       # Pydantic schemas
    auth.py          # JWT auth, viewer_id management
    routers/         # API endpoints
    services/        # Business logic
  tests/             # pytest

frontend/
  src/
    app/             # Next.js App Router pages
    components/      # React components
    hooks/           # Custom hooks
    lib/             # Utilities
    i18n/            # next-intl config
    messages/        # Translation files (ja.json, en.json)
    types/           # TypeScript types
    addons/          # Addon frontend components
  server.js          # Custom Server (WebSocket proxy)

addons/              # Addons (independent Git repositories, not tracked here)
  cloud-sync/        # rclone-based cloud backup (scope=global)
  downloader/        # yt-dlp + LoftRef external URLs (scope=drive)
  podcast/           # RSS feed generation (scope=drive)
  intelligence/      # Semantic search, Ask, summaries, Whisper (external service, scope=drive)
  knowledge/         # Markdown Vaults + web clipping (external service, scope=drive)

docs/                # Documentation
deploy/              # Deploy scripts
```

## Scripts

### Frontend (`frontend/package.json`)

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `next dev` | Start dev server |
| `build` | `next build` | Production build |
| `start` | `next start` | Start production server |
| `lint` | `eslint` | Run ESLint |
| `test` | `vitest run` | Run unit tests |
| `test:watch` | `vitest` | Run tests in watch mode |
| `test:e2e` | `playwright test` | Run E2E tests |
| `test:e2e:report` | `playwright show-report` | Show E2E test report |

### Docker

| Command | Description |
|---------|-------------|
| `docker compose up -d --build` | Start containers (with build) |
| `docker compose logs -f backend` | Tail backend logs |
| `docker compose logs -f frontend` | Tail frontend logs |
| `docker compose down` | Stop containers |
| `docker compose restart backend` | Restart backend |

## Testing

### Backend Tests

Run inside Docker (local Python is incompatible with pydantic).

```bash
docker build -f backend/Dockerfile.test -t litloft-test backend/
docker run --rm litloft-test
```

### Frontend Unit Tests

```bash
cd frontend
pnpm test          # Single run
pnpm test:watch    # Watch mode
```

**Constraints:**
- Use Vitest **3.x** (4.x has rolldown native binding issues)
- Use jsdom **25.x** (29.x has ESM compatibility issues)

### E2E Tests

```bash
cd frontend
pnpm test:e2e
pnpm test:e2e:report  # Show report
```

## Configuration

No `.env` files are used. Configuration is managed through:

| Config | Method | Description |
|--------|--------|-------------|
| Drives | `drives.json` | Storage paths, names, readonly, access_group, per-drive addon policy |
| Access control | `passwords.json` | Password-to-group mappings |
| Event hooks | `event-hooks.json` | Addon event notification URLs (listener may declare `addon`/`feature` for drive-aware filtering) |
| Docker env | `docker-compose.yml` | `DRIVES_CONFIG`, `PASSWORDS_CONFIG`, `DATA_DIR` |
| Addon services | `docker-compose.override.yml` | External addon containers and per-container env (e.g. `INTELLIGENCE_SERVICE_URL`, `KNOWLEDGE_SERVICE_URL`) |

See [DRIVE-POLICY.md](DRIVE-POLICY.md) for the `drives.json` `addons` field and how per-drive toggles propagate through the system.

## Coding Conventions

### Backend

- Use `app.config` as a module reference (`from app.config import X` is forbidden)
- Path traversal prevention: fetch by ID from DB → `os.path.realpath()` → base_dir validation
- Atomic file writes: `.tmp` → `os.replace()` pattern

### Frontend

- Next.js 16: `params` is a `Promise` type (`await params` / `use(params)`)
- Home page (`/`) is a Server Component, drive/file pages are Client Components
- i18n: cookie-only routing (`NEXT_LOCALE`)

### General

- Immutability: always create new objects, never mutate
- Target 200-400 lines per file, 800 max
- Functions under 50 lines

## Addon Development

See [ADDON-DEVELOPMENT.md](ADDON-DEVELOPMENT.md) for the full addon development guide, including:

- In-process vs external service addons and the clean-separation principle
- Scope capability (`drive` / `global` / `both`) and per-drive policy
- UI slot system (search-modes, file-detail-sections, dashboard-widgets, folder-actions, sidebar-sections, loftref-player)
- `AddonSlot` component with lazy loading and addon name validation
- Generic Addon Proxy: `drive_access` / `current_drive_only` / `addon_feature` / `file_access` / `admin`
- `X-Lit-Drive` header contract
- Internal API for external service addons (accessible-drives, files, filter-file-ids, drive-policy)
- Core API surface and rules for in-process addons

For operator-side documentation on per-drive policy, see [DRIVE-POLICY.md](DRIVE-POLICY.md). For an intelligence-addon operations walkthrough (feature flags, LLM providers, memory tuning, eval harness), see [INTELLIGENCE.md](INTELLIGENCE.md).

### Addon Test Runs

Each external addon ships its own `Dockerfile.test` and can be tested in isolation:

```bash
# Intelligence addon tests
docker build -f addons/intelligence/Dockerfile.test -t intelligence-test addons/intelligence
docker run --rm intelligence-test

# Knowledge addon tests
docker build -f addons/knowledge/Dockerfile.test -t knowledge-test addons/knowledge
docker run --rm knowledge-test
```

In-process addons are exercised by the core backend test image (`backend/Dockerfile.test`) because their code is copied alongside `app/`.

## Git Workflow

```bash
# Create branch
git checkout -b feat/my-feature

# Commit (conventional commits)
git commit -m "feat: add new feature"

# Update on server
git pull && docker compose up -d --build
```

Commit message types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`
