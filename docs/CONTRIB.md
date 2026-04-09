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

addons/              # Addons (independent Git repositories)
  cloud-sync/
  downloader/
  podcast/
  semantic-search/

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
docker build -f backend/Dockerfile.test -t homevault-test backend/
docker run --rm homevault-test
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
| Drives | `drives.json` | Storage paths, names, readonly, access_group |
| Access control | `passwords.json` | Password-to-group mappings |
| Event hooks | `event-hooks.json` | Addon event notification URLs |
| Docker env | `docker-compose.yml` | `DRIVES_CONFIG`, `PASSWORDS_CONFIG`, `DATA_DIR` |

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

### In-Process Addons

1. Place code in `addons/{name}/backend/`
2. Export `router: APIRouter` in `router.py`
3. Optional: `ADDON_META` dict, `on_startup()` async function
4. Create symlink at `backend/addons/{name}` to enable

> **Windows**: Creating symlinks requires Developer Mode enabled or an elevated prompt. As an alternative, copy the directory instead of symlinking.

### Standalone Service Addons

1. Place Dockerfile in `addons/{name}/`
2. Add service in `docker-compose.override.yml`
3. Configure event notifications in `event-hooks.json`

See the "Addon System" section in `CLAUDE.md` for details.

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
